import { Bot, InlineKeyboard, Context } from "grammy";

let _bot: Bot | null = null;

export function getBot(): Bot {
  if (!_bot) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token || token.includes("your_")) {
      throw new Error("TELEGRAM_BOT_TOKEN is not configured");
    }
    _bot = new Bot(token);
  }
  return _bot;
}

// Helper to send a message to the configured chat
export async function sendMessage(chatId: string | number, text: string, options?: {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  replyMarkup?: InlineKeyboard;
}) {
  const bot = getBot();
  return bot.api.sendMessage(chatId, text, {
    parse_mode: options?.parseMode || "HTML",
    reply_markup: options?.replyMarkup,
  });
}

// Get the user's chat ID from env or settings
export function getConfiguredChatId(): string | null {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId || chatId === "auto" || chatId.includes("your_")) {
    return null;
  }
  return chatId;
}
