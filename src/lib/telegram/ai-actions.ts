import Anthropic from "@anthropic-ai/sdk";
import {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  getTasks,
  getAllPendingTasks,
  createTask,
  updateTask,
  deleteTask,
  getUserSettings,
  upsertUserSettings,
  upsertDailyPlan,
  getRecentConversationLogs,
  getTaskFeedbackWithDifficulty,
  getAllDailyPlanSummaries,
} from "@/lib/db/queries";
import { generateDailySchedule, resolveBlockDuration, type ScheduledBlock } from "@/lib/scheduling/engine";
import {
  computeCalibrationProfile,
} from "@/lib/scheduling/challenge-skill";
import { FLOW_FRAMEWORK_SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

// Define tools that Claude can call
const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_projects",
    description: "List all projects with their status, priority, and deadline",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "create_project",
    description: "Create a new project. Use this when the user wants to add a new project.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Project title" },
        description: { type: "string", description: "Project description (optional)" },
        deadline: { type: "string", description: "Deadline in YYYY-MM-DD format (optional)" },
        priority: { type: "string", enum: ["critical", "high", "medium", "low"], description: "Priority level (default: medium)" },
        block_duration_mode: { type: "string", enum: ["60", "90", "120", "auto", "custom"], description: "Work block duration mode for this project (default: 120)" },
        block_duration: { type: "number", description: "Custom block duration in minutes, used when mode is 'custom' (default: 120)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_project",
    description: "Update an existing project's title, description, deadline, priority, or status. First use list_projects to find the project ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project UUID" },
        title: { type: "string", description: "New title (optional)" },
        description: { type: "string", description: "New description (optional)" },
        deadline: { type: "string", description: "New deadline YYYY-MM-DD (optional)" },
        priority: { type: "string", enum: ["critical", "high", "medium", "low"], description: "New priority (optional)" },
        status: { type: "string", enum: ["active", "paused", "completed", "archived"], description: "New status (optional)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "delete_project",
    description: "Delete a project and all its milestones/tasks. Use with caution.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project UUID to delete" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks for a specific project, or list all pending tasks if no project specified.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID to list tasks for (optional — omit for all pending tasks)" },
      },
      required: [],
    },
  },
  {
    name: "add_task",
    description: "Add a new task to a project. The title should be verb-based and actionable per the flow framework.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "The project UUID to add the task to" },
        title: { type: "string", description: "Verb-based task title" },
        description: { type: "string", description: "Task description (optional)" },
        estimated_minutes: { type: "number", description: "Estimated duration in minutes (15, 30, 45, 60, 90, or 120). Default: 30" },
        difficulty: { type: "number", description: "Difficulty 1-10. Default: 5" },
        priority: { type: "number", description: "Priority 1-5 (5=highest). Default: 3" },
      },
      required: ["project_id", "title"],
    },
  },
  {
    name: "update_task",
    description: "Update a task's properties (title, status, priority, difficulty, estimated_minutes). First use list_tasks to find the task ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "The task UUID" },
        title: { type: "string", description: "New title (optional)" },
        status: { type: "string", enum: ["pending", "scheduled", "in_progress", "completed", "skipped"], description: "New status (optional)" },
        priority: { type: "number", description: "New priority 1-5 (optional)" },
        difficulty: { type: "number", description: "New difficulty 1-10 (optional)" },
        estimated_minutes: { type: "number", description: "New estimate in minutes (optional)" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed. Can find by task number in current block, or by name/ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "The task UUID (optional if using task_number)" },
        task_number: { type: "number", description: "The task number in the current block (optional if using task_id)" },
      },
      required: [],
    },
  },
  {
    name: "delete_task",
    description: "Delete a task permanently.",
    input_schema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "The task UUID to delete" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "generate_plan",
    description: "Generate a daily work plan for a given number of hours. Call this when the user says anything about wanting to work, start their day, how many hours, etc. Optionally focus on a specific project.",
    input_schema: {
      type: "object" as const,
      properties: {
        hours: { type: "number", description: "Number of hours to plan for (1-16)" },
        project_id: { type: "string", description: "Optional: focus on tasks from this project only. Use list_projects first to find the ID." },
      },
      required: ["hours"],
    },
  },
  {
    name: "get_status",
    description: "Get current status: projects, pending tasks, today's plan, calibration profile.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_profile",
    description: "Get the user's flow calibration profile (skill level, ideal difficulty, streak, energy patterns).",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "update_settings",
    description: "Update user preferences like block duration, break duration, notification times, timezone.",
    input_schema: {
      type: "object" as const,
      properties: {
        default_block_duration: { type: "number", description: "Block duration in minutes (e.g., 90, 120)" },
        break_duration: { type: "number", description: "Break duration in minutes (e.g., 10, 15, 20)" },
        timezone: { type: "string", description: "Timezone (e.g., America/New_York, America/Los_Angeles)" },
      },
      required: [],
    },
  },
  {
    name: "eod_review",
    description: "Trigger end-of-day review. Shows today's summary and asks for energy rating. Call when user says anything about ending their day, EOD, wrapping up, or reviewing their day.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "start_block",
    description: "Start a specific work block from the current plan. Use when the user wants to begin working on a block.",
    input_schema: {
      type: "object" as const,
      properties: {
        block_number: { type: "number", description: "The block number to start (1-based)" },
      },
      required: ["block_number"],
    },
  },
];

