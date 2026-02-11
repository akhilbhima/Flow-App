import { NextResponse } from "next/server";
import { getAllPendingTasks, getProjects, getProject, getUserSettings, upsertDailyPlan } from "@/lib/db/queries";
import { generateDailySchedule, resolveBlockDuration } from "@/lib/scheduling/engine";
import { computeCalibrationProfile } from "@/lib/scheduling/challenge-skill";
import { getTaskFeedbackWithDifficulty, getAllDailyPlanSummaries } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const startTime = body.startTime || "09:00";
    const breakDuration = body.breakDuration || 15;

    // Support two modes: "hours" or "wrapUpBy" time
    let hoursRequested: number;
    if (body.wrapUpBy) {
      // Calculate hours from start time to wrap-up time
      const [startH, startM] = startTime.split(":").map(Number);
      const [endH, endM] = body.wrapUpBy.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const totalMinutes = endMinutes > startMinutes
        ? endMinutes - startMinutes
        : (24 * 60 - startMinutes) + endMinutes; // handle wrap past midnight
      hoursRequested = Math.max(1, totalMinutes / 60);
    } else {
      hoursRequested = body.hours || 6;
    }

    // Get all pending tasks
    const pendingTasks = await getAllPendingTasks();

    if (pendingTasks.length === 0) {
      return NextResponse.json(
        { error: "No pending tasks. Add some tasks to your projects first." },
        { status: 400 }
      );
    }

    // Resolve block duration from project settings (per-project, pick most common)
    const settings = await getUserSettings();
    let blockDurationMode = "120";
    let customBlockDuration = 120;

    const projectIds = [...new Set(pendingTasks.map((t) => t.projectId))];
    const projectSettings: { mode: string; duration: number }[] = [];
    for (const pid of projectIds) {
      const proj = await getProject(pid);
      if (proj) {
        projectSettings.push({
          mode: proj.blockDurationMode || "120",
          duration: proj.blockDuration || 120,
        });
      }
    }
    if (projectSettings.length > 0) {
      const modeCount: Record<string, number> = {};
      for (const ps of projectSettings) {
        modeCount[ps.mode] = (modeCount[ps.mode] || 0) + 1;
      }
      const topMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0][0];
      blockDurationMode = topMode;
      const matching = projectSettings.find((ps) => ps.mode === topMode);
      customBlockDuration = matching?.duration || 120;
    }

    // Load calibration for auto-decide
    let calibration = null;
    try {
      const feedback = await getTaskFeedbackWithDifficulty();
      const plans = await getAllDailyPlanSummaries();
      const profile = computeCalibrationProfile(feedback, plans);
      if (profile.confidence > 0) calibration = profile;
    } catch (e) {}

    const blockDuration = body.blockDuration
      || resolveBlockDuration(blockDurationMode, customBlockDuration, calibration, pendingTasks);

    // Generate schedule
    const blocks = generateDailySchedule(pendingTasks, {
      startTime,
      hoursRequested,
      blockDurationMinutes: blockDuration,
      breakDurationMinutes: breakDuration,
      calibration,
    });

    // Save daily plan
    const today = new Date().toISOString().split("T")[0];
    await upsertDailyPlan(today, {
      hoursRequested: Math.round(hoursRequested),
      startedAt: new Date(),
    });

    return NextResponse.json({
      date: today,
      hoursRequested: Math.round(hoursRequested * 10) / 10,
      startTime,
      wrapUpBy: body.wrapUpBy || null,
      blockDuration,
      breakDuration,
      blocks,
      totalTasks: blocks.reduce((acc, b) => acc + b.tasks.length, 0),
      totalBlocks: blocks.length,
    });
  } catch (error) {
    console.error("Plan generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate plan" },
      { status: 500 }
    );
  }
}

// GET: retrieve today's schedule (regenerate if needed)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "6");
    const startTime = searchParams.get("startTime") || "09:00";
    const blockDuration = parseInt(searchParams.get("blockDuration") || "120");
    const breakDuration = parseInt(searchParams.get("breakDuration") || "15");

    const pendingTasks = await getAllPendingTasks();

    if (pendingTasks.length === 0) {
      return NextResponse.json({
        date: new Date().toISOString().split("T")[0],
        hoursRequested: hours,
        blocks: [],
        totalTasks: 0,
        totalBlocks: 0,
      });
    }

    const blocks = generateDailySchedule(pendingTasks, {
      startTime,
      hoursRequested: hours,
      blockDurationMinutes: blockDuration,
      breakDurationMinutes: breakDuration,
    });

    return NextResponse.json({
      date: new Date().toISOString().split("T")[0],
      hoursRequested: hours,
      blocks,
      totalTasks: blocks.reduce((acc, b) => acc + b.tasks.length, 0),
      totalBlocks: blocks.length,
    });
  } catch (error) {
    console.error("Plan fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch plan" },
      { status: 500 }
    );
  }
}
