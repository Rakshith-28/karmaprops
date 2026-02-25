"use client";

import { useState, useRef, useEffect } from "react";
import Nav from "../components/Nav";

interface Message {
  role: "user" | "ai";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "ai", content: data.reply || data.error || "No response" }]);
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "Something went wrong. Please try again." }]);
    }

    setLoading(false);
  }

  return (
    <>
      <Nav />
      <div className="chat-container">
        <div className="chat-header">
          <h1 className="serif">Property Assistant</h1>
          <p>Ask anything about our properties — availability, pricing, pets, and more.</p>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="icon">💬</div>
              <p>Start a conversation — ask about available units, pricing, or tours.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-bubble ${msg.role}`}>
              <div className="label">{msg.role === "user" ? "You" : "Assistant"}</div>
              {msg.content.split("\n").map((line, j) => (
  <span key={j}>
    {line}
    <br />
  </span>
))}
            </div>
          ))}
          {loading && (
            <div className="chat-bubble ai">
              <div className="label">Assistant</div>
              <span style={{ opacity: 0.5 }}>Thinking...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <form onSubmit={handleSend} className="chat-input-form">
            <input
              type="text"
              className="input"
              placeholder="Type your question..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Send
            </button>
          </form>
        </div>
      </div>
    </>
  );
}