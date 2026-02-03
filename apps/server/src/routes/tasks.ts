import { Router } from "express";
import twilio from "twilio";
import { prisma } from "../db";
import type { TaskStatus } from "../types";

const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const TWILIO_FROM = process.env.TWILIO_FROM_NUMBER;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";

export const taskRoutes = Router();

taskRoutes.post("/tasks", async (req, res) => {
  try {
    const { contextName, contextPhone, contextNotes, instructionText } = req.body;
    if (!contextName || !contextPhone || !instructionText) {
      return res.status(400).json({ error: "contextName, contextPhone, and instructionText are required" });
    }
    const task = await prisma.task.create({
      data: {
        contextName,
        contextPhone,
        contextNotes: contextNotes ?? null,
        instructionText,
        status: "DRAFT",
      },
    });
    return res.json(task);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to create task" });
  }
});

// Twilio status callback is handled in index.ts at POST /api/twilio/status (before this router) so it's always reachable.

taskRoutes.get("/tasks", async (_req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      orderBy: { createdAt: "desc" },
      include: { outcome: true },
    });
    return res.json(tasks);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to list tasks" });
  }
});

taskRoutes.get("/tasks/:id", async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { transcriptEvents: { orderBy: { ts: "asc" } }, outcome: true },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });
    return res.json(task);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to fetch task" });
  }
});

taskRoutes.post("/tasks/:id/start-call", async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.status !== "DRAFT" && task.status !== "FAILED" && task.status !== "NEEDS_USER_ACTION") {
      return res.status(400).json({ error: "Task cannot start call in current state" });
    }
    await prisma.task.update({
      where: { id: req.params.id },
      data: { status: "CALLING" as TaskStatus },
    });
    if (!twilioClient || !TWILIO_FROM || !PUBLIC_BASE_URL) {
      return res.json({ ok: true, message: "Twilio not configured; set TWILIO_* and PUBLIC_BASE_URL" });
    }
    const base = PUBLIC_BASE_URL.replace(/\/$/, "");
    const twimlUrl = `${base}/api/twiml/stream?taskId=${task.id}`;
    const statusCallback = `${base}/api/twilio/status?taskId=${task.id}`;
    const call = await twilioClient.calls.create({
      to: task.contextPhone,
      from: TWILIO_FROM,
      url: twimlUrl,
      statusCallback,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });
    await prisma.task.update({
      where: { id: req.params.id },
      data: { twilioCallSid: call.sid },
    });
    return res.json({ ok: true, callSid: call.sid });
  } catch (e) {
    console.error(e);
    await prisma.task.update({
      where: { id: req.params.id },
      data: { status: "FAILED" as TaskStatus },
    }).catch(() => {});
    return res.status(500).json({ error: "Failed to start call" });
  }
});

taskRoutes.post("/tasks/:id/end-call", async (req, res) => {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (task.twilioCallSid && twilioClient) {
      try {
        await twilioClient.calls(task.twilioCallSid).update({ status: "completed" });
      } catch (twilioErr) {
        console.error("Twilio hangup:", twilioErr);
      }
    }
    const status = task.status === "CALLING" || task.status === "IN_PROGRESS" ? "COMPLETED" : task.status;
    await prisma.task.update({
      where: { id: req.params.id },
      data: { status: status as TaskStatus },
    });
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to end call" });
  }
});

taskRoutes.post("/tasks/:id/save-calendar", async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { outcome: true },
    });
    if (!task) return res.status(404).json({ error: "Task not found" });
    if (!task.outcome) return res.status(400).json({ error: "No outcome; complete a call first" });
    if (task.outcome.calendarEventId) return res.json({ ok: true, calendarEventId: task.outcome.calendarEventId });
    const user = await prisma.user.findFirst();
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!user?.googleAccessToken || !user.googleRefreshToken || !clientId || !clientSecret) {
      return res.status(400).json({ error: "Google not connected; sign in at GET /auth/google" });
    }
    const { createCalendarEvent } = await import("../services/google-calendar");
    const eventId = await createCalendarEvent(
      user.googleAccessToken,
      user.googleRefreshToken,
      clientId,
      clientSecret,
      task.contextName,
      task.outcome
    );
    await prisma.outcome.update({
      where: { id: task.outcome.id },
      data: { calendarEventId: eventId },
    });
    return res.json({ ok: true, calendarEventId: eventId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to save to calendar" });
  }
});