// Session state interface (imported from handlers but defined here for independence)
interface PlanState {
  currentPlan: ScheduledBlock[] | null;
  currentBlockIndex: number;
}

/**
 * Process a user message through Claude with tool-use.
 * Claude decides whether to take an action or just chat.
 * Returns the final response text.
 */
export async function processWithAI(
  userMessage: string,
  planState: PlanState,
): Promise<{ response: string; planUpdate?: { plan: ScheduledBlock[]; blockIndex: number } }> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.includes("your_")) {
    return { response: "AI is not available. Set your CLAUDE_API_KEY." };
  }

  const anthropic = new Anthropic({ apiKey });

  // Build context
  const projectsList = await getProjects();
  const pendingTasks = await getAllPendingTasks();
  const recentLogs = await getRecentConversationLogs(8);
  const conversationHistory = recentLogs
    .reverse()
    .map((log) => `${log.role}: ${log.message}`)
    .join("\n");

  let contextStr = `CURRENT STATE:\n`;
  contextStr += `- ${projectsList.length} projects: ${projectsList.map((p) => `"${p.title}" (${p.id}, ${p.status}, ${p.priority}${p.deadline ? ", deadline: " + p.deadline : ""}, blocks: ${p.blockDurationMode === "auto" ? "auto" : p.blockDurationMode === "custom" ? p.blockDuration + "min" : p.blockDurationMode + "min"})`).join("; ")}\n`;
  contextStr += `- ${pendingTasks.length} pending tasks\n`;

  if (planState.currentPlan) {
    contextStr += `- Active plan: ${planState.currentPlan.length} blocks\n`;
    contextStr += `- Current block: ${planState.currentBlockIndex + 1} of ${planState.currentPlan.length}\n`;
    const block = planState.currentPlan[planState.currentBlockIndex];
    if (block) {
      contextStr += `- Current block tasks:\n`;
      block.tasks.forEach((t, i) => {
        contextStr += `  ${i + 1}. "${t.task.title}" (id: ${t.task.id}, ${t.task.estimatedMinutes}min, difficulty: ${t.task.difficulty})\n`;
      });
    }
  }

  if (conversationHistory) {
    contextStr += `\nRECENT CHAT:\n${conversationHistory}\n`;
  }

  const systemPrompt = FLOW_FRAMEWORK_SYSTEM_PROMPT + `

You are the user's personal Telegram flow coach and assistant. You can take ACTIONS on their app (create projects, add tasks, update things, generate plans) AND provide coaching.

IMPORTANT RULES:
- Be concise. Telegram messages should be short (under 200 words).
- Use HTML formatting: <b>bold</b>, <i>italic</i>
- When the user asks to do something (add project, create task, change deadline, etc.), USE THE TOOLS to do it. Don't just tell them how.
- When they're chatting casually or asking for advice, respond conversationally without tools.
- When they mention wanting to work or ask about their day, generate a plan.
- When they say they finished something, complete the task.
- If you need to find a project/task ID, first call list_projects or list_tasks to look it up.
- If there's ambiguity about which project/task they mean, ask them to clarify.
- Today's date is ${new Date().toISOString().split("T")[0]}.

${contextStr}`;

  let planUpdate: { plan: ScheduledBlock[]; blockIndex: number } | undefined;

  try {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userMessage },
    ];

    // Loop to handle multi-step tool calls
    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOLS,
      messages,
    });

    // Process tool calls in a loop (Claude may chain multiple)
    while (response.stop_reason === "tool_use") {
      const assistantContent = response.content;
      messages.push({ role: "assistant", content: assistantContent });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of assistantContent) {
        if (block.type === "tool_use") {
          const result = await executeToolCall(block.name, block.input as Record<string, unknown>, planState);

          // Check if plan was generated
          if (block.name === "generate_plan" && result._plan) {
            planUpdate = { plan: result._plan as unknown as ScheduledBlock[], blockIndex: 0 };
            delete result._plan;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }

      messages.push({ role: "user", content: toolResults });

      response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });
    }

    // Extract final text response
    const textBlocks = response.content.filter((b) => b.type === "text");
    const finalText = textBlocks.map((b) => (b as Anthropic.TextBlock).text).join("\n");

    return { response: finalText || "Done! ✅", planUpdate };
  } catch (error) {
    console.error("AI action error:", error);
    return { response: "Sorry, something went wrong. Try again or type 'help'." };
  }
}

