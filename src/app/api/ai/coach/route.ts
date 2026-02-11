import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAllPendingTasks, getProjects } from "@/lib/db/queries";
import { FLOW_FRAMEWORK_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

/**
 * AI Coach Endpoint
 * Used by both the Telegram bot and the webapp for conversational coaching
 */
export async function POST(request: Request) {
  try {
    const { message, context } = await request.json();

    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey.includes("your_")) {
      return NextResponse.json(
        { error: "CLAUDE_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Build context
    const pendingTasks = await getAllPendingTasks();
    const projectsList = await getProjects();

    let contextStr = `Current state:\n`;
    contextStr += `- ${pendingTasks.length} pending tasks\n`;
    contextStr += `- ${projectsList.length} projects\n`;
    if (context) {
      contextStr += `- Additional context: ${context}\n`;
    }
    contextStr += `\nProjects: ${projectsList.map((p) => `${p.title} (${p.status})`).join(", ")}`;
    contextStr += `\n\nPending tasks (top 10): ${pendingTasks.slice(0, 10).map((t) => t.title).join(", ")}`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system:
        FLOW_FRAMEWORK_SYSTEM_PROMPT +
        `\n\nYou are the user's anti-procrastination coach. Be concise (under 200 words). ` +
        `Use the framework principles to help them. Be encouraging but practical. ` +
        `If they're stuck, help them lower the hurdle or break tasks down. ` +
        `If they report progress, celebrate it and suggest next steps.\n\n` +
        `Context: ${contextStr}`,
      messages: [{ role: "user", content: message }],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({ response: responseText });
  } catch (error) {
    console.error("AI coach error:", error);
    return NextResponse.json(
      { error: "Failed to get coaching response" },
      { status: 500 }
    );
  }
}
