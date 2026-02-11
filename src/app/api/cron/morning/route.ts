import { NextResponse } from "next/server";
import { getUserSettings, getAllPendingTasks, getProjects } from "@/lib/db/queries";
import { sendMessage } from "@/lib/telegram/bot";
import { formatMorningMessage } from "@/lib/telegram/messages";
import { InlineKeyboard } from "grammy";

/**
 * Morning Notification Cron
 * Called daily at 8 AM via Vercel Cron
 * Sends the morning "Ready to flow?" message to Telegram
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (optional security for Vercel cron)
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // In dev mode, allow without secret
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get user settings for chat ID
    const settings = await getUserSettings();
    const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    if (!chatId || chatId === "auto" || chatId.includes("your_")) {
      return NextResponse.json(
        { error: "No Telegram chat ID configured. Send a message to your bot first." },
        { status: 400 }
      );
    }

    // Get task/project counts
    const pendingTasks = await getAllPendingTasks();
    const projectsList = await getProjects();
    const activeProjects = projectsList.filter((p) => p.status === "active");

    if (pendingTasks.length === 0) {
      await sendMessage(
        chatId,
        "Good morning! ☀️ You don't have any pending tasks. Head to the webapp to add some projects!"
      );
      return NextResponse.json({ sent: true, message: "No tasks reminder" });
    }

    // Build morning message with inline buttons
    const message = formatMorningMessage(pendingTasks.length, activeProjects.length);
    const keyboard = new InlineKeyboard()
      .text("🚀 I'm Starting!", "im_starting")
      .row()
      .text("4 hours", "hours_4")
      .text("6 hours", "hours_6")
      .text("8 hours", "hours_8");

    await sendMessage(chatId, message, { replyMarkup: keyboard });

    return NextResponse.json({
      sent: true,
      taskCount: pendingTasks.length,
      projectCount: activeProjects.length,
    });
  } catch (error) {
    console.error("[Cron] Morning notification error:", error);
    return NextResponse.json(
      { error: "Failed to send morning notification" },
      { status: 500 }
    );
  }
}
