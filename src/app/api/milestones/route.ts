import { NextResponse } from "next/server";
import { getMilestones, createMilestone } from "@/lib/db/queries";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 }
      );
    }
    const allMilestones = await getMilestones(projectId);
    return NextResponse.json(allMilestones);
  } catch (error) {
    console.error("Error fetching milestones:", error);
    return NextResponse.json(
      { error: "Failed to fetch milestones" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const milestone = await createMilestone({
      projectId: body.projectId,
      title: body.title,
      description: body.description || null,
      targetDate: body.targetDate || null,
      sortOrder: body.sortOrder || 0,
      status: "pending",
      aiGenerated: body.aiGenerated || false,
    });
    return NextResponse.json(milestone, { status: 201 });
  } catch (error) {
    console.error("Error creating milestone:", error);
    return NextResponse.json(
      { error: "Failed to create milestone" },
      { status: 500 }
    );
  }
}
