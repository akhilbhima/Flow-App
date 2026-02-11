import { NextResponse } from "next/server";
import { getProjects, createProject } from "@/lib/db/queries";

export async function GET() {
  try {
    const allProjects = await getProjects();
    return NextResponse.json(allProjects);
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = await createProject({
      title: body.title,
      description: body.description || null,
      deadline: body.deadline || null,
      priority: body.priority || "medium",
      status: "active",
      blockDurationMode: body.blockDurationMode || "120",
      blockDuration: body.blockDuration || 120,
    });
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("Error creating project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
