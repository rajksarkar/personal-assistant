import { Router, Request, Response } from "express";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "https://example.trycloudflare.com";

export const twimlRoutes = Router();

/** Shared handler so index can register the same route at top level (avoids 404 from router mount). */
export function handleTwimlStream(req: Request, res: Response): void {
  const taskId = req.query.taskId as string;
  if (!taskId) {
    res.status(400).send("taskId required");
    return;
  }
  const base = PUBLIC_BASE_URL.replace(/^https?/, "wss");
  const streamUrl = `${base}/ws/twilio-media`;
  const response = new VoiceResponse();
  const connect = response.connect();
  const stream = connect.stream({ url: streamUrl });
  stream.parameter({ name: "taskId", value: taskId });
  res.status(200).type("text/xml").send(response.toString());
}

twimlRoutes.get("/twiml/stream", handleTwimlStream);
twimlRoutes.get("/twiml/stream/", handleTwimlStream);
twimlRoutes.post("/twiml/stream", handleTwimlStream);
twimlRoutes.post("/twiml/stream/", handleTwimlStream);
