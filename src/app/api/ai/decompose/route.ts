import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createMilestone, createManyTasks, getProject, getMilestones, getTasks, updateProject } from "@/lib/db/queries";
import { FLOW_FRAMEWORK_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { syncProjectToNotion } from "@/lib/notion/sync";

export async function POST(request: Request) {
  try {
    const { projectId, title, description, deadline } = await request.json();

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes("your_")) {
      return NextResponse.json(
        { error: "CLAUDE_API_KEY is not set. Add it to your .env.local file." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({
      apiKey: apiKey,
    });

    const userPrompt = `Break down this project into milestones and tasks:

Project: ${title}
${description ? `Description: ${description}` : ""}
${deadline ? `Deadline: ${deadline}` : "No specific deadline"}

Return a valid JSON object with this exact structure (no markdown, no code fences, just pure JSON):
{
  "milestones": [
    {
      "title": "Milestone title",
      "description": "Brief description",
      "targetDate": "YYYY-MM-DD or null",
      "tasks": [
        {
          "title": "Verb-based task title",
          "description": "What this task involves",
          "estimatedMinutes": 30,
          "difficulty": 3,
          "priority": 4
        }
      ]
    }
  ]
}

Remember:
- Create 3-5 milestones
- 5-10 tasks per milestone
- Tasks ordered from easiest to hardest within each milestone
- First task of each milestone should be trivially easy (difficulty 1-3)
- All task titles must start with action verbs
- Estimated minutes should be one of: 15, 30, 45, 60, 90, 120
- Difficulty is 1-10 scale
- Priority is 1-5 scale (5 = highest)
${deadline ? `- Front-load milestone dates before the deadline: ${deadline}` : ""}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: FLOW_FRAMEWORK_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const responseText =
      message.content[0].type === "text" ? message.content[0].text : "";

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const data = JSON.parse(jsonStr.trim());

    // Save milestones and tasks to database
    for (let i = 0; i < data.milestones.length; i++) {
      const m = data.milestones[i];
      const milestone = await createMilestone({
        projectId,
        title: m.title,
        description: m.description || null,
        targetDate: m.targetDate || null,
        sortOrder: i,
        status: "pending",
        aiGenerated: true,
      });

      if (m.tasks && m.tasks.length > 0) {
        await createManyTasks(
          m.tasks.map(
            (
              t: {
                title: string;
                description?: string;
                estimatedMinutes?: number;
                difficulty?: number;
                priority?: number;
              },
              j: number
            ) => ({
              projectId,
              milestoneId: milestone.id,
              title: t.title,
              description: t.description || null,
              estimatedMinutes: t.estimatedMinutes || 30,
              difficulty: t.difficulty || 5,
              priority: t.priority || 3,
              status: "pending" as const,
              aiGenerated: true,
              sortOrder: j,
            })
          )
        );
      }
    }

    // Fire-and-forget Notion sync (don't block the response)
    if (process.env.NOTION_API_KEY && process.env.NOTION_PROJECTS_DB_ID) {
      (async () => {
        try {
          const project = await getProject(projectId);
          const allMilestones = await getMilestones(projectId);
          const allTasks = await getTasks(projectId);
          if (project) {
            const notionUrl = await syncProjectToNotion(project, allMilestones, allTasks);
            await updateProject(projectId, { notionPageUrl: notionUrl } as Parameters<typeof updateProject>[1]);
            console.log(`Notion sync complete for project ${projectId}: ${notionUrl}`);
          }
        } catch (notionErr) {
          console.error("Notion sync failed (non-blocking):", notionErr);
        }
      })();
    }

    return NextResponse.json({ success: true, milestoneCount: data.milestones.length });
  } catch (error) {
    console.error("AI decompose error:", error);
    return NextResponse.json(
      { error: "Failed to decompose project. Check your API key and try again." },
      { status: 500 }
    );
  }
}
