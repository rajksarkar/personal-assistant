import WebSocket from "ws";
import { IncomingMessage } from "http";
import { prisma } from "../db";
import { broadcastStatus, broadcastTranscript } from "./ui";
import { runOutcomeExtraction } from "../services/outcome-runner";
import type { TaskStatus, TranscriptSpeaker } from "../types";

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview";

const SYSTEM_INSTRUCTIONS = `You are Raj's personal AI assistant making a phone call. This could be ANY type of call - reminders to friends/family, thank you messages, scheduling, or anything else.

When the call connects, start with: "Hello, this is an AI assistant calling on behalf of Raj."

Then IMMEDIATELY deliver the specific message or task described in the INSTRUCTION section below. Do exactly what the instruction says - nothing more, nothing less.

Rules:
- Be concise, polite, and friendly
- Do NOT assume this is about reservations or appointments unless the instruction says so
- Follow the INSTRUCTION exactly as written
- Do not say "Sure" or acknowledge prompts - speak directly to the person`;

interface TwilioMessage {
  event: string;
  streamSid?: string;
  start?: {
    customParameters?: Record<string, string>;
    callSid?: string;
  };
  media?: { payload?: string; track?: string };
}

interface OpenAIMessage {
  type: string;
  delta?: string;
  stream_sid?: string;
  item?: { role?: string; content?: Array<{ type?: string; transcript?: string; text?: string }> };
  response?: { output?: unknown[] };
}

function buildTaskPrompt(contextName: string, contextPhone: string, contextNotes: string | null, instructionText: string): string {
  return `
---
CALL RECIPIENT: ${contextName}
PHONE: ${contextPhone}
NOTES: ${contextNotes ?? "None"}

INSTRUCTION (do exactly this):
${instructionText}
---`;
}

