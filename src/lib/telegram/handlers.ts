import {
  getUserSettings,
  upsertUserSettings,
  upsertDailyPlan,
  createTaskFeedback,
  saveConversationLog,
} from "@/lib/db/queries";
import type { ScheduledBlock } from "@/lib/scheduling/engine";
import {
  formatActivationPrepMessage,
} from "./messages";
import { processWithAI } from "./ai-actions";

// In-memory session state (per chat, persists during server lifetime)
interface SessionState {
  currentPlan: ScheduledBlock[] | null;
  currentBlockIndex: number;
  awaitingEnergyRating: boolean;
  awaitingActivationPrep: boolean;
  awaitingDifficultyRating: string | null; // task ID awaiting rating
  lastCompletedTaskTitle: string | null;
}

const sessions = new Map<string, SessionState>();

function getSession(chatId: string): SessionState {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, {
      currentPlan: null,
      currentBlockIndex: 0,
      awaitingEnergyRating: false,
      awaitingActivationPrep: false,
      awaitingDifficultyRating: null,
      lastCompletedTaskTitle: null,
    });
  }
  return sessions.get(chatId)!;
}

/**
 * Handle incoming text messages from the user.
 * ALL messages are routed through Claude AI with tool-use,
 * except for a few stateful inline-button follow-ups.
 */
export async function handleTextMessage(chatId: string, text: string): Promise<string> {
  const session = getSession(chatId);
  const lowerText = text.toLowerCase().trim();

  // Save chat ID to user settings if not already saved
  await saveChatIdIfNeeded(chatId);

  // Save conversation log
  const today = new Date().toISOString().split("T")[0];
  await saveConversationLog(today, "user", text).catch(() => {});

  // ---- Handle inline-button follow-up states first ----
  // These are direct responses to button prompts that don't need AI

  // Difficulty rating text response (after completing a task)
  if (session.awaitingDifficultyRating) {
    const rating = parseDifficultyFromText(lowerText);
    if (rating) {
      const taskId = session.awaitingDifficultyRating;
      session.awaitingDifficultyRating = null;
      await createTaskFeedback({ taskId, difficultyRating: rating });
      const response = getDifficultyAcknowledgment(rating, session.lastCompletedTaskTitle);
      await logBotResponse(today, response);
      return response;
    }
    // If they didn't rate, clear and process as normal through AI
    session.awaitingDifficultyRating = null;
  }

  // Energy rating text response (during EOD)
  if (session.awaitingEnergyRating) {
    const rating = parseInt(lowerText);
    if (rating >= 1 && rating <= 5) {
      session.awaitingEnergyRating = false;
      await upsertDailyPlan(today, { energyRating: rating });
      session.awaitingActivationPrep = true;
      const response = formatActivationPrepMessage();
      await logBotResponse(today, response);
      return response;
    }
    // If not a valid rating, clear and let AI handle
    session.awaitingEnergyRating = false;
  }

  // Activation prep text response
  if (session.awaitingActivationPrep) {
    session.awaitingActivationPrep = false;
    if (lowerText === "all done" || lowerText === "done") {
      const response = "Great job prepping for tomorrow! 🌟 You've reduced your activation energy. Sleep well and tomorrow will flow even better.";
      await logBotResponse(today, response);
      return response;
    }
    if (lowerText === "skip") {
      const response = "No worries. Rest up and we'll start fresh tomorrow! 🌙";
      await logBotResponse(today, response);
      return response;
    }
    // Otherwise fall through to AI
  }

  // ---- Route everything through Claude AI with tool-use ----
  try {
    const result = await processWithAI(userMessage(text, session), {
      currentPlan: session.currentPlan,
      currentBlockIndex: session.currentBlockIndex,
    });

    // Update plan state if AI generated a new plan
    if (result.planUpdate) {
      session.currentPlan = result.planUpdate.plan;
      session.currentBlockIndex = result.planUpdate.blockIndex;
    }

    // Check if AI completed a task (response mentions completion)
    // The AI handles this via complete_task tool, session updates happen there

    const response = result.response;
    await logBotResponse(today, response);
    return response;
  } catch (error) {
    console.error("AI processing error:", error);
    const response = "Sorry, I couldn't process that right now. Try again in a moment.";
    await logBotResponse(today, response);
    return response;
  }
}

/**
 * Build the user message with extra context hints for the AI
 */
function userMessage(text: string, session: SessionState): string {
  // Just pass the raw text — the AI system in ai-actions.ts
  // already has full context about projects, tasks, plan state, etc.
  return text;
}

/**
 * Handle callback queries from inline buttons.
 * These are direct actions that don't need AI routing.
 */
