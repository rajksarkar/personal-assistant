"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000";

interface Task {
  id: string;
  createdAt: string;
  contextName: string;
  contextPhone: string;
  status: string;
  outcome?: { summaryText: string | null } | null;
}

export default function HistoryPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/tasks`)
      .then((r) => r.json())
      .then(setTasks)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ marginBottom: "2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0, fontSize: "1.75rem", fontWeight: 600 }}>Personal Reservation Assistant</h1>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link href="/" style={{ color: "var(--muted)" }}>New Call</Link>
          <Link href="/history" style={{ color: "var(--accent)", fontWeight: 500 }}>History</Link>
        </nav>
      </header>
      <h2 style={{ margin: "0 0 1rem", fontSize: "1.25rem" }}>History</h2>
      {loading ? (
        <p style={{ color: "var(--muted)" }}>Loading…</p>
      ) : (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: 12,
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Date</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Phone</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}>Status</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem", fontSize: "0.8rem", color: "var(--muted)", fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem" }}>{task.contextName}</td>
                  <td style={{ padding: "0.75rem 1rem", fontSize: "0.875rem", color: "var(--muted)" }}>{task.contextPhone}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <span
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: 6,
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        background:
                          task.status === "COMPLETED"
                            ? "var(--success)"
                            : task.status === "FAILED"
                            ? "var(--error)"
                            : "var(--border)",
                      }}
                    >
                      {task.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <Link href={`/task/${task.id}`} style={{ fontSize: "0.875rem", color: "var(--accent)" }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tasks.length === 0 && (
            <p style={{ padding: "2rem", margin: 0, color: "var(--muted)", textAlign: "center" }}>
              No tasks yet. Start a call from the New Call screen.
            </p>
          )}
        </div>
      )}
    </main>
  );
}
