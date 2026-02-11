import { NextResponse } from "next/server";
import { getUserSettings } from "@/lib/db/queries";
import { sendMessage } from "@/lib/telegram/bot";
import { InlineKeyboard } from "grammy";

/**
 * End of Day Reminder Cron
 * Called daily at the user's configured EOD time (default 9 PM)
 * Sends a gentle reminder to do EOD review
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Get user settings for chat ID
    const settings = await getUserSettings();
    const chatId = settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    if (!chatId || chatId === "auto" || chatId.includes("your_")) {
      return NextResponse.json(
        { error: "No Telegram chat ID configured." },
        { status: 400 }
      );
    }

    const message =
      `🌙 <b>End of Day Reminder</b>\n\n` +
      `Time to wrap up! Say <b>"eod"</b> to start your end-of-day review.\n\n` +
      `This helps track your progress and prep for tomorrow. 📊`;

    const keyboard = new InlineKeyboard().text("📊 Start EOD Review", "eod_review");

    await sendMessage(chatId, message, { replyMarkup: keyboard });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("[Cron] EOD notification error:", error);
    return NextResponse.json(
      { error: "Failed to send EOD notification" },
      { status: 500 }
    );
  }
}