export async function handleCallbackQuery(chatId: string, data: string): Promise<string> {
  const session = getSession(chatId);
  const today = new Date().toISOString().split("T")[0];

  if (data === "im_starting") {
    // Route through AI to handle the "I'm starting" flow
    try {
      const result = await processWithAI(
        "I'm starting my day. Ask me how many hours I want to work.",
        { currentPlan: session.currentPlan, currentBlockIndex: session.currentBlockIndex }
      );
      if (result.planUpdate) {
        session.currentPlan = result.planUpdate.plan;
        session.currentBlockIndex = result.planUpdate.blockIndex;
      }
      await logBotResponse(today, result.response);
      return result.response;
    } catch {
      return "Let's go! 💪 How many hours do you want to work today?";
    }
  }

  if (data.startsWith("hours_")) {
    const hours = parseInt(data.replace("hours_", ""));
    try {
      const result = await processWithAI(
        `I want to work ${hours} hours today. Generate my plan.`,
        { currentPlan: session.currentPlan, currentBlockIndex: session.currentBlockIndex }
      );
      if (result.planUpdate) {
        session.currentPlan = result.planUpdate.plan;
        session.currentBlockIndex = result.planUpdate.blockIndex;
      }
      await logBotResponse(today, result.response);
      return result.response;
    } catch {
      return "Something went wrong generating your plan. Try typing the hours directly.";
    }
  }

  if (data.startsWith("start_block_")) {
    const blockNum = parseInt(data.replace("start_block_", ""));
    return await handleStartBlock(chatId, blockNum);
  }

  // Difficulty ratings from inline buttons
  if (data.startsWith("diff_")) {
    const parts = data.split("_");
    const taskId = parts[parts.length - 1];
    let rating: "too_easy" | "just_right" | "too_hard";

    if (data.includes("too_easy")) {
      rating = "too_easy";
    } else if (data.includes("just_right")) {
      rating = "just_right";
    } else {
      rating = "too_hard";
    }

    session.awaitingDifficultyRating = null;
    await createTaskFeedback({ taskId, difficultyRating: rating });
    const response = getDifficultyAcknowledgment(rating, session.lastCompletedTaskTitle);
    await logBotResponse(today, response);
    return response;
  }

  if (data.startsWith("energy_")) {
    const rating = parseInt(data.replace("energy_", ""));
    await upsertDailyPlan(today, { energyRating: rating });
    session.awaitingActivationPrep = true;
    const response = formatActivationPrepMessage();
    await logBotResponse(today, response);
    return response;
  }

  if (data === "procrastination") {
    return "Let's <b>lower the hurdle</b>. Tell me which task you're stuck on and I'll break it into tiny micro-steps that are impossible to resist starting. What's the task?";
  }

  if (data === "ambivalence") {
    return "That's a signal worth listening to. Should we <b>deprioritize</b> this task and move it to later, or <b>remove</b> it entirely? Or would you like to swap it for something that feels more meaningful right now?";
  }

  if (data === "skip_task") {
    return "Skipped for now. It'll be back in tomorrow's plan if still relevant. Moving on! 🏃";
  }

  return "I didn't understand that button press. Try typing what you need instead!";
}

// ============ DIRECT HANDLER FUNCTIONS (for inline button flows) ============

async function handleStartBlock(chatId: string, blockNum: number): Promise<string> {
  const session = getSession(chatId);
  if (!session.currentPlan) {
    return "No plan loaded. Tell me how many hours you want to work and I'll generate one!";
  }

  const blockIndex = blockNum - 1;
  if (blockIndex >= session.currentPlan.length) {
    return "All blocks completed for today! 🎉 Say 'eod' or 'end of day' for your review.";
  }

  session.currentBlockIndex = blockIndex;
  const block = session.currentPlan[blockIndex];

  const typeLabel = block.blockType === "deep_work" ? "🔥 Deep Work" : "💡 Shallow Work";
  let msg = `${typeLabel} — <b>Block ${block.blockNumber} started!</b>\n`;
  msg += `${block.startTime} → ${block.endTime}\n\n`;
  msg += `<b>Tasks:</b>\n`;

  for (let i = 0; i < block.tasks.length; i++) {
    const t = block.tasks[i];
    msg += `${i + 1}. ${t.task.title} (${t.task.estimatedMinutes} min)\n`;
  }

  msg += `\nStart with #1 — it's the easiest to get you rolling! Just tell me when you finish a task. 🎯`;
  return msg;
}

// ============ HELPERS ============

async function saveChatIdIfNeeded(chatId: string) {
  try {
    const settings = await getUserSettings();
    if (!settings || !settings.telegramChatId || settings.telegramChatId !== chatId) {
      await upsertUserSettings({ telegramChatId: chatId });
    }
  } catch (error) {
    console.error("Error saving chat ID:", error);
  }
}

function parseDifficultyFromText(text: string): "too_easy" | "just_right" | "too_hard" | null {
  if (text.includes("easy") || text === "1") return "too_easy";
  if (text.includes("right") || text.includes("good") || text.includes("perfect") || text === "2") return "just_right";
  if (text.includes("hard") || text.includes("difficult") || text.includes("tough") || text === "3") return "too_hard";
  return null;
}

function getDifficultyAcknowledgment(rating: "too_easy" | "just_right" | "too_hard", taskTitle: string | null): string {
  const title = taskTitle || "that task";
  switch (rating) {
    case "too_easy":
      return `😴 Noted — "${title}" was too easy. I'll calibrate future tasks to push you more into the flow zone. Keep going! 🎯`;
    case "just_right":
      return `🎯 Perfect! "${title}" hit the sweet spot. That's the 4% challenge-skill balance at work. 🔥`;
    case "too_hard":
      return `🤯 Got it — "${title}" was too hard. I'll adjust to find better-matched tasks. Next time, try telling me you're stuck and I'll break it down! 💪`;
  }
}

async function logBotResponse(date: string, response: string) {
  if (response) {
    await saveConversationLog(date, "assistant", response).catch(() => {});
  }
}
