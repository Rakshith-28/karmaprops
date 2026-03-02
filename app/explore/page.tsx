"use client";

import { useRouter } from "next/navigation";

export default function Explore() {
  const router = useRouter();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#111b21",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
      color: "#e9edef",
      gap: 20,
    }}>
      <div style={{ fontSize: 48, marginBottom: 8 }}>📊</div>
      <div style={{ fontSize: 24, fontWeight: 300 }}>Explore Data</div>
      <p style={{ fontSize: 14, color: "#8696a0", textAlign: "center", maxWidth: 400 }}>
        This module is under development. Property management dashboard with AI-powered insights coming soon.
      </p>
      <button
        onClick={() => router.push("/")}
        style={{
          marginTop: 16, padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
          fontSize: 14, fontWeight: 500, fontFamily: "inherit", background: "#00a884", color: "#111b21",
        }}
      >
        ← Back to Home
      </button>
    </div>
  );
}