import { prisma } from "../db";
import { extractOutcomeFromTranscript } from "./outcome-extraction";
import { broadcastOutcome } from "../ws/ui";
import { createCalendarEvent, sendEmailSummary } from "./google-calendar";
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
  // Auto-create calendar event for reservations/appointments
  const extractedFields = outcome.extractedFieldsJson ? JSON.parse(outcome.extractedFieldsJson) : {};
  const hasDatetime = !!extractedFields.datetime_start;

  const taskForEmail = await prisma.task.findUnique({ where: { id: taskId } });
  const user = await prisma.user.findFirst();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!needsUserAction && hasDatetime) {
    if (taskForEmail && user?.googleAccessToken && user?.googleRefreshToken && clientId && clientSecret) {
      try {
        const eventId = await createCalendarEvent(
          user.googleAccessToken,
          user.googleRefreshToken,
          clientId,
          clientSecret,
          taskForEmail.contextName,
          outcome
        );
        await prisma.outcome.update({
          where: { id: outcome.id },
          data: { calendarEventId: eventId },
        });
        console.log("Calendar event created:", eventId);
      } catch (e) {
        console.error("Auto calendar create failed:", e);
      }
    }
  }

  // Send email summary for all completed calls
  if (taskForEmail && user?.googleAccessToken && user?.googleRefreshToken && user?.googleEmail && clientId && clientSecret) {
    try {
      const subject = `Call Summary: ${taskForEmail.contextName}`;
      const calendarNote = hasDatetime && !needsUserAction
        ? "\n\n📅 A calendar event has been automatically created for this reservation."
        : "";
      const body = [
        `Call to: ${taskForEmail.contextName}`,
        `Phone: ${taskForEmail.contextPhone}`,
        `Instruction: ${taskForEmail.instructionText}`,
        "",
        "--- Summary ---",
        outcome.summaryText || "No summary available.",
        "",
        "--- Extracted Details ---",
        extractedFields.reservation_name ? `Name: ${extractedFields.reservation_name}` : null,
        extractedFields.business_or_person ? `Business/Person: ${extractedFields.business_or_person}` : null,
        extractedFields.datetime_start ? `Date/Time: ${extractedFields.datetime_start}` : null,
        extractedFields.party_size ? `Party Size: ${extractedFields.party_size}` : null,
        extractedFields.confirmation_number ? `Confirmation #: ${extractedFields.confirmation_number}` : null,
        extractedFields.address ? `Address: ${extractedFields.address}` : null,
        extractedFields.special_notes ? `Notes: ${extractedFields.special_notes}` : null,
        calendarNote,
        "",
        "--- Full Transcript ---",
        transcriptText,
      ].filter(Boolean).join("\n");

      await sendEmailSummary(
        user.googleAccessToken,
        user.googleRefreshToken,
        clientId,
        clientSecret,
        user.googleEmail,
        subject,
        body
      );
      console.log("Email summary sent to:", user.googleEmail);
    } catch (e) {
      console.error("Email summary failed:", e);
    }
  }
}
