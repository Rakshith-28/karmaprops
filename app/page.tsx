"use client";

import { useState, useRef, useEffect } from "react";

type Message = {
  role: "user" | "ai";
  text: string;
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Add user message to chat
    const userMsg: Message = { role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const data = await res.json();

      const aiMsg: Message = {
        role: "ai",
        text: data.reply || "Sorry, I couldn't generate a response.",
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (error) {
      console.error("Error:", error);
      const errorMsg: Message = {
        role: "ai",
        text: "Something went wrong. Please try again.",
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") sendMessage();
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏠 Property Assistant</h1>
      <p style={styles.subtitle}>
        Ask me anything about the property — availability, pricing, pets, amenities, and more!
      </p>

      {/* Chat Messages Area */}
      <div style={styles.chatBox}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>No messages yet. Ask a question to get started!</p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...styles.messageBubble,
              ...(msg.role === "user" ? styles.userBubble : styles.aiBubble),
            }}
          >
            <span style={styles.roleLabel}>
              {msg.role === "user" ? "You" : "AI"}
            </span>
            <p style={styles.messageText}>{msg.text}</p>
          </div>
        ))}

        {loading && (
          <div style={{ ...styles.messageBubble, ...styles.aiBubble }}>
            <span style={styles.roleLabel}>AI</span>
            <p style={styles.messageText}>Thinking...</p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={styles.inputArea}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your question..."
          style={styles.input}
          disabled={loading}
        />
        <button onClick={sendMessage} disabled={loading} style={styles.button}>
          {loading ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

// Inline styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: "700px",
    margin: "40px auto",
    padding: "0 20px",
    fontFamily: "Arial, sans-serif",
  },
  title: {
    fontSize: "28px",
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: "4px",
  },
  subtitle: {
    textAlign: "center",
    color: "#666",
    fontSize: "14px",
    marginBottom: "20px",
  },
  chatBox: {
    border: "1px solid #ddd",
    borderRadius: "12px",
    height: "450px",
    overflowY: "auto",
    padding: "16px",
    backgroundColor: "#f9f9f9",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  placeholder: {
    textAlign: "center",
    color: "#aaa",
    marginTop: "180px",
    fontSize: "14px",
  },
  messageBubble: {
    padding: "10px 14px",
    borderRadius: "10px",
    maxWidth: "80%",
  },
  userBubble: {
    backgroundColor: "#007bff",
    color: "#fff",
    alignSelf: "flex-end",
  },
  aiBubble: {
    backgroundColor: "#e9ecef",
    color: "#222",
    alignSelf: "flex-start",
  },
  roleLabel: {
    fontSize: "11px",
    fontWeight: "bold",
    opacity: 0.7,
    display: "block",
    marginBottom: "4px",
  },
  messageText: {
    margin: 0,
    fontSize: "14px",
    lineHeight: "1.5",
  },
  inputArea: {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "14px",
    outline: "none",
  },
  button: {
    padding: "12px 24px",
    backgroundColor: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    cursor: "pointer",
    fontWeight: "bold",
  },
};