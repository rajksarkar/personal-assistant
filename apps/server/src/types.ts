// SQLite doesn't support Prisma enums; we use strings and type them here.
export type TaskStatus =
  | "DRAFT"
  | "CALLING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "NEEDS_USER_ACTION";

export type TranscriptSpeaker = "ASSISTANT" | "OTHER_PARTY" | "SYSTEM";
