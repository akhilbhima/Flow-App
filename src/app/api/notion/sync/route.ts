import { NextResponse } from "next/server";
import { getProject, getMilestones, getTasks, updateProject } from "@/lib/db/queries";
import { syncProjectToNotion } from "@/lib/notion/sync";

export async function POST(request: Request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }

    // Check if Notion is configured
    if (!process.env.NOTION_API_KEY || !process.env.NOTION_PROJECTS_DB_ID) {
      return NextResponse.json(
        { error: "Notion is not configured. Add NOTION_API_KEY and NOTION_PROJECTS_DB_ID to .env.local" },
        { status: 500 }
      );
    }

    // Fetch project data
    const project = await getProject(projectId);
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 }
      );
    }

    // Fetch milestones and tasks
    const [milestones, tasks] = await Promise.all([
      getMilestones(projectId),
      getTasks(projectId),
    ]);

    // Sync to Notion
    const notionUrl = await syncProjectToNotion(project, milestones, tasks);

    // Save the Notion URL back to the project
    await updateProject(projectId, { notionPageUrl: notionUrl } as Parameters<typeof updateProject>[1]);

    return NextResponse.json({
      success: true,
      notionUrl,
    });
  } catch (error) {
    console.error("Notion sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync project to Notion. Check your API key and permissions." },
      { status: 500 }
    );
  }
}