export function handleTwilioMediaConnection(ws: WebSocket, req: IncomingMessage): void {
  let taskId: string | null = null;
  let streamSid: string | null = null;
  let callSid: string | null = null;
  let openAiWs: WebSocket | null = null;
  let assistantTranscriptBuffer = "";

  function sendToTwilio(obj: object) {
    if (ws.readyState === ws.OPEN && streamSid) {
      ws.send(JSON.stringify(obj));
    }
  }

  ws.on("message", (data: Buffer) => {
    try {
      const msg = JSON.parse(data.toString()) as TwilioMessage;
      if (msg.event === "connected") {
        return;
      }
      if (msg.event === "start") {
        taskId = msg.start?.customParameters?.taskId ?? null;
        streamSid = msg.streamSid ?? null;
        callSid = msg.start?.callSid ?? null;
        if (!taskId || !callSid || !streamSid) return;

        prisma.task
          .update({
            where: { id: taskId },
            data: { status: "IN_PROGRESS" as TaskStatus, twilioCallSid: callSid },
          })
          .then(() => broadcastStatus(taskId!, "IN_PROGRESS"))
          .then(() => prisma.task.findUnique({ where: { id: taskId! } }))
          .then((task) => {
            if (!task || !process.env.OPENAI_API_KEY) return;
            const taskPrompt = buildTaskPrompt(
              task.contextName,
              task.contextPhone,
              task.contextNotes,
              task.instructionText
            );
            openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
              headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
              },
            });

            let sessionConfigured = false;

            openAiWs.on("open", () => {
              console.log("OpenAI WebSocket connected, sending session config...");
              console.log("Instructions:", SYSTEM_INSTRUCTIONS + "\n\n" + taskPrompt);
              const sessionUpdate = {
                type: "session.update",
                session: {
                  modalities: ["audio", "text"],
                  input_audio_format: "g711_ulaw",
                  output_audio_format: "g711_ulaw",
                  voice: "alloy",
                  instructions: SYSTEM_INSTRUCTIONS + "\n\n" + taskPrompt,
                  turn_detection: {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 300,
                    silence_duration_ms: 500,
                  },
                  input_audio_transcription: {
                    model: "whisper-1",
                  },
                },
              };
              openAiWs!.send(JSON.stringify(sessionUpdate));
            });

            openAiWs.on("message", (openAiData: Buffer) => {
              try {
                const response = JSON.parse(openAiData.toString()) as OpenAIMessage;

                // Debug: log all message types
                if (response.type !== "response.audio.delta") {
                  console.log("OpenAI:", response.type);
                }

                // Wait for session to be configured before starting
                if (response.type === "session.updated" && !sessionConfigured) {
                  sessionConfigured = true;
                  console.log("Session configured, triggering initial response...");
                  openAiWs!.send(JSON.stringify({ type: "response.create" }));
                }

                if (response.type === "error") {
                  console.error("OpenAI error:", JSON.stringify(response));
                }

                if (response.type === "response.audio.delta" && response.delta) {
                  sendToTwilio({
                    event: "media",
                    streamSid,
                    media: { payload: response.delta },
                  });
                }
                if (response.type === "response.audio_transcript.delta" && response.delta) {
                  assistantTranscriptBuffer += response.delta;
                }
                if (response.type === "response.audio_transcript.done") {
                  const text = (response as { transcript?: string }).transcript ?? assistantTranscriptBuffer;
                  assistantTranscriptBuffer = "";
                  if (text && taskId) {
                    prisma.transcriptEvent
                      .create({
                        data: { taskId, speaker: "ASSISTANT" as TranscriptSpeaker, text },
                      })
                      .then((ev) => {
                        broadcastTranscript(taskId!, {
                          id: ev.id,
                          taskId: ev.taskId,
                          ts: ev.ts.toISOString(),
                          speaker: ev.speaker,
                          text: ev.text,
                        });
                      })
                      .catch((e) => console.error("persist transcript:", e));
                  }
                }
                // Handle user speech transcription
                if (response.type === "conversation.item.input_audio_transcription.completed") {
                  const transcript = (response as { transcript?: string }).transcript;
                  if (transcript && taskId) {
                    prisma.transcriptEvent
                      .create({
                        data: { taskId, speaker: "OTHER_PARTY" as TranscriptSpeaker, text: transcript },
                      })
                      .then((ev) => {
                        broadcastTranscript(taskId!, {
                          id: ev.id,
                          taskId: ev.taskId,
                          ts: ev.ts.toISOString(),
                          speaker: ev.speaker,
                          text: ev.text,
                        });
                      })
                      .catch((e) => console.error("persist transcript:", e));
                  }
                }
              } catch (e) {
                console.error("OpenAI message parse:", e);
              }
            });

            openAiWs.on("close", () => {
              openAiWs = null;
            });
            openAiWs.on("error", (err) => {
              console.error("OpenAI WebSocket error:", err);
            });
          })
          .catch((e) => console.error("task update/load:", e));
        return;
      }
      if (msg.event === "media") {
        const isInbound = msg.media?.track === "inbound" || msg.media?.track === undefined;
        if (msg.media?.payload && openAiWs?.readyState === WebSocket.OPEN && isInbound) {
          openAiWs.send(
            JSON.stringify({
              type: "input_audio_buffer.append",
              audio: msg.media.payload,
            })
          );
        }
        return;
      }
      if (msg.event === "stop") {
        if (openAiWs?.readyState === WebSocket.OPEN) openAiWs.close();
        openAiWs = null;
        if (taskId) {
          prisma.task
            .update({
              where: { id: taskId },
              data: { status: "COMPLETED" as TaskStatus },
            })
            .then(() => broadcastStatus(taskId!, "COMPLETED"))
            .then(() => runOutcomeExtraction(taskId))
            .catch((e) => console.error("update task on stop:", e));
        }
        ws.close();
        return;
      }
    } catch (e) {
      console.error("Twilio media message parse error:", e);
    }
  });

  ws.on("close", () => {
    if (openAiWs?.readyState === WebSocket.OPEN) openAiWs.close();
    openAiWs = null;
    if (taskId) {
      prisma.task
        .findUnique({ where: { id: taskId }, select: { status: true } })
        .then((task) => {
          if (task?.status === "IN_PROGRESS") {
            return prisma.task
              .update({
                where: { id: taskId! },
                data: { status: "COMPLETED" as TaskStatus },
              })
              .then(() => broadcastStatus(taskId!, "COMPLETED"))
              .then(() => runOutcomeExtraction(taskId!));
          }
        })
        .catch((e) => console.error("update task on ws close:", e));
    }
  });
}
