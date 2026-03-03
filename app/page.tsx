"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navbar from "./components/Navbar";

// ─── Helpers ───
function formatPhone(phone: string): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1"))
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone;
}

function relativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const callerTypeColors: Record<string, string> = {
  tenant: "#2563eb",
  prospect: "#16a34a",
  owner: "#9333ea",
  vendor: "#ea580c",
};

function avatarColor(type: string | null | undefined): string {
  return callerTypeColors[type || ""] || "#6b7280";
}

function avatarInitial(name: string | null | undefined): string {
  if (name && name.trim()) return name.trim()[0].toUpperCase();
  return "#";
}

type QuickNote = { id: number; text: string; createdAt: string };

function loadNotes(): QuickNote[] {
  try {
    const raw = localStorage.getItem("karmaprops-quick-notes");
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveNotes(notes: QuickNote[]) {
  localStorage.setItem("karmaprops-quick-notes", JSON.stringify(notes));
}

export default function Home() {
  const router = useRouter();

  const [stats, setStats] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [estTime, setEstTime] = useState("");

  // Load notes from localStorage
  useEffect(() => {
    setNotes(loadNotes());
  }, []);

  // EST clock
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
      const date = now.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
      setEstTime(`${time} | ${date}`);
    };
    fmt();
    const iv = setInterval(fmt, 60000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/overview").then((r) => r.json()).catch(() => null),
      fetch("/api/messages").then((r) => r.json()).catch(() => ({ messages: [] })),
      fetch("/api/tasks").then((r) => r.json()).catch(() => ({ tasks: [] })),
    ]).then(([ov, msgs, tks]) => {
      setStats(ov);
      setMessages((msgs?.messages || []).slice(0, 5));
      const openTasks = (tks?.tasks || []).filter(
        (t: any) => !["COMPLETED", "CLOSED", "CANCELLED"].includes(t.status)
      );
      setTasks(openTasks.slice(0, 5));
      setLoading(false);
    });
  }, []);

  const statCards = [
    { label: "Pending Messages", value: stats?.pendingMessages ?? "—", icon: "💬", color: "#f59e0b", pulse: (stats?.pendingMessages || 0) > 0 },
    { label: "Open Tasks", value: stats?.openTasks ?? "—", icon: "🔧", color: "#f59e0b", pulse: false },
    { label: "Expiring Leases", value: stats?.expiringLeases ?? "—", icon: "📄", color: "#ef4444", pulse: false },
    { label: "Vacant Units", value: stats?.vacantUnits ?? "—", icon: "🏠", color: "#ea580c", pulse: false },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#111b21", fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", color: "#e9edef" }}>
      <Navbar />
      <div style={{ flex: 1, overflowY: "auto" }}>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 20px 40px" }}>

        {/* ═══ EST TIME ═══ */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: "#8696a0" }}>🕐 EST: {estTime}</span>
        </div>

        {/* ═══ STAT CARDS ═══ */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
          {statCards.map((card) => (
            <div
              key={card.label}
              style={{
                flex: "1 1 220px",
                minWidth: 180,
                background: "#202c33",
                borderRadius: 12,
                padding: "20px 24px",
                borderLeft: `3px solid ${card.color}`,
                position: "relative",
                overflow: "hidden",
                ...(card.pulse ? { boxShadow: `0 0 16px ${card.color}33` } : {}),
              }}
            >
              {card.pulse && (
                <div style={{
                  position: "absolute", top: 12, right: 12, width: 8, height: 8,
                  borderRadius: "50%", background: card.color,
                  animation: "pulse 2s ease-in-out infinite",
                }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{card.icon}</span>
                <span style={{ fontSize: 13, color: "#8696a0" }}>{card.label}</span>
              </div>
              <div style={{ fontSize: 32, fontWeight: 600, color: "#e9edef" }}>
                {loading ? "…" : card.value}
              </div>
            </div>
          ))}
        </div>

        {/* ═══ MIDDLE — Two Columns ═══ */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>

          {/* LEFT — Recent Messages */}
          <div style={{ flex: "3 1 400px", minWidth: 320, background: "#202c33", borderRadius: 12, border: "1px solid #2a3942", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #2a3942" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#e9edef" }}>Recent Messages</span>
              <span
                onClick={() => router.push("/dashboard")}
                style={{ fontSize: 13, color: "#00a884", cursor: "pointer", fontWeight: 500 }}
              >View All →</span>
            </div>
            <div>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "#8696a0", fontSize: 14 }}>Loading…</div>
              ) : messages.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#8696a0", fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📭</div>
                  No messages yet
                </div>
              ) : (
                messages.map((msg: any) => {
                  const initials = avatarInitial(msg.callerName);
                  const bgColor = avatarColor(msg.callerType);
                  return (
                    <div
                      key={msg.id}
                      onClick={() => router.push("/dashboard")}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
                        borderBottom: "1px solid #2a3942", cursor: "pointer", transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#2a3942"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%", background: bgColor,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 15, fontWeight: 600, color: "#fff", flexShrink: 0,
                      }}>{initials}</div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {msg.callerName || formatPhone(msg.fromPhone)}
                          </span>
                          <span style={{ fontSize: 11, color: "#8696a0", flexShrink: 0, marginLeft: 8 }}>
                            {relativeTime(msg.createdAt)}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            fontSize: 13, color: "#8696a0", whiteSpace: "nowrap", overflow: "hidden",
                            textOverflow: "ellipsis", flex: 1,
                          }}>
                            {msg.incomingMessage?.slice(0, 80) || "—"}
                          </span>
                          {msg.callerType && (
                            <span style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600,
                              background: `${avatarColor(msg.callerType)}22`, color: avatarColor(msg.callerType),
                              textTransform: "capitalize", flexShrink: 0,
                            }}>{msg.callerType}</span>
                          )}
                          <span style={{
                            fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600, flexShrink: 0,
                            background: msg.status === "pending" ? "#f59e0b22" : "#00a88422",
                            color: msg.status === "pending" ? "#f59e0b" : "#00a884",
                          }}>{msg.status}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT — Open Tasks */}
          <div style={{ flex: "2 1 280px", minWidth: 280, background: "#202c33", borderRadius: 12, border: "1px solid #2a3942", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #2a3942" }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: "#e9edef" }}>Maintenance Tasks</span>
              <span
                onClick={() => router.push("/explore")}
                style={{ fontSize: 13, color: "#00a884", cursor: "pointer", fontWeight: 500 }}
              >View All →</span>
            </div>
            <div>
              {loading ? (
                <div style={{ padding: 32, textAlign: "center", color: "#8696a0", fontSize: 14 }}>Loading…</div>
              ) : tasks.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#8696a0", fontSize: 14 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                  No open tasks
                </div>
              ) : (
                tasks.map((task: any) => {
                  const isUrgent = ["HIGH", "URGENT"].includes((task.priority || "").toUpperCase());
                  return (
                    <div
                      key={task.id}
                      style={{ padding: "12px 20px", borderBottom: "1px solid #2a3942" }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#e9edef", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
                          {task.title || "Untitled"}
                        </span>
                        <span style={{
                          fontSize: 10, padding: "1px 6px", borderRadius: 8, fontWeight: 600, flexShrink: 0, marginLeft: 8,
                          background: isUrgent ? "#ef444422" : "#8696a022",
                          color: isUrgent ? "#ef4444" : "#8696a0",
                          textTransform: "uppercase",
                        }}>{task.priority || "NORMAL"}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#8696a0" }}>
                        <span>{task.status}</span>
                        {task.assignedTo && <span>• {task.assignedTo}</span>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ═══ QUICK NOTES ═══ */}
        <div style={{ background: "#202c33", borderRadius: 12, border: "1px solid #2a3942", overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #2a3942" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#e9edef" }}>📝 Quick Notes</span>
            <button
              onClick={() => { setNotes([]); saveNotes([]); }}
              style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}
            >Clear All</button>
          </div>
          <div style={{ padding: "12px 20px" }}>
            <textarea
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const text = noteInput.trim();
                  if (!text) return;
                  const newNote: QuickNote = { id: Date.now(), text, createdAt: new Date().toISOString() };
                  const updated = [newNote, ...notes];
                  setNotes(updated);
                  saveNotes(updated);
                  setNoteInput("");
                }
              }}
              placeholder="Type a note and press Enter..."
              rows={2}
              style={{
                width: "100%", background: "#111b21", border: "1px solid #2a3942", borderRadius: 8,
                padding: "10px 14px", color: "#e9edef", fontSize: 14, fontFamily: "inherit",
                resize: "vertical", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {notes.length > 0 && (
            <div style={{ padding: "0 20px 12px" }}>
              {notes.map((note) => (
                <div
                  key={note.id}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                    borderBottom: "1px solid #2a3942",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: "#e9edef", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{note.text}</div>
                    <div style={{ fontSize: 11, color: "#8696a0", marginTop: 4 }}>{relativeTime(note.createdAt)}</div>
                  </div>
                  <button
                    onClick={() => {
                      const updated = notes.filter((n) => n.id !== note.id);
                      setNotes(updated);
                      saveNotes(updated);
                    }}
                    style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: 14, flexShrink: 0, padding: "0 4px" }}
                  >✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.3); }
        }
      `}</style>
      </div>
    </div>
  );
}