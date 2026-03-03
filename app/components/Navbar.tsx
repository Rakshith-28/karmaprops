"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/sync", { method: "POST" });
    } catch {}
    setSyncing(false);
  };

  const navItems = [
    { path: "/", label: "Home", icon: "🏡" },
    { path: "/explore", label: "Explore Data", icon: "📊" },
    { path: "/dashboard", label: "Auto Responder", icon: "💬" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  return (
    <nav style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 20px",
      height: 52,
      background: "#202c33",
      borderBottom: "1px solid #2a3942",
      fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
      position: "sticky",
      top: 0,
      zIndex: 200,
    }}>
      {/* Left — Logo */}
      <div
        onClick={() => router.push("/")}
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z" fill="#00a884" opacity="0.2" />
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.88L2 22l5.12-1.27C8.57 21.54 10.23 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.62 0-3.13-.46-4.42-1.24l-.31-.18-3.22.8.84-3.12-.2-.32C3.98 14.84 3.5 13.46 3.5 12c0-4.69 3.81-8.5 8.5-8.5s8.5 3.81 8.5 8.5-3.81 8.5-8.5 8.5z" fill="#00a884" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 600, color: "#e9edef" }}>KarmaProps</span>
        <span style={{ fontSize: 10, background: "#00a884", color: "#111b21", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>AI</span>
      </div>

      {/* Center — Nav Tabs */}
      <div style={{ display: "flex", gap: 4 }}>
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => router.push(item.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "inherit",
              background: isActive(item.path) ? "#00a884" : "transparent",
              color: isActive(item.path) ? "#111b21" : "#8696a0",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!isActive(item.path)) e.currentTarget.style.background = "#2a3942";
            }}
            onMouseLeave={(e) => {
              if (!isActive(item.path)) e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>

      {/* Right — Actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1px solid #2a3942",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            fontFamily: "inherit",
            background: "transparent",
            color: "#8696a0",
            opacity: syncing ? 0.5 : 1,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#00a884"; e.currentTarget.style.color = "#00a884"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#2a3942"; e.currentTarget.style.color = "#8696a0"; }}
          title="Sync DoorLoop Data"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ animation: syncing ? "spin 1s linear infinite" : "none" }}>
            <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
          </svg>
          {syncing ? "Syncing..." : "Sync"}
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </nav>
  );
}