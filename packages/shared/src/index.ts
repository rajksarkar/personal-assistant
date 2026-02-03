export type TaskStatus =
  | "DRAFT"
  | "CALLING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "NEEDS_USER_ACTION";

export type TranscriptSpeaker = "ASSISTANT" | "OTHER_PARTY" | "SYSTEM";

export interface Task {
  id: string;
  createdAt: string;
  contextName: string;
  contextPhone: string;
  contextNotes: string | null;
  instructionText: string;
  status: TaskStatus;
  twilioCallSid: string | null;
  outcomeId: string | null;
  outcome?: Outcome | null;
  transcriptEvents?: TranscriptEvent[];
}

export interface TranscriptEvent {
  id: string;
  taskId: string;
  ts: string;
  speaker: TranscriptSpeaker;
  text: string;
}

export interface ExtractedFields {
  reservation_name?: string;
  business_or_person?: string;
  datetime_start?: string;
  duration_minutes?: number;
  party_size?: number;
  confirmation_number?: string;
  address?: string;
  special_notes?: string;
  confidence?: number;
  needs_user_action?: boolean;
  needs_user_action_reason?: string;
}

export interface Outcome {
  id: string;
  taskId: string;
  summaryText: string | null;
  extractedFieldsJson: string | null;
  calendarEventId: string | null;
  needsUserAction: boolean;
  createdAt: string;
}

export interface CreateTaskInput {
  contextName: string;
  contextPhone: string;
  contextNotes?: string;
  instructionText: string;
}

export interface UIWebSocketMessage {
  type: "transcript" | "status" | "outcome";
  payload: TranscriptEvent | { status: TaskStatus } | Outcome;
}
