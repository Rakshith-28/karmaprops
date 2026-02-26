"use client";

import { useEffect, useState } from "react";
import Nav from "../components/Nav";

interface Message {
  id: string;
  fromPhone: string;
  toPhone: string;
  incomingMessage: string;
  aiReply: string | null;
  status: string;
  callerType: string | null;
  callerName: string | null;
  createdAt: string;
}

export default function Dashboard() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [editedReplies, setEditedReplies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchMessages() {
    try {
      const res = await fetch("/api/messages");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      console.error("Failed to fetch messages");
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, []);

  async function handleApprove(id: string) {
    setActionLoading(id);
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", editedReply: editedReplies[id] }),
    });
    setActionLoading(null);
    fetchMessages();
  }

  async function handleReject(id: string) {
    setActionLoading(id);
    await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    setActionLoading(null);
    fetchMessages();
  }

  function handleEditReply(id: string, value: string) {
    setEditedReplies((prev) => ({ ...prev, [id]: value }));
  }

  const pending = messages.filter((m) => m.status === "pending");
  const handled = messages.filter((m) => m.status !== "pending");

  function CallerBadge({ msg }: { msg: Message }) {
    const isTenant = msg.callerType === "tenant";
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 8px",
          borderRadius: 12,
          fontSize: 12,
          fontWeight: 600,
          background: isTenant ? "#dbeafe" : "#fef3c7",
          color: isTenant ? "#1e40af" : "#92400e",
        }}
      >
        {isTenant ? "🏠 Tenant" : "🔍 Prospect"}
        {msg.callerName && ` · ${msg.callerName}`}
      </span>
    );
  }

  return (
    <>
      <Nav />
      <div className="container-sm">
        <div className="page-header">
          <h1>Message Dashboard</h1>
          <p>Review and approve AI-generated replies before they reach your prospects.</p>
        </div>

        {loading ? (
          <div className="loading">
            <div className="spinner" />
            Loading messages...
          </div>
        ) : (
          <>
            {/* Pending Section */}
            <div className="section-header">
              <h2>
                🔔 Pending <span className="count">({pending.length})</span>
              </h2>
            </div>

            {pending.length === 0 ? (
              <div className="empty-state">
                <div className="icon">✅</div>
                <p>No pending messages — you&apos;re all caught up!</p>
              </div>
            ) : (
              pending.map((msg) => (
                <div key={msg.id} className="message-card pending">
                  <div className="message-meta">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="phone">📱 {msg.fromPhone}</span>
                      <CallerBadge msg={msg} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="badge badge-pending">Pending</span>
                      <span className="time">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="message-content">
                    <label>{msg.callerType === "tenant" ? "Tenant said" : "Prospect said"}</label>
                    <p>{msg.incomingMessage}</p>
                  </div>

                  <div className="message-content">
                    <label>AI suggested reply (edit if needed)</label>
                    <textarea
                      className="textarea"
                      rows={3}
                      value={editedReplies[msg.id] ?? msg.aiReply ?? ""}
                      onChange={(e) => handleEditReply(msg.id, e.target.value)}
                    />
                  </div>

                  <div className="message-actions">
                    <button
                      className="btn btn-success"
                      onClick={() => handleApprove(msg.id)}
                      disabled={actionLoading === msg.id}
                    >
                      {actionLoading === msg.id ? "Sending..." : "✓ Approve & Send"}
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleReject(msg.id)}
                      disabled={actionLoading === msg.id}
                    >
                      ✕ Reject
                    </button>
                  </div>
                </div>
              ))
            )}

            {/* History Section */}
            <div className="section-header" style={{ marginTop: 40 }}>
              <h2>
                📋 History <span className="count">({handled.length})</span>
              </h2>
            </div>

            {handled.length === 0 ? (
              <div className="empty-state">
                <div className="icon">📭</div>
                <p>No history yet.</p>
              </div>
            ) : (
              handled.map((msg) => (
                <div key={msg.id} className={`message-card ${msg.status}`}>
                  <div className="message-meta">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="phone">📱 {msg.fromPhone}</span>
                      <CallerBadge msg={msg} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`badge badge-${msg.status}`}>{msg.status}</span>
                      <span className="time">
                        {new Date(msg.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="message-content">
                    <label>{msg.callerType === "tenant" ? "Tenant said" : "Prospect said"}</label>
                    <p>{msg.incomingMessage}</p>
                  </div>
                  <div className="message-content">
                    <label>Reply</label>
                    <p>{msg.aiReply}</p>
                  </div>
                </div>
              ))
            )}

            <div style={{ height: 60 }} />
          </>
        )}
      </div>
    </>
  );
}