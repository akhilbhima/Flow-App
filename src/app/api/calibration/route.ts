import { NextResponse } from "next/server";
import { getTaskFeedbackWithDifficulty, getAllDailyPlanSummaries } from "@/lib/db/queries";
import { computeCalibrationProfile } from "@/lib/scheduling/challenge-skill";

/**
 * GET: Retrieve your current calibration profile
 * Returns skill level, ideal difficulty, confidence, energy patterns, streak
 */
export async function GET() {
  try {
    const feedbackData = await getTaskFeedbackWithDifficulty();
    const planData = await getAllDailyPlanSummaries();
    const profile = computeCalibrationProfile(feedbackData, planData);

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Calibration error:", error);
    return NextResponse.json(
      { error: "Failed to compute calibration profile" },
      { status: 500 }
    );
  }
}
