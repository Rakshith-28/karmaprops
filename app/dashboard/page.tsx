"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Navbar from "../components/Navbar";

// ─── Types ───
type ConversationSummary = {
  phone: string;
  callerName: string | null;
  callerType: string;
  lastMessage: string;
  lastTimestamp: string;
  pendingCount: number;
  totalMessages: number;
};

type ChatMessage = {
  id: string;
  text: string;
  direction: "incoming" | "outgoing";
  timestamp: string;
  source: "quo" | "karmaprops";
  status: string;
  messageId?: string;
};

// ─── Helpers ───
function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatBubbleTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function getInitials(name: string | null, phone: string): string {
  if (name) {
    const parts = name.trim().split(" ");
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || "#";
  }
  return "#";
}

function getTypeColor(type: string): string {
  const t = type?.toLowerCase();
  if (t === "tenant") return "#2563eb";
  if (t === "prospect") return "#16a34a";
  if (t === "owner") return "#9333ea";
  if (t === "vendor") return "#ea580c";
  return "#6b7280";
}

function getTypeBg(type: string): string {
  const t = type?.toLowerCase();
  if (t === "tenant") return "rgba(37,99,235,0.15)";
  if (t === "prospect") return "rgba(22,163,106,0.15)";
  if (t === "owner") return "rgba(147,51,234,0.15)";
  if (t === "vendor") return "rgba(234,88,12,0.15)";
  return "rgba(107,114,128,0.15)";
}

function getTypeLabel(type: string): string {
  const t = type?.toLowerCase();
  if (t === "tenant") return "Tenant";
  if (t === "prospect") return "Prospect";
  if (t === "owner") return "Owner";
  if (t === "vendor") return "Vendor";
  return "Unknown";
}

// ─── Status Icon ───
function StatusIcon({ status }: { status: string }) {
  if (status === "sent" || status === "delivered" || status === "approved") {
    return (
      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" style={{ marginLeft: 3, flexShrink: 0 }}>
        <path d="M11.07 0.5L4.5 7.07L1.93 4.5L0.5 5.93L4.5 9.93L12.5 1.93L11.07 0.5Z" fill="#53bdeb" />
        <path d="M14.07 0.5L7.5 7.07L6.07 5.64L4.64 7.07L7.5 9.93L15.5 1.93L14.07 0.5Z" fill="#53bdeb" />
      </svg>
    );
  }
  if (status === "pending") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 3, flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" stroke="#f59e0b" strokeWidth="1.5" fill="none" />
        <path d="M8 4V8.5L11 10" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (status === "rejected") {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ marginLeft: 3, flexShrink: 0 }}>
        <circle cx="8" cy="8" r="7" stroke="#ef4444" strokeWidth="1.5" fill="none" />
        <path d="M5.5 5.5L10.5 10.5M10.5 5.5L5.5 10.5" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return null;
}

// ─── Date Separator ───
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  let label: string;
  if (diffDays === 0) label = "Today";
  else if (diffDays === 1) label = "Yesterday";
  else if (diffDays < 7) label = d.toLocaleDateString("en-US", { weekday: "long" });
  else label = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
      <span style={{ background: "#182229", color: "#8696a0", fontSize: 12, padding: "5px 12px", borderRadius: 8 }}>{label}</span>
    </div>
  );
}

