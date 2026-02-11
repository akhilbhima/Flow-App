import { NextResponse } from "next/server";
import { handleTextMessage, handleCallbackQuery } from "@/lib/telegram/handlers";
import { sendMessage } from "@/lib/telegram/bot";

/**
 * Telegram Webhook Handler
 * Receives updates from Telegram and processes them
 */
export async function POST(request: Request) {
  try {
    const update = await request.json();

    // Handle regular text messages
    if (update.message?.text) {
      const chatId = update.message.chat.id.toString();
      const text = update.message.text;

      console.log(`[Telegram] Message from ${chatId}: ${text}`);

      const response = await handleTextMessage(chatId, text);

      // If handler already sent a message (returned empty string), skip
      if (response) {
        await sendMessage(chatId, response);
      }
    }

    // Handle callback queries (inline button presses)
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id.toString();
      const data = update.callback_query.data;
      const callbackId = update.callback_query.id;

      console.log(`[Telegram] Callback from ${chatId}: ${data}`);

      // Answer the callback to remove the loading spinner
      try {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        await fetch(
          `https://api.telegram.org/bot${token}/answerCallbackQuery`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackId }),
          }
        );
      } catch (e) {
        // Not critical
      }

      const response = await handleCallbackQuery(chatId, data);

      if (response) {
        await sendMessage(chatId, response);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram] Webhook error:", error);
    // Always return 200 to Telegram to prevent retries
    return NextResponse.json({ ok: true });
  }
}

// GET handler for webhook verification
export async function GET() {
  return NextResponse.json({ status: "Telegram webhook is active" });
}
