import { NextResponse } from "next/server";

/**
 * Telegram Webhook Setup Endpoint
 * Call this once to register the webhook URL with Telegram
 *
 * GET /api/telegram/setup?url=https://your-domain.com
 *
 * In development, you'll need ngrok or similar to expose localhost
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseUrl = searchParams.get("url");

    if (!baseUrl) {
      return NextResponse.json({
        error: "Provide ?url=https://your-domain.com",
        usage: "GET /api/telegram/setup?url=https://your-vercel-app.vercel.app",
        info: "This registers the webhook with Telegram. For local dev, use ngrok.",
      });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token.includes("your_")) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 500 }
      );
    }

    const webhookUrl = `${baseUrl}/api/telegram/webhook`;

    // Set webhook
    const setResponse = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "callback_query"],
        }),
      }
    );

    const setResult = await setResponse.json();

    // Get webhook info for verification
    const infoResponse = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );
    const infoResult = await infoResponse.json();

    return NextResponse.json({
      setWebhook: setResult,
      webhookInfo: infoResult,
      webhookUrl,
    });
  } catch (error) {
    console.error("Webhook setup error:", error);
    return NextResponse.json(
      { error: "Failed to set up webhook" },
      { status: 500 }
    );
  }
}

/**
 * DELETE handler to remove the webhook (useful for local dev)
 */
export async function DELETE() {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://api.telegram.org/bot${token}/deleteWebhook`
    );
    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete webhook" },
      { status: 500 }
    );
  }
}