// ─── Main Component ───
export default function Dashboard() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editingReply, setEditingReply] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [quoContacts, setQuoContacts] = useState<Record<string, string>>({});

  // ─── Fetch conversation list from /api/messages ───
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/messages");
      if (!res.ok) return;
      const data = await res.json();
      const msgs = data.messages || [];

      // Group by phone
      const grouped: Record<string, any[]> = {};
      for (const m of msgs) {
        if (!grouped[m.fromPhone]) grouped[m.fromPhone] = [];
        grouped[m.fromPhone].push(m);
      }

      const convos: ConversationSummary[] = Object.entries(grouped).map(([phone, messages]) => {
        const sorted = messages.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const latest = sorted[0];
        const pendingCount = messages.filter((m: any) => m.status === "pending").length;

        return {
          phone,
          callerName: latest.callerName || quoContacts[phone] || null,
          callerType: latest.callerType || "prospect",
          lastMessage: latest.incomingMessage || "",
          lastTimestamp: latest.createdAt,
          pendingCount,
          totalMessages: messages.length,
        };
      });

      // Sort: pending first, then by timestamp
      convos.sort((a, b) => {
        if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
        if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
        return new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime();
      });

      setConversations(convos);
    } catch (err) {
      console.warn("Failed to fetch conversations:", err);
    }
  }, []);

  // Fetch Quo contacts once on load
  useEffect(() => {
    fetch("/api/contacts")
      .then((res) => res.json())
      .then((data) => setQuoContacts(data.contacts || {}))
      .catch(() => {});
  }, []);

  // Poll every 15 seconds
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // ─── Fetch full chat history when selecting a conversation ───
  const loadChat = useCallback(async (phone: string) => {
    setChatLoading(true);
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(phone)}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setChatMessages(data.messages || []);

      // Set editing reply for pending messages
      const pending = (data.messages || []).find((m: ChatMessage) => m.status === "pending" && m.direction === "outgoing");
      if (pending) setEditingReply(pending.text);
      else setEditingReply("");
      setEditMode(false);
    } catch (err) {
      console.warn("Failed to load chat:", err);
      setChatMessages([]);
    }
    setChatLoading(false);
  }, []);

  useEffect(() => {
    if (selectedPhone) loadChat(selectedPhone);
  }, [selectedPhone, loadChat]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, [chatMessages]);

  // ─── Approve / Reject ───
  const handleApprove = async () => {
    const pending = chatMessages.find((m) => m.status === "pending" && m.direction === "outgoing");
    if (!pending?.messageId) return;

    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: pending.messageId,
          action: "approve",
          editedReply: editMode ? editingReply : undefined,
        }),
      });
      // Refresh
      if (selectedPhone) loadChat(selectedPhone);
      fetchConversations();
    } catch (err) {
      console.error("Approve failed:", err);
    }
  };

  const handleReject = async () => {
    const pending = chatMessages.find((m) => m.status === "pending" && m.direction === "outgoing");
    if (!pending?.messageId) return;

    try {
      await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pending.messageId, action: "reject" }),
      });
      if (selectedPhone) loadChat(selectedPhone);
      fetchConversations();
    } catch (err) {
      console.error("Reject failed:", err);
    }
  };

  // ─── Sync ───
  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch (err) {
      console.error("Sync failed:", err);
    }
    setSyncing(false);
  };

  // ─── Filtered conversations ───
  const filtered = conversations.filter((c) => {
    if (filter !== "all" && c.callerType?.toLowerCase() !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(c.callerName || "").toLowerCase().includes(q) && !c.phone.includes(q)) return false;
    }
    return true;
  });

  const selectedConvo = conversations.find((c) => c.phone === selectedPhone);
  const pendingMessage = chatMessages.find((m) => m.status === "pending" && m.direction === "outgoing");

  const filters = [
    { key: "all", label: "All" },
    { key: "tenant", label: "Tenants" },
    { key: "prospect", label: "Prospects" },
    { key: "owner", label: "Owners" },
    { key: "vendor", label: "Vendors" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111b21" }}>
      <Navbar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", width: "100vw", background: "#111b21", fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", color: "#e9edef" }}>

      {/* ═══ LEFT PANEL ═══ */}
      <div style={{ width: 420, minWidth: 420, borderRight: "1px solid #2a3942", display: "flex", flexDirection: "column", background: "#111b21" }}>

        {/* Header */}
        <div style={{ padding: "10px 16px", background: "#202c33", display: "flex", alignItems: "center", justifyContent: "space-between", height: 59 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 600, color: "#e9edef" }}>KarmaProps</span>
            <span style={{ fontSize: 11, background: "#00a884", color: "#111b21", padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>AI</span>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: "50%", display: "flex", alignItems: "center", opacity: syncing ? 0.5 : 1 }}
            title="Sync DoorLoop Data"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#aebac1" style={{ animation: syncing ? "spin 1s linear infinite" : "none" }}>
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: "8px 12px", background: "#111b21" }}>
          <div style={{ display: "flex", alignItems: "center", background: "#202c33", borderRadius: 8, padding: "6px 12px", gap: 12 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#8696a0"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" /></svg>
            <input
              type="text"
              placeholder="Search or start a new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: "transparent", border: "none", outline: "none", color: "#e9edef", fontSize: 14, width: "100%", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 6, padding: "4px 12px 8px", overflowX: "auto" }}>
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: "5px 14px", borderRadius: 18, border: "none", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 500, whiteSpace: "nowrap",
                background: filter === f.key ? "#00a884" : "#202c33",
                color: filter === f.key ? "#111b21" : "#8696a0",
                transition: "all 0.15s",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#8696a0", fontSize: 14 }}>
              {conversations.length === 0 ? "No messages yet" : "No conversations match this filter"}
            </div>
          )}
          {filtered.map((convo) => {
            const isSelected = selectedPhone === convo.phone;
            return (
              <div
                key={convo.phone}
                onClick={() => setSelectedPhone(convo.phone)}
                style={{
                  display: "flex", alignItems: "center", padding: "10px 14px", gap: 14, cursor: "pointer",
                  background: isSelected ? "#2a3942" : "transparent", transition: "background 0.1s",
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#202c33"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ width: 49, height: 49, borderRadius: "50%", background: getTypeColor(convo.callerType), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
                  {getInitials(convo.callerName, convo.phone)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
                    <span style={{ fontSize: 16, fontWeight: 400, color: "#e9edef", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>
                      {convo.callerName || formatPhone(convo.phone)}
                    </span>
                    <span style={{ fontSize: 12, color: convo.pendingCount > 0 ? "#00a884" : "#8696a0", whiteSpace: "nowrap", marginLeft: 8 }}>
                      {formatTime(convo.lastTimestamp)}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 14, color: "#8696a0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 240 }}>
                      {convo.lastMessage}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: getTypeColor(convo.callerType), background: getTypeBg(convo.callerType), padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                        {getTypeLabel(convo.callerType)}
                      </span>
                      {convo.pendingCount > 0 && (
                        <span style={{ background: "#00a884", color: "#111b21", fontSize: 11, fontWeight: 700, borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {convo.pendingCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ MIDDLE PANEL ═══ */}
      {selectedPhone && selectedConvo ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0b141a" }}>

          {/* Chat Header */}
          <div style={{ padding: "10px 16px", background: "#202c33", display: "flex", alignItems: "center", gap: 14, height: 59, borderBottom: "1px solid #2a3942" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: getTypeColor(selectedConvo.callerType), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600, color: "#fff", flexShrink: 0 }}>
              {getInitials(selectedConvo.callerName, selectedConvo.phone)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 500, color: "#e9edef" }}>{selectedConvo.callerName || formatPhone(selectedConvo.phone)}</div>
              <div style={{ fontSize: 13, color: "#8696a0" }}>{formatPhone(selectedConvo.phone)}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: getTypeColor(selectedConvo.callerType), background: getTypeBg(selectedConvo.callerType), padding: "3px 10px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {getTypeLabel(selectedConvo.callerType)}
            </span>
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 60px", background: "#0b141a" }}>
            {chatLoading ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#8696a0" }}>Loading messages...</div>
            ) : chatMessages.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", color: "#8696a0" }}>No messages yet</div>
            ) : (
              chatMessages.filter((msg) => msg.status !== "rejected").map((msg, i) => {
                let showDate = false;
                if (i === 0) showDate = true;
                else {
                  const prevDate = new Date(chatMessages[i - 1].timestamp).toDateString();
                  const currDate = new Date(msg.timestamp).toDateString();
                  if (prevDate !== currDate) showDate = true;
                }

                const isOutgoing = msg.direction === "outgoing";
                const isPending = msg.status === "pending";
                const isRejected = msg.status === "rejected";

                let bubbleBg: string;
                if (isOutgoing) {
                  if (isPending) bubbleBg = "#2a2a12";
                  else if (isRejected) bubbleBg = "#2a1515";
                  else bubbleBg = "#005c4b";
                } else {
                  bubbleBg = "#202c33";
                }

                return (
                  <div key={msg.id}>
                    {showDate && <DateSeparator date={msg.timestamp} />}
                    <div style={{ display: "flex", justifyContent: isOutgoing ? "flex-end" : "flex-start", marginBottom: 2, paddingLeft: isOutgoing ? 60 : 0, paddingRight: isOutgoing ? 0 : 60 }}>
                      <div style={{
                        background: bubbleBg, padding: "6px 8px 4px", maxWidth: 520, position: "relative",
                        borderRadius: isOutgoing
                          ? (i > 0 && chatMessages[i - 1].direction === "outgoing" ? "8px" : "8px 0 8px 8px")
                          : (i > 0 && chatMessages[i - 1].direction === "incoming" ? "8px" : "0 8px 8px 8px"),
                        boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
                      }}>
                        {(isPending || isRejected) && (
                          <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: isPending ? "#f59e0b" : "#ef4444", background: isPending ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)", padding: "1px 6px", borderRadius: 4, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
                            {isPending ? "⏳ Pending Approval" : "✗ Rejected"}
                          </div>
                        )}
                        <div style={{ fontSize: 14.2, lineHeight: "19px", color: isRejected ? "#8696a0" : "#e9edef", whiteSpace: "pre-wrap", wordBreak: "break-word", textDecoration: isRejected ? "line-through" : "none", opacity: isRejected ? 0.6 : 1 }}>
                          {msg.text}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 2, marginTop: 2 }}>
                          <span style={{ fontSize: 11, color: "#8696a0" }}>{formatBubbleTime(msg.timestamp)}</span>
                          {isOutgoing && <StatusIcon status={msg.status} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom Bar */}
          {pendingMessage ? (
            <div style={{ background: "#202c33", borderTop: "1px solid #2a3942", padding: "10px 16px" }}>
              <div style={{ fontSize: 12, color: "#f59e0b", marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#f59e0b" strokeWidth="1.5" fill="none" /><path d="M8 4V8.5L11 10" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" /></svg>
                AI Reply — Pending Approval
              </div>
              <textarea
                value={editingReply}
                onChange={(e) => setEditingReply(e.target.value)}
                readOnly={!editMode}
                style={{ width: "100%", background: editMode ? "#111b21" : "#2a3942", border: editMode ? "1px solid #00a884" : "1px solid transparent", borderRadius: 8, color: "#e9edef", fontSize: 14, padding: "10px 12px", resize: "vertical", minHeight: 60, maxHeight: 160, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                {editMode ? (
                  <button onClick={() => setEditMode(false)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: "#00a884", color: "#111b21" }}>
                    ✓ Save Edit
                  </button>
                ) : (
                  <>
                    <button onClick={handleReject} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", background: "#3b2020", color: "#ef4444" }}>
                      ✗ Reject
                    </button>
                    <button onClick={() => setEditMode(true)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 500, fontFamily: "inherit", background: "#172e36", color: "#53bdeb" }}>
                      ✏️ Edit
                    </button>
                    <button onClick={handleApprove} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: "#00a884", color: "#111b21" }}>
                      ✓ Approve & Send
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: "#202c33", borderTop: "1px solid #2a3942", padding: "10px 16px", display: "flex", alignItems: "center", height: 62 }}>
              <div style={{ flex: 1, background: "#2a3942", borderRadius: 8, padding: "9px 14px", color: "#8696a0", fontSize: 14 }}>
                AI will auto-generate replies to incoming messages
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ═══ Empty State ═══ */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#222e35", gap: 16 }}>
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#00a884" opacity="0.2" />
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.62 0-3.13-.46-4.42-1.24l-.31-.18-3.22.8.84-3.12-.2-.32C3.98 14.84 3.5 13.46 3.5 12c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5-3.81 8.5-8.5 8.5z" fill="#00a884" />
          </svg>
          <div style={{ fontSize: 22, fontWeight: 300, color: "#e9edef", textAlign: "center" }}>KarmaProps Auto Responder</div>
          <div style={{ fontSize: 14, color: "#8696a0", textAlign: "center", lineHeight: "20px", maxWidth: 320 }}>
            Send and receive messages from tenants, prospects, owners, and vendors. AI-powered replies are generated automatically for your approval.
          </div>
          <div style={{ fontSize: 13, color: "#667781", display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#667781"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 6c1.4 0 2.8 1.1 2.8 2.5V11c.6 0 1.2.6 1.2 1.2v3.5c0 .7-.6 1.3-1.2 1.3H9.2c-.7 0-1.2-.6-1.2-1.3v-3.5c0-.6.6-1.2 1.2-1.2V9.5C9.2 8.1 10.6 7 12 7zm0 1.2c-.8 0-1.5.7-1.5 1.3V11h3V9.5c0-.6-.7-1.3-1.5-1.3z" /></svg>
            Messages are reviewed before sending
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}