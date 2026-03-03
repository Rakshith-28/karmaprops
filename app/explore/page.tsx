"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ───
type Section = "overview" | "properties" | "tenants" | "prospects" | "owners" | "vendors" | "leases" | "tasks";

type ChatMsg = { role: "user" | "assistant"; text: string };

// ─── Helpers ───
function formatPhone(phone: string): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return phone;
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString()}`;
}

// ─── Sidebar Icons ───
const icons: Record<string, string> = {
  overview: "📊", properties: "🏠", tenants: "👤", prospects: "🔍",
  owners: "👑", vendors: "🔧", leases: "📄", tasks: "📋",
};

// ─── Stat Card ───
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ background: "#202c33", borderRadius: 12, padding: "20px 24px", flex: "1 1 200px", minWidth: 180, borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 13, color: "#8696a0", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color: "#e9edef" }}>{value}</div>
    </div>
  );
}

// ─── Data Table ───
function DataTable({ columns, data, onRowClick }: { columns: { key: string; label: string; render?: (row: any) => string }[]; data: any[]; onRowClick?: (row: any) => void }) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = data.filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return columns.some((col) => {
      const val = col.render ? col.render(row) : String(row[col.key] || "");
      return val.toLowerCase().includes(q);
    });
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const aVal = a[sortKey] || "";
        const bVal = b[sortKey] || "";
        const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      })
    : filtered;

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ background: "#202c33", border: "1px solid #2a3942", borderRadius: 8, padding: "8px 14px", color: "#e9edef", fontSize: 14, width: 300, outline: "none", fontFamily: "inherit" }}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: "#8696a0" }}>{sorted.length} records</span>
      </div>
      <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid #2a3942" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#202c33" }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => { setSortKey(col.key); setSortDir(sortKey === col.key && sortDir === "asc" ? "desc" : "asc"); }}
                  style={{ textAlign: "left", padding: "10px 14px", color: "#8696a0", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", borderBottom: "1px solid #2a3942", userSelect: "none" }}
                >
                  {col.label} {sortKey === col.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr
                key={row.id || i}
                onClick={() => onRowClick?.(row)}
                style={{ borderBottom: "1px solid #1a2730", cursor: onRowClick ? "pointer" : "default" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2730")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ padding: "10px 14px", color: "#e9edef", whiteSpace: "nowrap", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {col.render ? col.render(row) : String(row[col.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: "center", color: "#8696a0" }}>No data found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detail Panel ───
function DetailPanel({ data, onClose }: { data: any; onClose: () => void }) {
  if (!data) return null;
  return (
    <div style={{ position: "fixed", top: 0, right: 0, width: 400, height: "100vh", background: "#202c33", borderLeft: "1px solid #2a3942", zIndex: 100, overflowY: "auto", padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <span style={{ fontSize: 18, fontWeight: 500, color: "#e9edef" }}>Details</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#8696a0", fontSize: 20, cursor: "pointer" }}>✕</button>
      </div>
      {Object.entries(data).filter(([k]) => k !== "rawData" && k !== "id").map(([key, val]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "#8696a0", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{key}</div>
          <div style={{ fontSize: 14, color: "#e9edef", wordBreak: "break-word" }}>
            {val === null || val === undefined ? "—" : typeof val === "object" ? JSON.stringify(val, null, 2).slice(0, 200) : String(val)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───
export default function ExplorePage() {
  const [section, setSection] = useState<Section>("overview");
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [detailData, setDetailData] = useState<any>(null);

  // Data states
  const [overview, setOverview] = useState<any>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [prospects, setProspects] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [leases, setLeases] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch data when section changes
  useEffect(() => {
    setLoading(true);
    setDetailData(null);
    const endpoints: Record<Section, string> = {
      overview: "/api/overview",
      properties: "/api/properties",
      tenants: "/api/tenants",
      prospects: "/api/prospects",
      owners: "/api/owners",
      vendors: "/api/vendors",
      leases: "/api/leases",
      tasks: "/api/tasks",
    };

    fetch(endpoints[section])
      .then((r) => r.json())
      .then((data) => {
        if (section === "overview") setOverview(data);
        else if (section === "properties") setProperties(data.properties || []);
        else if (section === "tenants") setTenants(data.tenants || []);
        else if (section === "prospects") setProspects(data.prospects || []);
        else if (section === "owners") setOwners(data.owners || []);
        else if (section === "vendors") setVendors(data.vendors || []);
        else if (section === "leases") setLeases(data.leases || []);
        else if (section === "tasks") setTasks(data.tasks || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [section]);

  // Chat
  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/explore-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", text: data.reply || data.error || "No response" }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", text: "Failed to get response. Try again." }]);
    }
    setChatLoading(false);
  };

  // Load chat history on mount
  useEffect(() => {
    fetch("/api/explore-chat")
      .then((r) => r.json())
      .then((data) => {
        if (data.messages) {
          setChatMessages(data.messages.map((m: any) => ({ role: m.role, text: m.message })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const sidebarItems: { key: Section; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "properties", label: "Properties" },
    { key: "tenants", label: "Tenants" },
    { key: "prospects", label: "Prospects" },
    { key: "owners", label: "Owners" },
    { key: "vendors", label: "Vendors" },
    { key: "leases", label: "Leases" },
    { key: "tasks", label: "Tasks" },
  ];

  // ─── Section content renderers ───
  function renderOverview() {
    if (!overview) return <div style={{ color: "#8696a0" }}>Loading...</div>;
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 20 }}>Dashboard Overview</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <StatCard label="Properties" value={overview.properties} color="#00a884" />
          <StatCard label="Units" value={overview.units} color="#00a884" />
          <StatCard label="Vacant Units" value={overview.vacantUnits} color="#f59e0b" />
          <StatCard label="Active Leases" value={overview.activeLeases} color="#2563eb" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <StatCard label="Tenants" value={overview.tenants} color="#2563eb" />
          <StatCard label="Prospects" value={overview.prospects} color="#16a34a" />
          <StatCard label="Owners" value={overview.owners} color="#9333ea" />
          <StatCard label="Vendors" value={overview.vendors} color="#ea580c" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <StatCard label="Expiring Leases (60 days)" value={overview.expiringLeases} color="#ef4444" />
          <StatCard label="Open Tasks" value={overview.openTasks} color="#f59e0b" />
          <StatCard label="Total Messages" value={overview.totalMessages} color="#8696a0" />
          <StatCard label="Pending Messages" value={overview.pendingMessages} color="#f59e0b" />
        </div>
      </div>
    );
  }

  function renderProperties() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Properties</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{properties.length} active properties</p>
        <DataTable
          columns={[
            { key: "name", label: "Name" },
            { key: "city", label: "City" },
            { key: "state", label: "State" },
            { key: "type", label: "Type" },
            { key: "units", label: "Units", render: (r) => String(r.units?.length || 0) },
            { key: "amenities", label: "Amenities", render: (r) => (r.amenities || []).slice(0, 3).join(", ") || "—" },
          ]}
          data={properties}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderTenants() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Tenants</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{tenants.length} tenants</p>
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—" },
            { key: "phone", label: "Phone", render: (r) => formatPhone(r.phone) },
            { key: "email", label: "Email", render: (r) => r.email || "—" },
            { key: "status", label: "Status", render: (r) => r.status || "—" },
            { key: "leases", label: "Active Leases", render: (r) => String(r.leases?.filter((l: any) => l.status === "ACTIVE" || l.status === "CURRENT").length || 0) },
            { key: "tasks", label: "Open Tasks", render: (r) => String(r.tasks?.filter((t: any) => t.status !== "COMPLETED" && t.status !== "CLOSED").length || 0) },
          ]}
          data={tenants}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderProspects() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Prospects</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{prospects.length} prospects</p>
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—" },
            { key: "phone", label: "Phone", render: (r) => formatPhone(r.phone) },
            { key: "email", label: "Email", render: (r) => r.email || "—" },
            { key: "status", label: "Status", render: (r) => r.status || "—" },
          ]}
          data={prospects}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderOwners() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Owners</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{owners.length} owners</p>
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—" },
            { key: "phone", label: "Phone", render: (r) => formatPhone(r.phone) },
            { key: "email", label: "Email", render: (r) => r.email || "—" },
            { key: "company", label: "Company", render: (r) => r.notes || "—" },
            { key: "status", label: "Status", render: (r) => r.status || "—" },
          ]}
          data={owners}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderVendors() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Vendors</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{vendors.length} vendors</p>
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r) => `${r.firstName || ""} ${r.lastName || ""}`.trim() || "—" },
            { key: "phone", label: "Phone", render: (r) => formatPhone(r.phone) },
            { key: "email", label: "Email", render: (r) => r.email || "—" },
            { key: "company", label: "Company", render: (r) => r.notes || "—" },
            { key: "status", label: "Status", render: (r) => r.status || "—" },
          ]}
          data={vendors}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderLeases() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Leases</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{leases.length} leases</p>
        <DataTable
          columns={[
            { key: "tenant", label: "Tenant", render: (r) => r.tenant ? `${r.tenant.firstName || ""} ${r.tenant.lastName || ""}`.trim() : "—" },
            { key: "status", label: "Status" },
            { key: "monthlyRent", label: "Rent", render: (r) => formatCurrency(r.monthlyRent) },
            { key: "startDate", label: "Start", render: (r) => formatDate(r.startDate) },
            { key: "endDate", label: "End", render: (r) => formatDate(r.endDate) },
            { key: "leaseType", label: "Type", render: (r) => r.leaseType || "—" },
          ]}
          data={leases}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  function renderTasks() {
    return (
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 500, color: "#e9edef", marginBottom: 4 }}>Maintenance Tasks</h2>
        <p style={{ fontSize: 14, color: "#8696a0", marginBottom: 16 }}>{tasks.length} tasks</p>
        <DataTable
          columns={[
            { key: "title", label: "Title", render: (r) => r.title || "Untitled" },
            { key: "status", label: "Status" },
            { key: "priority", label: "Priority", render: (r) => r.priority || "Normal" },
            { key: "assignedTo", label: "Assigned To", render: (r) => r.assignedTo || "Unassigned" },
            { key: "tenant", label: "Tenant", render: (r) => r.tenant ? `${r.tenant.firstName || ""} ${r.tenant.lastName || ""}`.trim() : "—" },
            { key: "createdAt", label: "Created", render: (r) => formatDate(r.createdAt) },
          ]}
          data={tasks}
          onRowClick={setDetailData}
        />
      </div>
    );
  }

  const renderers: Record<Section, () => React.ReactNode> = {
    overview: renderOverview,
    properties: renderProperties,
    tenants: renderTenants,
    prospects: renderProspects,
    owners: renderOwners,
    vendors: renderVendors,
    leases: renderLeases,
    tasks: renderTasks,
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "#111b21", fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif", color: "#e9edef", overflow: "hidden" }}>

      {/* ═══ SIDEBAR ═══ */}
      <div style={{ width: 220, minWidth: 220, background: "#202c33", borderRight: "1px solid #2a3942", display: "flex", flexDirection: "column" }}>
        {/* Logo */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #2a3942", display: "flex", alignItems: "center", gap: 8 }}>
          <a href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: "#e9edef" }}>KarmaProps</span>
            <span style={{ fontSize: 10, background: "#00a884", color: "#111b21", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>AI</span>
          </a>
        </div>

        {/* Nav Items */}
        <div style={{ flex: 1, padding: "8px 0" }}>
          {sidebarItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 20px",
                border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14,
                background: section === item.key ? "#2a3942" : "transparent",
                color: section === item.key ? "#00a884" : "#8696a0",
                borderLeft: section === item.key ? "3px solid #00a884" : "3px solid transparent",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (section !== item.key) e.currentTarget.style.background = "#1a2730"; }}
              onMouseLeave={(e) => { if (section !== item.key) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 16 }}>{icons[item.key]}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* AI Chat Toggle */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #2a3942" }}>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            style={{
              width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 14, fontWeight: 500, fontFamily: "inherit",
              background: chatOpen ? "#00a884" : "#2a3942",
              color: chatOpen ? "#111b21" : "#e9edef",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.15s",
            }}
          >
            🤖 {chatOpen ? "Close AI Chat" : "Ask AI"}
          </button>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 200, color: "#8696a0" }}>Loading...</div>
        ) : (
          renderers[section]()
        )}
      </div>

      {/* ═══ DETAIL PANEL ═══ */}
      {detailData && <DetailPanel data={detailData} onClose={() => setDetailData(null)} />}

      {/* ═══ AI CHAT SIDEBAR ═══ */}
      {chatOpen && (
        <div style={{ width: 380, minWidth: 380, background: "#202c33", borderLeft: "1px solid #2a3942", display: "flex", flexDirection: "column" }}>
          {/* Chat Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #2a3942", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18 }}>🤖</span>
              <span style={{ fontSize: 16, fontWeight: 500, color: "#e9edef" }}>AI Assistant</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={async () => {
                  await fetch("/api/explore-chat", { method: "DELETE" });
                  setChatMessages([]);
                }}
                style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: 12 }}
                title="Clear chat history"
              >
                Clear
              </button>
              <button onClick={() => setChatOpen(false)} style={{ background: "none", border: "none", color: "#8696a0", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
          </div>

          {/* Chat Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: "center", color: "#8696a0", fontSize: 14, marginTop: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🤖</div>
                <div>Ask me anything about your data</div>
                <div style={{ marginTop: 12, fontSize: 12, color: "#667781" }}>
                  Try: "Which properties have vacancies?"<br />
                  "How many leases expire next month?"<br />
                  "Show me all open maintenance tasks"
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{
                  maxWidth: "85%", padding: "8px 12px", borderRadius: 8, fontSize: 14, lineHeight: "20px", whiteSpace: "pre-wrap", wordBreak: "break-word",
                  background: msg.role === "user" ? "#005c4b" : "#111b21",
                  color: "#e9edef",
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "#111b21", color: "#8696a0", fontSize: 14 }}>Thinking...</div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid #2a3942", display: "flex", gap: 8 }}>
            <input
              type="text"
              placeholder="Ask about your data..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
              style={{ flex: 1, background: "#111b21", border: "1px solid #2a3942", borderRadius: 8, padding: "10px 14px", color: "#e9edef", fontSize: 14, outline: "none", fontFamily: "inherit" }}
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              style={{ padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: "#00a884", color: "#111b21", opacity: chatLoading || !chatInput.trim() ? 0.5 : 1 }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}