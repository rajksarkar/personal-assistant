import { IncomingMessage } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { parse as parseUrl } from "url";
import { prisma } from "../db";
import type { TaskStatus } from "../types";

const taskIdToClients = new Map<string, Set<WebSocket>>();

function getTaskIdFromUrl(url: string): string | null {
  const { query } = parseUrl(url, true);
  const taskId = query.taskId;
  return typeof taskId === "string" ? taskId : null;
}

export function setupUIWebSocket(server: import("http").Server, wss: WebSocketServer): void {
  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const taskId = req.url ? getTaskIdFromUrl(req.url) : null;
    if (!taskId) {
      ws.close(4000, "taskId required");
      return;
    }
    if (!taskIdToClients.has(taskId)) taskIdToClients.set(taskId, new Set());
    taskIdToClients.get(taskId)!.add(ws);
    let mockInterval: ReturnType<typeof setInterval> | null = null;
    ws.on("close", () => {
      if (mockInterval) clearInterval(mockInterval);
      taskIdToClients.get(taskId)?.delete(ws);
      if (taskIdToClients.get(taskId)?.size === 0) taskIdToClients.delete(taskId);
    });
    // Send current status
    prisma.task.findUnique({ where: { id: taskId }, select: { status: true } }).then((task) => {
      if (task && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "status", payload: { status: task.status } }));
      }
      // Phase 1: mock transcript only when no real call in progress
      if (task?.status !== "CALLING" && task?.status !== "IN_PROGRESS") {
    let mockCount = 0;
    mockInterval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN || mockCount >= 4) {
        clearInterval(mockInterval);
        return;
      }
      mockCount++;
      const speakers = ["ASSISTANT", "OTHER_PARTY"] as const;
      const lines = [
        "Hello, this is an AI assistant calling on behalf of Raj.",
        "Hi, how can I help you?",
        "I'd like to make a reservation for two for tomorrow at 7 PM.",
        "Let me check availability... Yes, we have a table. May I have a name?",
      ];
      const i = mockCount - 1;
      const speaker = speakers[i % 2];
      prisma.transcriptEvent
        .create({
          data: { taskId, speaker, text: lines[i] ?? lines[0] },
        })
        .then((ev) => {
          broadcastToTask(taskId, {
            type: "transcript",
            payload: { id: ev.id, taskId: ev.taskId, ts: ev.ts.toISOString(), speaker: ev.speaker, text: ev.text },
          });
        })
        .catch(() => mockInterval && clearInterval(mockInterval));
    }, 2500);
      }
    });
  });
}

export function broadcastToTask(taskId: string, message: object): void {
  const clients = taskIdToClients.get(taskId);
  if (!clients) return;
  const raw = JSON.stringify(message);
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(raw);
  });
}

export function broadcastStatus(taskId: string, status: TaskStatus, failureReason?: string): void {
  broadcastToTask(taskId, { type: "status", payload: { status, failureReason } });
}

export function broadcastTranscript(taskId: string, event: { id: string; ts: string; speaker: string; text: string }): void {
  broadcastToTask(taskId, { type: "transcript", payload: event });
}

export function broadcastOutcome(taskId: string, outcome: object): void {
  broadcastToTask(taskId, { type: "outcome", payload: outcome });
}
