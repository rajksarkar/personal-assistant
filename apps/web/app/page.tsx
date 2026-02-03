"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>Personal Reservation Assistant</h1>
        <nav style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link href="/" style={{ color: "var(--accent)", fontWeight: 500 }}>New Call</Link>
          <Link href="/history" style={{ color: "var(--muted)" }}>History</Link>
          <a
            href={`${API_BASE.replace(/\/$/, "")}/auth/google`}
            style={{ fontSize: "0.875rem", color: "var(--muted)" }}
          >
            Sign in with Google (Calendar)
          </a>
        </nav>
      </header>
      <NewCallScreen />
    </main>
  );
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";
const WS_BASE = (() => {
  const u = new URL(API_BASE);
  u.pathname = "";
  return u.protocol === "https:" ? "wss:" + u.host : "ws:" + u.host;
})();

interface TranscriptEvent {
  id: string;
  taskId: string;
  ts: string;
  speaker: "ASSISTANT" | "OTHER_PARTY" | "SYSTEM";
  text: string;
}

type TaskStatus =
  | "DRAFT"
  | "CALLING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "FAILED"
  | "NEEDS_USER_ACTION";

function NewCallScreen() {
  const [contextName, setContextName] = useState("");
  const [contextPhone, setContextPhone] = useState("");
  const [contextNotes, setContextNotes] = useState("");
  const [instructionText, setInstructionText] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskStatus>("DRAFT");
  const [transcript, setTranscript] = useState<TranscriptEvent[]>([]);
  const [outcome, setOutcome] = useState<{ summaryText?: string; extractedFieldsJson?: string } | null>(null);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (callStartTime == null || (status !== "CALLING" && status !== "IN_PROGRESS")) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - callStartTime) / 1000)), 1000);
    return () => clearInterval(id);
  }, [callStartTime, status]);

  const createAndStart = async () => {
    setError(null);
    setLoading(true);
    try {
      const createRes = await fetch(`${API_BASE}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contextName: contextName.trim(),
          contextPhone: contextPhone.trim(),
          contextNotes: contextNotes.trim() || undefined,
          instructionText: instructionText.trim(),
        }),
      });
      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create task");
      }
      const task = await createRes.json();
      setTaskId(task.id);
      setStatus("DRAFT");
      setTranscript([]);
      setOutcome(null);

      const startRes = await fetch(`${API_BASE}/api/tasks/${task.id}/start-call`, { method: "POST" });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) throw new Error(startData.error || "Failed to start call");
      if (startData.message && !startData.callSid) {
        setError(startData.message);
        setLoading(false);
        return;
      }
      setStatus("CALLING");
      setCallStartTime(Date.now());

      const ws = new WebSocket(`${WS_BASE}/ws/ui?taskId=${task.id}`);
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === "status") setStatus(msg.payload.status);
        if (msg.type === "transcript") {
          setTranscript((prev) => [...prev, msg.payload]);
        }
        if (msg.type === "outcome") {
          setOutcome(msg.payload);
        }
      };
      ws.onclose = () => {};
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const endCall = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/end-call`, { method: "POST" });
      setStatus("COMPLETED");
      setCallStartTime(null);
    } finally {
      setLoading(false);
    }
  };

  const saveToCalendar = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/tasks/${taskId}/save-calendar`, { method: "POST" });
    } finally {
      setLoading(false);
    }
  };

  const canStart = contextName.trim() && contextPhone.trim() && instructionText.trim() && !loading;
  const inProgress = status === "CALLING" || status === "IN_PROGRESS";
  const hasOutcome = outcome !== null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "1.5rem", border: "1px solid var(--border)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Context</h2>
        <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
          Name (business or person)
        </label>
        <input
          type="text"
          value={contextName}
          onChange={(e) => setContextName(e.target.value)}
          placeholder="e.g. Olive Garden"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            marginBottom: "1rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
          }}
        />
        <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
          Phone number
        </label>
        <input
          type="tel"
          value={contextPhone}
          onChange={(e) => setContextPhone(e.target.value)}
          placeholder="+1234567890"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            marginBottom: "1rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
          }}
        />
        <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
          Notes (optional)
        </label>
        <input
          type="text"
          value={contextNotes}
          onChange={(e) => setContextNotes(e.target.value)}
          placeholder="Any extra context"
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            marginBottom: "1rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
          }}
        />
        <h2 style={{ margin: "1.25rem 0 0.5rem", fontSize: "1.1rem" }}>Instruction</h2>
        <textarea
          value={instructionText}
          onChange={(e) => setInstructionText(e.target.value)}
          placeholder="e.g. Book a table for 2 for tomorrow at 7pm. Name on reservation: Raj."
          rows={4}
          style={{
            width: "100%",
            padding: "0.6rem 0.75rem",
            marginBottom: "1rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text)",
            resize: "vertical",
          }}
        />
        {error && <p style={{ color: "var(--error)", marginBottom: "1rem", fontSize: "0.875rem" }}>{error}</p>}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            onClick={createAndStart}
            disabled={!canStart || inProgress}
            style={{
              padding: "0.6rem 1.25rem",
              background: inProgress ? "var(--border)" : "var(--accent)",
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 500,
            }}
          >
            {inProgress ? "Call in progress…" : "Start Call"}
          </button>
          {inProgress && (
            <button
              onClick={endCall}
              style={{
                padding: "0.6rem 1.25rem",
                background: "var(--error)",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              End Call
            </button>
          )}
          {hasOutcome && (
            <button
              onClick={saveToCalendar}
              disabled={loading}
              style={{
                padding: "0.6rem 1.25rem",
                background: "var(--success)",
                color: "white",
                border: "none",
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              Save to Calendar
            </button>
          )}
        </div>
      </div>

      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "1.5rem", border: "1px solid var(--border)" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1.1rem" }}>Live status</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <span
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 6,
              background: status === "COMPLETED" ? "var(--success)" : status === "FAILED" ? "var(--error)" : "var(--accent)",
              fontSize: "0.8rem",
              fontWeight: 500,
            }}
          >
            {status}
          </span>
          {callStartTime !== null && (status === "CALLING" || status === "IN_PROGRESS") && (
            <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {Math.floor(elapsed / 60)}:{(elapsed % 60).toString().padStart(2, "0")}
            </span>
          )}
        </div>
        <h3 style={{ margin: "1rem 0 0.5rem", fontSize: "0.95rem" }}>Live transcript</h3>
        <div
          style={{
            minHeight: 200,
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--bg)",
            borderRadius: 8,
            padding: "0.75rem",
            border: "1px solid var(--border)",
          }}
        >
          {transcript.length === 0 && (
            <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.875rem" }}>
              Transcript will appear here when the call is active.
            </p>
          )}
          {transcript.map((ev) => (
            <div
              key={ev.id}
              style={{
                marginBottom: "0.5rem",
                padding: "0.4rem 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  color: ev.speaker === "ASSISTANT" ? "var(--accent)" : "var(--success)",
                  marginRight: "0.5rem",
                }}
              >
                {ev.speaker}:
              </span>
              <span style={{ fontSize: "0.9rem" }}>{ev.text}</span>
            </div>
          ))}
        </div>
        {outcome && (
          <>
            <h3 style={{ margin: "1rem 0 0.5rem", fontSize: "0.95rem" }}>Outcome</h3>
            <div
              style={{
                background: "var(--bg)",
                borderRadius: 8,
                padding: "0.75rem",
                border: "1px solid var(--border)",
                fontSize: "0.875rem",
              }}
            >
              {outcome.summaryText && <p style={{ margin: "0 0 0.5rem" }}>{outcome.summaryText}</p>}
              {outcome.extractedFieldsJson && (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {outcome.extractedFieldsJson}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
