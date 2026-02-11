import { Client } from "@notionhq/client";

let _notion: Client | null = null;

export function getNotionClient(): Client {
  if (!_notion) {
    const apiKey = process.env.NOTION_API_KEY;
    if (!apiKey) {
      throw new Error(
        "NOTION_API_KEY is not configured. Add it to your .env.local file."
      );
    }
    _notion = new Client({ auth: apiKey });
  }
  return _notion;
}

export function getNotionProjectsDbId(): string {
  const dbId = process.env.NOTION_PROJECTS_DB_ID;
  if (!dbId) {
    throw new Error(
      "NOTION_PROJECTS_DB_ID is not configured. Add it to your .env.local file."
    );
  }
  return dbId;
}
