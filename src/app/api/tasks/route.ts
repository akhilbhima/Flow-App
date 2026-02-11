import { NextResponse } from "next/server";
import { getTasks, getTasksByMilestone, createTask, createManyTasks } from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const milestoneId = searchParams.get("milestoneId");

    if (milestoneId) {
      const allTasks = await getTasksByMilestone(milestoneId);
      return NextResponse.json(allTasks);
    }

    if (projectId) {
      const allTasks = await getTasks(projectId);
      return NextResponse.json(allTasks);
    }

    return NextResponse.json(
      { error: "projectId or milestoneId is required" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Support bulk creation
    if (Array.isArray(body)) {
      const newTasks = await createManyTasks(
        body.map((t: Record<string, unknown>) => ({
          projectId: t.projectId as string,
          milestoneId: (t.milestoneId as string) || null,
          title: t.title as string,
          description: (t.description as string) || null,
          estimatedMinutes: (t.estimatedMinutes as number) || 30,
          difficulty: (t.difficulty as number) || 5,
          priority: (t.priority as number) || 3,
          status: "pending" as const,
          aiGenerated: (t.aiGenerated as boolean) || false,
          sortOrder: (t.sortOrder as number) || 0,
        }))
      );
      return NextResponse.json(newTasks, { status: 201 });
    }

    const task = await createTask({
      projectId: body.projectId,
      milestoneId: body.milestoneId || null,
      title: body.title,
      description: body.description || null,
      estimatedMinutes: body.estimatedMinutes || 30,
      difficulty: body.difficulty || 5,
      priority: body.priority || 3,
      status: "pending",
      aiGenerated: body.aiGenerated || false,
      sortOrder: body.sortOrder || 0,
    });
    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Error creating task:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
