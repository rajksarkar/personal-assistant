"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

interface Task {
  id: string;
  createdAt: string;
  contextName: string;
  contextPhone: string;
  contextNotes: string | null;
  instructionText: string;
  status: string;
  transcriptEvents: { id: string; ts: string; speaker: string; text: string }[];
  outcome: { summaryText: string | null; extractedFieldsJson: string | null; calendarEventId: string | null } | null;
}

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/api/tasks/${id}`)
      .then((r) => r.json())
      .then(setTask)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p style={{ padding: "2rem", color: "var(--muted)" }}>Loading…</p>;
  if (!task) return <p style={{ padding: "2rem", color: "var(--error)" }}>Task not found.</p>;

  return (
    <main style={{ padding: "2rem", maxWidth: 800, margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>Task details</h1>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/">New Call</Link>
          <Link href="/history">History</Link>
        </nav>
      </header>
      <div style={{ background: "var(--surface)", borderRadius: 12, padding: "1.5rem", border: "1px solid var(--border)" }}>
        <p style={{ margin: "0 0 0.5rem", color: "var(--muted)", fontSize: "0.875rem" }}>
          {new Date(task.createdAt).toLocaleString()} · {task.status}
        </p>
        <p style={{ margin: "0 0 0.25rem" }}><strong>{task.contextName}</strong> · {task.contextPhone}</p>
        {task.contextNotes && <p style={{ margin: "0 0 1rem", color: "var(--muted)", fontSize: "0.9rem" }}>{task.contextNotes}</p>}
        <p style={{ margin: "0 0 1rem", fontSize: "0.9rem" }}>{task.instructionText}</p>
        <h3 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem" }}>Transcript</h3>
        <div style={{ background: "var(--bg)", borderRadius: 8, padding: "0.75rem", border: "1px solid var(--border)" }}>
          {task.transcriptEvents.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.875rem" }}>No transcript.</p>
          ) : (
            task.transcriptEvents.map((ev) => (
              <div key={ev.id} style={{ marginBottom: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)", marginRight: "0.5rem" }}>
                  {ev.speaker}:
                </span>
                <span style={{ fontSize: "0.9rem" }}>{ev.text}</span>
              </div>
            ))
          )}
        </div>
        {task.outcome && (
          <>
            <h3 style={{ margin: "1rem 0 0.5rem", fontSize: "1rem" }}>Outcome</h3>
            <div style={{ background: "var(--bg)", borderRadius: 8, padding: "0.75rem", border: "1px solid var(--border)", fontSize: "0.875rem" }}>
              {task.outcome.summaryText && <p style={{ margin: "0 0 0.5rem" }}>{task.outcome.summaryText}</p>}
              {task.outcome.extractedFieldsJson && (
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {task.outcome.extractedFieldsJson}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
