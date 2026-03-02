import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    // Gather summary data for AI context
    const [properties, tenants, owners, vendors, leases, tasks, units] = await Promise.all([
      prisma.property.findMany({ where: { active: true }, select: { id: true, name: true, street1: true, city: true, state: true, type: true, amenities: true, numActiveUnits: true } }),
      prisma.people.findMany({ where: { type: "TENANT" }, select: { id: true, firstName: true, lastName: true, phone: true, email: true } }),
      prisma.people.findMany({ where: { type: "OWNER" }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, notes: true } }),
      prisma.people.findMany({ where: { type: "VENDOR" }, select: { id: true, firstName: true, lastName: true, phone: true, email: true, notes: true } }),
      prisma.lease.findMany({ select: { id: true, tenantId: true, propertyId: true, unitId: true, status: true, startDate: true, endDate: true, monthlyRent: true } }),
      prisma.task.findMany({ select: { id: true, title: true, status: true, priority: true, propertyId: true, tenantId: true, assignedTo: true, createdAt: true } }),
      prisma.unit.findMany({ where: { active: true }, select: { id: true, name: true, propertyId: true, beds: true, baths: true, marketRent: true, size: true } }),
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
- ${tenants.length} tenants, ${owners.length} owners, ${vendors.length} vendors
- ${activeLeases.length} active leases (total monthly rent: $${totalRent.toLocaleString()})
- ${expiringLeases.length} leases expiring within 60 days
- ${openTasks.length} open maintenance tasks

PROPERTIES:
${properties.map(p => `- ${p.name} | ${p.city}, ${p.state} | Type: ${p.type} | Units: ${p.numActiveUnits || 0} | Amenities: ${(p.amenities || []).join(", ")}`).join("\n")}

VACANT UNITS:
${vacantUnits.map(u => {
  const prop = properties.find(p => p.id === u.propertyId);
  return `- ${prop?.name || "Unknown"} - ${u.name}: ${u.beds || "?"}BR/${u.baths || "?"}BA, ${u.size || "?"}sqft, $${u.marketRent || "?"}/mo`;
}).join("\n") || "None"}

EXPIRING LEASES (next 60 days):
${expiringLeases.map(l => {
  const tenant = tenants.find(t => t.id === l.tenantId);
  return `- ${tenant?.firstName || "?"} ${tenant?.lastName || ""} | Rent: $${l.monthlyRent || "?"}/mo | Expires: ${l.endDate ? new Date(l.endDate).toLocaleDateString() : "?"}`;
}).join("\n") || "None"}

OPEN TASKS:
${openTasks.slice(0, 20).map(t => `- ${t.title || "Untitled"} | Status: ${t.status} | Priority: ${t.priority || "Normal"} | Assigned: ${t.assignedTo || "Unassigned"}`).join("\n") || "None"}

TENANTS:
${tenants.slice(0, 30).map(t => `- ${t.firstName || ""} ${t.lastName || ""} | ${t.phone || "No phone"} | ${t.email || "No email"}`).join("\n")}

OWNERS:
${owners.map(o => `- ${o.firstName || ""} ${o.lastName || ""} | ${o.phone || "No phone"} | Company: ${o.notes || "N/A"}`).join("\n")}

VENDORS:
${vendors.map(v => `- ${v.firstName || ""} ${v.lastName || ""} | ${v.phone || "No phone"} | ${v.notes || "N/A"}`).join("\n")}`;

    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a smart property management assistant for KarmaProps. You have access to the complete database. Answer questions accurately using ONLY the data provided below. Be concise and helpful. Format numbers nicely. If asked for lists, use clean formatting. If data isn't available, say so honestly.

${context}`,
        },
        { role: "user", content: message },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    });

    const reply = result.choices[0]?.message?.content || "Sorry, I couldn't process that question.";
    return Response.json({ reply });
  } catch (error: any) {
    console.error("Explore chat error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}