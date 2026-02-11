import type { ScheduledBlock } from "@/lib/scheduling/engine";

/**
 * Format the morning greeting message
 */
export function formatMorningMessage(pendingTaskCount: number, projectCount: number): string {
  const greeting = getTimeGreeting();
  return (
    `${greeting} Ready to flow today? 🚀\n\n` +
    `You have <b>${pendingTaskCount} tasks</b> across <b>${projectCount} projects</b> queued up.\n\n` +
    `When you're ready, tap <b>Start</b> or tell me how many hours you want to work today.`
  );
}

/**
 * Format a daily plan into a readable Telegram message
 */
export function formatPlanMessage(blocks: ScheduledBlock[], hoursRequested: number): string {
  if (blocks.length === 0) {
    return "No tasks to schedule! Add some tasks to your projects first.";
  }

  let msg = `📋 <b>Your plan for ${hoursRequested} hours:</b>\n\n`;
  let taskNum = 1;

  for (const block of blocks) {
    const typeLabel = block.blockType === "deep_work" ? "🔥 Deep Work" : "💡 Shallow Work";
    msg += `<b>${typeLabel} — Block ${block.blockNumber}</b> (${block.startTime}–${block.endTime})\n`;

    for (const st of block.tasks) {
      const mins = st.task.estimatedMinutes;
      msg += `  ${taskNum}. ${st.task.title} (${mins} min)\n`;
      taskNum++;
    }
    msg += `\n`;
  }

  const totalTasks = blocks.reduce((acc, b) => acc + b.tasks.length, 0);
  msg += `<b>Total:</b> ${totalTasks} tasks in ${blocks.length} blocks\n`;
  msg += `Breaks: 15 min between each block.\n`;
  msg += `First task is easy to get you rolling. 💪`;

  return msg;
}

/**
 * Format a block start message
 */
export function formatBlockStartMessage(block: ScheduledBlock): string {
  const typeLabel = block.blockType === "deep_work" ? "🔥 Deep Work" : "💡 Shallow Work";
  let msg = `${typeLabel} — <b>Block ${block.blockNumber} started!</b>\n`;
  msg += `${block.startTime} → ${block.endTime} (${block.totalMinutes} min)\n\n`;
  msg += `<b>Tasks:</b>\n`;

  for (let i = 0; i < block.tasks.length; i++) {
    const t = block.tasks[i];
    msg += `${i + 1}. ${t.task.title} (${t.task.estimatedMinutes} min)\n`;
  }

  msg += `\nStart with the first one — it's the easiest. You've got this! 🎯`;
  return msg;
}

/**
 * Format task completion confirmation
 */
export function formatTaskDoneMessage(taskTitle: string, remainingInBlock: number): string {
  if (remainingInBlock === 0) {
    return `✅ <b>${taskTitle}</b> — Done!\n\nThat's the block complete! Take a 15-min break. ☕`;
  }
  return `✅ <b>${taskTitle}</b> — Done!\n\n${remainingInBlock} task${remainingInBlock > 1 ? "s" : ""} left in this block. Keep the momentum! 🔥`;
}

/**
 * Format EOD review message
 */
export function formatEODMessage(
  completedCount: number,
  totalCount: number,
  skippedCount: number
): string {
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  let msg = `🌙 <b>End of Day Check-in</b>\n\n`;
  msg += `Today's results:\n`;
  msg += `✅ ${completedCount}/${totalCount} tasks completed (${pct}%)\n`;
  if (skippedCount > 0) {
    msg += `⏭️ ${skippedCount} tasks moved to tomorrow\n`;
  }
  msg += `\nHow was your energy today?`;
  return msg;
}

/**
 * Format activation energy checklist
 */
export function formatActivationPrepMessage(): string {
  return (
    `🔋 <b>Activation Energy Prep</b>\n\n` +
    `Prep for tomorrow (reduces startup friction):\n\n` +
    `☐ Workspace clean?\n` +
    `☐ Tomorrow's first file/doc open?\n` +
    `☐ Phone on silent spot?\n` +
    `☐ Water bottle filled?\n\n` +
    `Type "all done" when finished, or "skip" to pass.`
  );
}

/**
 * Format coaching response for when user is stuck
 */
export function formatStuckMessage(taskTitle: string): string {
  return (
    `I hear you're stuck on "<b>${taskTitle}</b>". Let's figure this out:\n\n` +
    `Is this <b>procrastination</b> or <b>ambivalence</b>?\n\n` +
    `🧊 <b>Procrastination</b>: "I know I need to do it but can't start"\n` +
    `→ Let me lower the hurdle. We'll break it into micro-steps.\n\n` +
    `🤔 <b>Ambivalence</b>: "I'm not sure I should do this at all"\n` +
    `→ Maybe this task doesn't belong in your priorities right now.`
  );
}

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning! ☀️";
  if (hour < 17) return "Good afternoon! 🌤️";
  return "Good evening! 🌙";
}
