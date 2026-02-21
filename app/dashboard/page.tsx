// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";

interface Message {
  id: string;
  fromPhone: string;
  toPhone: string;
  incomingMessage: string;
  aiReply: string | null;
  status: string;
  createdAt: string;
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Fetch messages on load
  async function fetchMessages() {
    const res = await fetch("/api/messages");
    const data = await res.json();
    setMessages(data.messages);
    setLoading(false);
  }

  useEffect(() => {
    fetchMessages();
    // Auto-refresh every 10 seconds
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []);

  // Handle approve
  async function handleApprove(id: string) {
    const editedReply = editedReplies[id];
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", editedReply }),
    });
    fetchMessages();
  }

  // Handle reject
  async function handleReject(id: string) {
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    fetchMessages();
  }

  // Update edited reply
  function handleEditReply(id: string, value: string) {
    setEditedReplies((prev) => ({ ...prev, [id]: value }));
  }

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading...</div>;

  const pending = messages.filter((m) => m.status === "pending");
  const handled = messages.filter((m) => m.status !== "pending");

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
      <h1 style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20 }}>
        Message Approval Dashboard
      </h1>

      {/* Pending Messages */}
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginBottom: 10 }}>
        Pending ({pending.length})
      </h2>

      {pending.length === 0 && (
        <p style={{ color: "#888", marginBottom: 20 }}>No pending messages.</p>
      )}

      {pending.map((msg) => (
        <div
          key={msg.id}
          style={{
            border: "1px solid #ffa500",
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
            backgroundColor: "#fff8ee",
          }}
        >
          <p style={{ fontSize: 12, color: "#888" }}>
            {new Date(msg.createdAt).toLocaleString()}
          </p>
          <p style={{ marginTop: 4 }}>
            <strong>From:</strong> {msg.fromPhone}
          </p>
          <p style={{ marginTop: 4 }}>
            <strong>Prospect said:</strong> {msg.incomingMessage}
          </p>
          <div style={{ marginTop: 8 }}>
            <label style={{ fontWeight: "bold", display: "block", marginBottom: 4 }}>
              AI Reply (edit if needed):
            </label>
            <textarea
              rows={3}
              style={{
                width: "100%",
                padding: 8,
                borderRadius: 4,
                border: "1px solid #ccc",
                fontSize: 14,
                color: "#000",
              }}
              value={editedReplies[msg.id] ?? msg.aiReply ?? ""}
              onChange={(e) => handleEditReply(msg.id, e.target.value)}
            />
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button
              onClick={() => handleApprove(msg.id)}
              style={{
                padding: "8px 20px",
                backgroundColor: "#22c55e",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Approve & Send
            </button>
            <button
              onClick={() => handleReject(msg.id)}
              style={{
                padding: "8px 20px",
                backgroundColor: "#ef4444",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {/* Handled Messages */}
      <h2 style={{ fontSize: 18, fontWeight: "bold", marginTop: 30, marginBottom: 10 }}>
        History ({handled.length})
      </h2>

      {handled.length === 0 && (
        <p style={{ color: "#888" }}>No history yet.</p>
      )}

      {handled.map((msg) => (
        <div
          key={msg.id}
          style={{
            border: `1px solid ${msg.status === "sent" ? "#22c55e" : "#ef4444"}`,
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
            backgroundColor: msg.status === "sent" ? "#f0fdf4" : "#fef2f2",
          }}
        >
          <p style={{ fontSize: 12, color: "#888" }}>
            {new Date(msg.createdAt).toLocaleString()} —{" "}
            <span style={{ fontWeight: "bold", textTransform: "uppercase" }}>
              {msg.status}
            </span>
          </p>
          <p><strong>From:</strong> {msg.fromPhone}</p>
          <p><strong>Prospect:</strong> {msg.incomingMessage}</p>
          <p><strong>Reply:</strong> {msg.aiReply}</p>
        </div>
      ))}
    </div>
  );
}