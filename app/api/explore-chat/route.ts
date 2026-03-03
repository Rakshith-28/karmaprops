import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// GET - fetch chat history
export async function GET() {
  try {
    const messages = await prisma.exploreChat.findMany({
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return Response.json({ messages });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - clear chat history
export async function DELETE() {
  try {
    await prisma.exploreChat.deleteMany();
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST - send message and get AI response
export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    // Save user message
    await prisma.exploreChat.create({
      data: { role: "user", message },
    });

    // Load previous conversation history (last 20 messages for context)
    const history = await prisma.exploreChat.findMany({
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    // Gather database summary for AI context
    const [properties, tenants, owners, vendors, leases, tasks, units] = await Promise.all([
      prisma.property.findMany({ where: { active: true }, select: { id: true, name: true, city: true, state: true, type: true, numActiveUnits: true } }),
      prisma.people.findMany({ where: { type: "TENANT" }, select: { id: true, firstName: true, lastName: true, phone: true } }),
      prisma.people.findMany({ where: { type: "OWNER" }, select: { id: true, firstName: true, lastName: true, notes: true } }),
      prisma.people.findMany({ where: { type: "VENDOR" }, select: { id: true, firstName: true, lastName: true, notes: true } }),
      prisma.lease.findMany({ select: { id: true, tenantId: true, propertyId: true, unitId: true, status: true, endDate: true, monthlyRent: true } }),
      prisma.task.findMany({ select: { id: true, title: true, status: true, priority: true, assignedTo: true, createdAt: true } }),
      prisma.unit.findMany({ where: { active: true }, select: { id: true, name: true, propertyId: true, beds: true, baths: true, marketRent: true } }),
    ]);

    const activeLeases = leases.filter(l => l.status === "ACTIVE" || l.status === "CURRENT");
    const occupiedUnitIds = new Set(activeLeases.map(l => l.unitId).filter(Boolean));
    const vacantUnits = units.filter(u => !occupiedUnitIds.has(u.id));
    const openTasks = tasks.filter(t => t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "CANCELLED");

    const now = new Date();
    const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const expiringLeases = activeLeases.filter(l => l.endDate && new Date(l.endDate) <= sixtyDays);
    const totalRent = activeLeases.reduce((sum, l) => sum + (l.monthlyRent || 0), 0);

    const context = `DATABASE SUMMARY:
- ${properties.length} active properties
- ${units.length} active units (${vacantUnits.length} vacant, ${units.length - vacantUnits.length} occupied)
- Occupancy rate: ${units.length > 0 ? Math.round(((units.length - vacantUnits.length) / units.length) * 100) : 0}%
- ${tenants.length} tenants, ${owners.length} owners, ${vendors.length} vendors
- ${activeLeases.length} active leases (total monthly rent: $${totalRent.toLocaleString()})
- ${expiringLeases.length} leases expiring within 60 days
- ${openTasks.length} open maintenance tasks

PROPERTIES (${properties.length}):
${properties.slice(0, 20).map(p => {
  const propUnits = units.filter(u => u.propertyId === p.id);
  const propVacant = propUnits.filter(u => !occupiedUnitIds.has(u.id));
  return `- ${p.name} | ${p.city}, ${p.state} | ${propUnits.length} units (${propVacant.length} vacant)`;
}).join("\n")}

VACANT UNITS (${vacantUnits.length}):
${vacantUnits.slice(0, 15).map(u => {
  const prop = properties.find(p => p.id === u.propertyId);
  return `- ${prop?.name || "?"} - ${u.name}: ${u.beds || "?"}BR/${u.baths || "?"}BA, $${u.marketRent || "?"}/mo`;
}).join("\n") || "None"}

TENANTS (showing first 20 of ${tenants.length}):
${tenants.slice(0, 20).map(t => `- ${t.firstName || ""} ${t.lastName || ""} | ${t.phone || "No phone"}`).join("\n")}

OWNERS (${owners.length}):
${owners.map(o => `- ${o.firstName || ""} ${o.lastName || ""} | ${o.notes || "N/A"}`).join("\n")}

VENDORS (${vendors.length}):
${vendors.map(v => `- ${v.firstName || ""} ${v.lastName || ""} | ${v.notes || "N/A"}`).join("\n")}

EXPIRING LEASES (${expiringLeases.length}):
${expiringLeases.map(l => {
  const tenant = tenants.find(t => t.id === l.tenantId);
  return `- ${tenant?.firstName || "?"} ${tenant?.lastName || ""} | $${l.monthlyRent || "?"}/mo | Expires: ${l.endDate ? new Date(l.endDate).toLocaleDateString() : "?"}`;
}).join("\n") || "None"}

OPEN TASKS (${openTasks.length}):
${openTasks.slice(0, 15).map(t => `- ${t.title || "Untitled"} | ${t.status} | ${t.priority || "Normal"} | Assigned: ${t.assignedTo || "Unassigned"}`).join("\n") || "None"}`;

    // Build conversation messages for Groq
    const groqMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: `You are KarmaProps AI Assistant — a smart, helpful property management assistant. You have access to the KarmaProps database summary below.

RULES:
- Answer questions accurately using ONLY the data provided
- Be concise, clear, and professional
- Format numbers nicely with commas and dollar signs
- When listing items, use clean formatting
- If you can calculate something from the data, do it
- If data isn't available, say so honestly
- Remember previous questions in this conversation
- Suggest actions or things to look into when appropriate

${context}`,
      },
    ];

    // Add conversation history
    for (const h of history) {
      groqMessages.push({
        role: h.role as "user" | "assistant",
        content: h.message,
      });
    }

    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: groqMessages,
      max_tokens: 1000,
      temperature: 0.3,
    });

    const reply = result.choices[0]?.message?.content || "Sorry, I couldn't process that question.";

    // Save assistant response
    await prisma.exploreChat.create({
      data: { role: "assistant", message: reply },
    });

    return Response.json({ reply });
  } catch (error: any) {
    console.error("Explore chat error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}