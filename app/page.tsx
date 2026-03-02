"use client";

import { useRouter } from "next/navigation";

export default function Home() {
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
      gap: 40,
    }}>
      {/* Logo & Title */}
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#00a884" opacity="0.2" />
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.62 0-3.13-.46-4.42-1.24l-.31-.18-3.22.8.84-3.12-.2-.32C3.98 14.84 3.5 13.46 3.5 12c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5-3.81 8.5-8.5 8.5z" fill="#00a884" />
          </svg>
          <span style={{ fontSize: 36, fontWeight: 300, letterSpacing: "-0.02em" }}>KarmaProps</span>
          <span style={{ fontSize: 13, background: "#00a884", color: "#111b21", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>AI</span>
        </div>
        <p style={{ fontSize: 16, color: "#8696a0", fontWeight: 300 }}>AI-Powered Property Management</p>
      </div>

      {/* Two Module Cards */}
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "center" }}>

        {/* Module 1: Explore Data */}
        <div
          onClick={() => router.push("/explore")}
          style={{
            width: 320,
            padding: "32px 28px",
            background: "#202c33",
            borderRadius: 16,
            cursor: "pointer",
            border: "1px solid #2a3942",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00a884"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a3942"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 8, color: "#e9edef" }}>Explore Data</div>
          <p style={{ fontSize: 14, color: "#8696a0", lineHeight: "20px" }}>
            View and manage your properties, tenants, owners, vendors, leases, and maintenance tasks. Ask AI questions about your data.
          </p>
          <div style={{ marginTop: 16, fontSize: 13, color: "#00a884", fontWeight: 500 }}>Open Dashboard →</div>
        </div>

        {/* Module 2: Auto Responder */}
        <div
          onClick={() => router.push("/dashboard")}
          style={{
            width: 320,
            padding: "32px 28px",
            background: "#202c33",
            borderRadius: 16,
            cursor: "pointer",
            border: "1px solid #2a3942",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00a884"; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a3942"; e.currentTarget.style.transform = "translateY(0)"; }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>💬</div>
          <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 8, color: "#e9edef" }}>Auto Responder</div>
          <p style={{ fontSize: 14, color: "#8696a0", lineHeight: "20px" }}>
            WhatsApp-style messaging dashboard. AI agent Alex auto-replies to tenants, prospects, owners, and vendors.
          </p>
          <div style={{ marginTop: 16, fontSize: 13, color: "#00a884", fontWeight: 500 }}>Open Messages →</div>
        </div>
      </div>

      {/* Footer */}
      <p style={{ fontSize: 12, color: "#667781", marginTop: 20 }}>
        Powered by Groq AI • DoorLoop • OpenPhone
      </p>
    </div>
  );
}