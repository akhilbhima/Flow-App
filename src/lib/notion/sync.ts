import { getNotionClient, getNotionProjectsDbId } from "./client";
import type { Project, Milestone, Task } from "@/lib/db/schema";

// Map Flow priority → Notion priority select option
const PRIORITY_MAP: Record<string, string> = {
  critical: "🔴 Urgent + Important",
  high: "🟡 Important",
  medium: "🟠 Urgent",
  low: "⚪ Neither",
};

/**
 * Create a full Notion project page with inline Tasks and Deliverables databases.
 *
 * Flow:
 * 1. Create a page in the master 📁 Projects database
 * 2. Create an inline Tasks database inside the page, populated with tasks
 * 3. Create an inline Deliverables database inside the page, with milestone→task hierarchy
 * 4. Return the Notion page URL
 */
export async function syncProjectToNotion(
  project: Project,
  milestones: Milestone[],
  tasks: Task[]
): Promise<string> {
  const notion = getNotionClient();
  const masterDbId = getNotionProjectsDbId();

  // ── Step 1: Create project page in master database ──
  const today = new Date().toISOString().split("T")[0];

  const projectPage = await notion.pages.create({
    parent: { database_id: masterDbId },
    properties: {
      "Project Name": {
        title: [{ text: { content: project.title } }],
      },
      Type: {
        select: { name: "Personal" },
      },
      Status: {
        select: { name: "Planning" },
      },
      Priority: {
        select: { name: PRIORITY_MAP[project.priority] || "🟠 Urgent" },
      },
      ...(project.description
        ? {
            Description: {
              rich_text: [
                {
                  text: {
                    content: project.description.slice(0, 2000), // Notion limit
                  },
                },
              ],
            },
          }
        : {}),
      "Start Date": {
        date: { start: today },
      },
      ...(project.deadline
        ? {
            "Due Date": {
              date: { start: project.deadline },
            },
          }
        : {}),
    },
    // Add page content: project overview
    children: [
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "Project Overview" } }],
        },
      },
      {
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [
            {
              text: {
                content: project.description || "No description provided.",
              },
            },
          ],
        },
      },
      {
        object: "block" as const,
        type: "divider" as const,
        divider: {},
      },
      {
        object: "block" as const,
        type: "heading_2" as const,
        heading_2: {
          rich_text: [{ text: { content: "Milestones" } }],
        },
      },
      // Add milestone summaries as a bulleted list
      ...milestones.map((m) => ({
        object: "block" as const,
        type: "bulleted_list_item" as const,
        bulleted_list_item: {
          rich_text: [
            {
              text: {
                content: `${m.title}${m.targetDate ? ` (target: ${m.targetDate})` : ""}`,
              },
            },
          ],
        },
      })),
      {
        object: "block" as const,
        type: "divider" as const,
        divider: {},
      },
    ],
  });

  const pageId = projectPage.id;
  const pageUrl =
    "url" in projectPage
      ? (projectPage as { url: string }).url
      : `https://notion.so/${pageId.replace(/-/g, "")}`;

  // ── Step 2: Create inline Tasks database ──
  // Collect unique milestone titles for Phase select options
  const phaseOptions = milestones.map((m) => ({
    name: m.title,
    color: "default" as const,
  }));

  const tasksDb = await notion.databases.create({
    parent: { type: "page_id", page_id: pageId },
    title: [{ text: { content: "Tasks" } }],
    is_inline: true,
    initial_data_source: {
      properties: {
        Name: { type: "title", title: {} },
        Status: {
          type: "select",
          select: {
            options: [
              { name: "Not started", color: "default" },
              { name: "In progress", color: "blue" },
              { name: "Done", color: "green" },
            ],
          },
        },
        Phase: {
          type: "select",
          select: {
            options:
              phaseOptions.length > 0
                ? phaseOptions
                : [{ name: "General", color: "default" as const }],
          },
        },
        Date: { type: "date", date: {} },
      },
    },
  });

  // Populate tasks in the Tasks database
  // Build a map of milestone ID → milestone for quick lookup
  const milestoneMap = new Map(milestones.map((m) => [m.id, m]));

  for (const task of tasks) {
    const milestone = task.milestoneId
      ? milestoneMap.get(task.milestoneId)
      : null;

    try {
      await notion.pages.create({
        parent: { database_id: tasksDb.id },
        properties: {
          Name: {
            title: [{ text: { content: task.title } }],
          },
          Status: {
            select: { name: "Not started" },
          },
          ...(milestone
            ? {
                Phase: {
                  select: { name: milestone.title },
                },
              }
            : {}),
          ...(milestone?.targetDate
            ? {
                Date: {
                  date: { start: milestone.targetDate },
                },
              }
            : {}),
        },
      });
    } catch (err) {
      console.error(`Failed to create Notion task "${task.title}":`, err);
    }
  }

  // ── Step 3: Create inline Deliverables database ──
  const deliverablesDb = await notion.databases.create({
    parent: { type: "page_id", page_id: pageId },
    title: [{ text: { content: "Deliverables" } }],
    is_inline: true,
    initial_data_source: {
      properties: {
        Name: { type: "title", title: {} },
      },
    },
  });

  // Get the data source ID from the database response to add self-relation
  const deliverablesDbFull = "data_sources" in deliverablesDb
    ? (deliverablesDb as { data_sources: Array<{ id: string }> })
    : null;
  const dataSourceId = deliverablesDbFull?.data_sources?.[0]?.id;

  // Add self-referencing relations using dataSources.update
  if (dataSourceId) {
    try {
      await notion.dataSources.update({
        data_source_id: dataSourceId,
        properties: {
          "Parent item": {
            relation: {
              data_source_id: dataSourceId,
              type: "dual_property",
              dual_property: {
                synced_property_name: "Sub-item",
              },
            },
          },
        },
      });
    } catch (err) {
      console.error("Failed to add self-relation to Deliverables DB:", err);
    }
  }

  // Populate deliverables: milestones as top-level, tasks as children
  const milestoneNotionIds = new Map<string, string>();

  // Create milestone deliverables first
  for (const milestone of milestones) {
    try {
      const mPage = await notion.pages.create({
        parent: { database_id: deliverablesDb.id },
        properties: {
          Name: {
            title: [{ text: { content: milestone.title } }],
          },
        },
      });
      milestoneNotionIds.set(milestone.id, mPage.id);
    } catch (err) {
      console.error(
        `Failed to create deliverable for milestone "${milestone.title}":`,
        err
      );
    }
  }

  // Create task deliverables, linked to their milestone parent
  if (dataSourceId) {
    for (const task of tasks) {
      if (!task.milestoneId) continue;
      const parentNotionId = milestoneNotionIds.get(task.milestoneId);
      if (!parentNotionId) continue;

      try {
        await notion.pages.create({
          parent: { database_id: deliverablesDb.id },
          properties: {
            Name: {
              title: [{ text: { content: task.title } }],
            },
            "Parent item": {
              relation: [{ id: parentNotionId }],
            },
          },
        });
      } catch (err) {
        console.error(
          `Failed to create deliverable for task "${task.title}":`,
          err
        );
      }
    }
  } else {
    // Fallback: create flat deliverables without parent-child relations
    for (const task of tasks) {
      if (!task.milestoneId) continue;
      const milestone = milestoneMap.get(task.milestoneId);
      try {
        await notion.pages.create({
          parent: { database_id: deliverablesDb.id },
          properties: {
            Name: {
              title: [{ text: { content: `${milestone ? milestone.title + " → " : ""}${task.title}` } }],
            },
          },
        });
      } catch (err) {
        console.error(
          `Failed to create deliverable for task "${task.title}":`,
          err
        );
      }
    }
  }

  return pageUrl;
}
