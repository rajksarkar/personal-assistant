import path from "path";
import { config } from "dotenv";
// Load .env from repo root (when cwd is root via "npm run dev") or from apps/server (cwd is server)
const cwd = process.cwd();
const root = cwd.endsWith("server") ? path.resolve(cwd, "../..") : cwd;
config({ path: path.join(root, ".env") });
config(); // override with local .env if present
// Always use repo-root dev.db so server and "prisma db push" use the same file
process.env.DATABASE_URL = "file:" + path.join(root, "dev.db");
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { taskRoutes } from "./routes/tasks";
import { twimlRoutes, handleTwimlStream } from "./routes/twiml";
import { authRoutes } from "./routes/auth";
import { setupUIWebSocket } from "./ws/ui";
import { handleTwilioMediaConnection } from "./ws/twilio-media";
import { prisma } from "./db";
import { broadcastStatus } from "./ws/ui";

const PORT = process.env.PORT || 4000;
const app = express();
const server = createServer(app);

// Allow localhost and 127.0.0.1 so fetch works from browser
const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.WEB_ORIGIN,
].filter(Boolean) as string[];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) cb(null, true);
      else cb(null, false);
    },
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const wss = new WebSocketServer({ noServer: true });
const twilioMediaWss = new WebSocketServer({ noServer: true });
setupUIWebSocket(server, wss);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/twilio/status", (_req, res) => {
  const hasClient = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  const hasFrom = !!process.env.TWILIO_FROM_NUMBER;
  const hasBaseUrl = !!process.env.PUBLIC_BASE_URL;
  const configured = hasClient && hasFrom && hasBaseUrl;
  res.json({
    configured,
    twilio: hasClient && hasFrom,
    publicBaseUrl: hasBaseUrl,
    message: configured
      ? "Twilio is configured. Start a call and check Twilio Console → Monitor → Logs → Calls for call status."
      : [
          !hasClient && "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env",
          !hasFrom && "Set TWILIO_FROM_NUMBER (your Twilio voice number) in .env",
          !hasBaseUrl && "Set PUBLIC_BASE_URL (e.g. https://xxxx.ngrok.io) and run npm run dev:tunnel",
        ]
          .filter(Boolean)
          .join(". "),
  });
});
// TwiML stream: top-level so Twilio always gets 200 (avoids 404 from router/mount/trailing-slash)
// Twilio makes POST requests by default
app.get("/api/twiml/stream", handleTwimlStream);
app.get("/api/twiml/stream/", handleTwimlStream);
app.post("/api/twiml/stream", handleTwimlStream);
app.post("/api/twiml/stream/", handleTwimlStream);
// Twilio status callback: must respond 200 quickly. Reachable at PUBLIC_BASE_URL/api/twilio/status?taskId=...
app.post("/api/twilio/status", (req, res) => {
  const taskId = req.query.taskId as string;
  const callStatus = (req.body && req.body.CallStatus) as string | undefined;
  res.status(200).type("text/xml").send("<Response></Response>");
  if (!taskId) return;
  const failedStatuses = ["busy", "no-answer", "failed", "canceled"];
  if (callStatus && failedStatuses.includes(callStatus)) {
    prisma.task
      .update({ where: { id: taskId }, data: { status: "FAILED" } })
      .then(() => broadcastStatus(taskId, "FAILED"))
      .catch((e) => console.error("Twilio status callback:", e));
  }
});
// TwiML and task routes: twiml first so GET /api/twiml/stream is always handled
app.use("/api", twimlRoutes);
app.use("/api", taskRoutes);
app.use("/", authRoutes);

server.on("upgrade", (request, socket, head) => {
  const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
  if (pathname === "/ws/ui") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, pathname);
    });
  } else if (pathname === "/ws/twilio-media") {
    twilioMediaWss.handleUpgrade(request, socket, head, (ws) => {
      handleTwilioMediaConnection(ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
