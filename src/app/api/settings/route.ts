import { NextResponse } from "next/server";
import { getUserSettings, upsertUserSettings } from "@/lib/db/queries";

/**
 * GET /api/settings - Fetch current user settings
 */
export async function GET() {
  try {
    const settings = await getUserSettings();
    return NextResponse.json(settings || {});
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

/**
 * PUT /api/settings - Update user settings
 */
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    const updated = await upsertUserSettings(data);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