/**
 * Execute a tool call and return the result
 */
async function executeToolCall(
  toolName: string,
  input: Record<string, unknown>,
  planState: PlanState,
): Promise<Record<string, unknown>> {
  try {
    switch (toolName) {
      case "list_projects": {
        const projects = await getProjects();
        return {
          projects: projects.map((p) => ({
            id: p.id,
            title: p.title,
            status: p.status,
            priority: p.priority,
            deadline: p.deadline,
            description: p.description,
          })),
        };
      }

      case "create_project": {
        const mode = (input.block_duration_mode as string) || "120";
        const project = await createProject({
          title: input.title as string,
          description: (input.description as string) || null,
          deadline: (input.deadline as string) || null,
          priority: (input.priority as "critical" | "high" | "medium" | "low") || "medium",
          blockDurationMode: mode,
          blockDuration: mode === "custom"
            ? (input.block_duration as number) || 120
            : mode === "auto" ? 120 : parseInt(mode) || 120,
        });
        return { success: true, project: { id: project.id, title: project.title } };
      }

      case "update_project": {
        const data: Record<string, unknown> = {};
        if (input.title) data.title = input.title;
        if (input.description) data.description = input.description;
        if (input.deadline) data.deadline = input.deadline;
        if (input.priority) data.priority = input.priority;
        if (input.status) data.status = input.status;
        const updated = await updateProject(input.project_id as string, data);
        return { success: true, project: { id: updated.id, title: updated.title } };
      }

      case "delete_project": {
        await deleteProject(input.project_id as string);
        return { success: true, deleted: input.project_id };
      }

      case "list_tasks": {
        if (input.project_id) {
          const taskList = await getTasks(input.project_id as string);
          return {
            tasks: taskList.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              priority: t.priority,
              difficulty: t.difficulty,
              estimatedMinutes: t.estimatedMinutes,
            })),
          };
        }
        const pending = await getAllPendingTasks();
        return {
          tasks: pending.map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            difficulty: t.difficulty,
            estimatedMinutes: t.estimatedMinutes,
            projectId: t.projectId,
          })),
        };
      }

      case "add_task": {
        const task = await createTask({
          projectId: input.project_id as string,
          title: input.title as string,
          description: (input.description as string) || null,
          estimatedMinutes: (input.estimated_minutes as number) || 30,
          difficulty: (input.difficulty as number) || 5,
          priority: (input.priority as number) || 3,
          status: "pending",
          sortOrder: 0,
        });
        return { success: true, task: { id: task.id, title: task.title } };
      }

      case "update_task": {
        const taskData: Record<string, unknown> = {};
        if (input.title) taskData.title = input.title;
        if (input.status) taskData.status = input.status;
        if (input.priority) taskData.priority = input.priority;
        if (input.difficulty) taskData.difficulty = input.difficulty;
        if (input.estimated_minutes) taskData.estimatedMinutes = input.estimated_minutes;
        const updated = await updateTask(input.task_id as string, taskData);
        return { success: true, task: { id: updated.id, title: updated.title, status: updated.status } };
      }

      case "complete_task": {
        let taskId = input.task_id as string | undefined;

        // If task_number provided, look up from current block
        if (!taskId && input.task_number && planState.currentPlan) {
          const block = planState.currentPlan[planState.currentBlockIndex];
          const idx = (input.task_number as number) - 1;
          if (block && block.tasks[idx]) {
            taskId = block.tasks[idx].task.id;
            // Remove from block
            block.tasks.splice(idx, 1);
          }
        }

        if (!taskId) {
          return { error: "Could not find task. Provide a task_id or task_number." };
        }

        await updateTask(taskId, { status: "completed" });
        return { success: true, completed: taskId };
      }

      case "delete_task": {
        await deleteTask(input.task_id as string);
        return { success: true, deleted: input.task_id };
      }

      case "generate_plan": {
        const hours = input.hours as number;
        const projectId = input.project_id as string | undefined;

        // Get tasks — either for a specific project or all pending
        let pending;
        if (projectId) {
          pending = (await getTasks(projectId)).filter(
            (t) => t.status === "pending" || t.status === "scheduled"
          );
        } else {
          pending = await getAllPendingTasks();
        }

        if (pending.length === 0) {
          return { error: "No pending tasks. Add tasks first." };
        }

        const settings = await getUserSettings();
        const breakDuration = settings?.breakDuration || 15;

        // Resolve block duration from project settings (per-project)
        let blockDurationMode = "120";
        let customBlockDuration = 120;

        if (projectId) {
          // Single project — use that project's block duration
          const proj = await getProject(projectId);
          if (proj) {
            blockDurationMode = proj.blockDurationMode || "120";
            customBlockDuration = proj.blockDuration || 120;
          }
        } else {
          // Multiple projects — find the most common block duration mode
          // among projects that have pending tasks
          const projectIds = [...new Set(pending.map((t) => t.projectId))];
          const projectSettings: { mode: string; duration: number }[] = [];
          for (const pid of projectIds) {
            const proj = await getProject(pid);
            if (proj) {
              projectSettings.push({
                mode: proj.blockDurationMode || "120",
                duration: proj.blockDuration || 120,
              });
            }
          }
          if (projectSettings.length > 0) {
            // Use the most common mode among active projects
            const modeCount: Record<string, number> = {};
            for (const ps of projectSettings) {
              modeCount[ps.mode] = (modeCount[ps.mode] || 0) + 1;
            }
            const topMode = Object.entries(modeCount).sort((a, b) => b[1] - a[1])[0][0];
            blockDurationMode = topMode;
            const matching = projectSettings.find((ps) => ps.mode === topMode);
            customBlockDuration = matching?.duration || 120;
          }
        }

        // Load calibration
        let calibration = null;
        try {
          const feedback = await getTaskFeedbackWithDifficulty();
          const plans = await getAllDailyPlanSummaries();
          const profile = computeCalibrationProfile(feedback, plans);
          if (profile.confidence > 0) calibration = profile;
        } catch (e) {}

        // Resolve block duration based on mode (handles auto-decide)
        const blockDuration = resolveBlockDuration(
          blockDurationMode,
          customBlockDuration,
          calibration,
          pending,
        );

        const now = new Date();
        const minutes = Math.ceil(now.getMinutes() / 15) * 15;
        now.setMinutes(minutes, 0, 0);
        const startTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

        const blocks = generateDailySchedule(pending, {
          startTime,
          hoursRequested: hours,
          blockDurationMinutes: blockDuration,
          breakDurationMinutes: breakDuration,
          calibration,
        });

        const today = new Date().toISOString().split("T")[0];
        await upsertDailyPlan(today, { hoursRequested: hours, startedAt: new Date() });

        return {
          _plan: blocks,
          plan: blocks.map((b) => ({
            blockNumber: b.blockNumber,
            startTime: b.startTime,
            endTime: b.endTime,
            blockType: b.blockType,
            tasks: b.tasks.map((t, i) => ({
              number: i + 1,
              title: t.task.title,
              estimatedMinutes: t.task.estimatedMinutes,
              difficulty: t.task.difficulty,
            })),
          })),
          totalBlocks: blocks.length,
          totalTasks: blocks.reduce((sum, b) => sum + b.tasks.length, 0),
          blockDurationUsed: blockDuration,
        };
      }

      case "get_status": {
        const projects = await getProjects();
        const pending = await getAllPendingTasks();
        return {
          activeProjects: projects.filter((p) => p.status === "active").length,
          totalProjects: projects.length,
          pendingTasks: pending.length,
          hasPlan: !!planState.currentPlan,
          currentBlock: planState.currentPlan ? planState.currentBlockIndex + 1 : null,
          totalBlocks: planState.currentPlan ? planState.currentPlan.length : null,
        };
      }

      case "get_profile": {
        try {
          const feedback = await getTaskFeedbackWithDifficulty();
          const plans = await getAllDailyPlanSummaries();
          const profile = computeCalibrationProfile(feedback, plans);
          return { ...profile };
        } catch (e) {
          return { skillLevel: 5, idealDifficulty: 5.2, confidence: 0, dataPoints: 0 };
        }
      }

      case "update_settings": {
        const settingsData: Record<string, unknown> = {};
        if (input.default_block_duration) settingsData.defaultBlockDuration = input.default_block_duration;
        if (input.break_duration) settingsData.breakDuration = input.break_duration;
        if (input.timezone) settingsData.timezone = input.timezone;
        await upsertUserSettings(settingsData);
        return { success: true, updated: Object.keys(settingsData) };
      }

      case "eod_review": {
        const today = new Date().toISOString().split("T")[0];
        await upsertDailyPlan(today, { eodReviewCompleted: true });

        let completedCount = 0;
        let totalCount = 0;

        if (planState.currentPlan) {
          for (const block of planState.currentPlan) {
            totalCount += block.tasks.length;
          }
          // Tasks still in blocks are remaining (not completed)
          // completedCount = original total minus what's still left
          // Since we splice completed tasks, remaining = what's in blocks now
          const remainingTasks = planState.currentPlan.reduce((acc, b) => acc + b.tasks.length, 0);
          completedCount = totalCount > remainingTasks ? totalCount - remainingTasks : 0;
        }

        // Get calibration profile for streak info
        let streak = 0;
        try {
          const feedback = await getTaskFeedbackWithDifficulty();
          const plans = await getAllDailyPlanSummaries();
          const profile = computeCalibrationProfile(feedback, plans);
          streak = profile.currentStreak;
        } catch (e) {}

        return {
          success: true,
          date: today,
          completedTasks: completedCount,
          totalTasks: totalCount,
          streak,
          message: "EOD review recorded. Ask the user to rate their energy (1-5) and remind them to prep for tomorrow.",
        };
      }

      case "start_block": {
        const blockNum = input.block_number as number;
        if (!planState.currentPlan) {
          return { error: "No plan loaded. Generate a plan first." };
        }

        const blockIdx = blockNum - 1;
        if (blockIdx < 0 || blockIdx >= planState.currentPlan.length) {
          return { error: `Invalid block number. Plan has ${planState.currentPlan.length} blocks.` };
        }

        const block = planState.currentPlan[blockIdx];
        return {
          success: true,
          blockNumber: block.blockNumber,
          startTime: block.startTime,
          endTime: block.endTime,
          blockType: block.blockType,
          tasks: block.tasks.map((t, i) => ({
            number: i + 1,
            title: t.task.title,
            estimatedMinutes: t.task.estimatedMinutes,
            difficulty: t.task.difficulty,
            id: t.task.id,
          })),
          message: "Block started. Remind the user to start with task #1 (easiest first to lower the hurdle).",
        };
      }

      default:
        return { error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    console.error(`Tool ${toolName} error:`, error);
    return { error: `Failed to execute ${toolName}: ${(error as Error).message}` };
  }
}
