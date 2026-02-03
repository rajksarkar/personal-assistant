import { prisma } from "../db";
import { extractOutcomeFromTranscript } from "./outcome-extraction";
import { broadcastOutcome } from "../ws/ui";
import { createCalendarEvent } from "./google-calendar";
import type { TaskStatus } from "../types";

export async function runOutcomeExtraction(taskId: string): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    await prisma.outcome.create({
      data: {
        taskId,
        summaryText: "Call completed; extraction skipped (no API key).",
        extractedFieldsJson: JSON.stringify({ needs_user_action: true }),
        needsUserAction: true,
      },
    });
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: "NEEDS_USER_ACTION" as TaskStatus },
      include: { outcome: true },
    });
    if (task.outcome) broadcastOutcome(taskId, task.outcome);
    return;
  }
  const events = await prisma.transcriptEvent.findMany({
    where: { taskId },
    orderBy: { ts: "asc" },
  });
  const transcriptText = events.map((e) => `[${e.speaker}] ${e.text}`).join("\n");
  if (!transcriptText.trim()) {
    await prisma.outcome.create({
      data: {
        taskId,
        summaryText: "No transcript.",
        extractedFieldsJson: JSON.stringify({ needs_user_action: true }),
        needsUserAction: true,
      },
    });
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status: "NEEDS_USER_ACTION" as TaskStatus },
      include: { outcome: true },
    });
    if (task.outcome) broadcastOutcome(taskId, task.outcome);
    return;
  }
  let summaryText: string;
  let extractedFieldsJson: string;
  let needsUserAction: boolean;
  try {
    const result = await extractOutcomeFromTranscript(transcriptText, apiKey);
    summaryText = result.summaryText;
    extractedFieldsJson = JSON.stringify(result.extractedFields);
    needsUserAction =
      (result.extractedFields.needs_user_action ?? false) ||
      (result.extractedFields.confidence ?? 0) < 0.7;
  } catch (e) {
    console.error("Outcome extraction error:", e);
    summaryText = "Extraction failed; review transcript.";
    extractedFieldsJson = JSON.stringify({ needs_user_action: true, needs_user_action_reason: "Extraction error" });
    needsUserAction = true;
  }
  const outcome = await prisma.outcome.create({
    data: {
      taskId,
      summaryText,
      extractedFieldsJson,
      needsUserAction,
    },
  });
  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      outcomeId: outcome.id,
      status: needsUserAction ? ("NEEDS_USER_ACTION" as TaskStatus) : ("COMPLETED" as TaskStatus),
    },
  });
  broadcastOutcome(taskId, { ...outcome, taskId: task.id });
  if (!needsUserAction && (outcome.extractedFieldsJson ? JSON.parse(outcome.extractedFieldsJson).datetime_start : false)) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    const user = await prisma.user.findFirst();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (task && user?.googleAccessToken && user?.googleRefreshToken && clientId && clientSecret) {
      try {
        const eventId = await createCalendarEvent(
          user.googleAccessToken,
          user.googleRefreshToken,
          clientId,
          clientSecret,
          task.contextName,
          outcome
        );
        await prisma.outcome.update({
          where: { id: outcome.id },
          data: { calendarEventId: eventId },
        });
      } catch (e) {
        console.error("Auto calendar create failed:", e);
      }
    }
  }
}
