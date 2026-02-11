/**
 * Local Telegram Bot Polling Script
 *
 * Run this for local development instead of webhooks:
 *   npx tsx src/scripts/telegram-poll.ts
 *
 * This polls Telegram for updates and forwards them to your local API
 */

import dotenv from "dotenv";
import path from "path";

// Load .env.local explicitly (dotenv/config only loads .env by default)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const LOCAL_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

if (!BOT_TOKEN || BOT_TOKEN.includes("your_")) {
  console.error("❌ TELEGRAM_BOT_TOKEN not set in .env.local");
  process.exit(1);
}

console.log("🤖 Flow Bot polling started...");
console.log(`   Forwarding to: ${LOCAL_URL}/api/telegram/webhook`);
console.log("   Send a message to your bot on Telegram to test!\n");

// First, delete any existing webhook so polling works
async function deleteWebhook() {
  const resp = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
  const data = await resp.json();
  console.log("Webhook cleared:", data.ok ? "✅" : "❌");
}

let offset = 0;

async function poll() {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${offset}&timeout=30`,
      { signal: AbortSignal.timeout(35000) }
    );
    const data = await resp.json();

    if (data.ok && data.result.length > 0) {
      for (const update of data.result) {
        offset = update.update_id + 1;

        // Log the update
        if (update.message?.text) {
          const chatId = update.message.chat.id;
          console.log(`📨 Message from chat ${chatId}: "${update.message.text}"`);

          // Save chat ID to .env hint
          console.log(`   💡 Your Chat ID is: ${chatId}`);
        }
        if (update.callback_query) {
          console.log(`🔘 Button press: "${update.callback_query.data}"`);
        }

        // Forward to local webhook handler
        try {
          const webhookResp = await fetch(`${LOCAL_URL}/api/telegram/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(update),
          });

          if (webhookResp.ok) {
            console.log(`   ✅ Processed successfully`);
          } else {
            const errorText = await webhookResp.text();
            console.log(`   ❌ Handler error: ${webhookResp.status} - ${errorText}`);
          }
        } catch (err) {
          console.log(`   ❌ Could not reach local server. Is 'npm run dev' running?`);
        }
      }
    }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (!errMsg.includes("abort")) {
      console.error("Poll error:", errMsg);
    }
  }

  // Poll again
  setTimeout(poll, 500);
}

// Start
deleteWebhook().then(() => {
  console.log("Polling for updates...\n");
  poll();
});
