import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";
import { getQuoMessages, formatQuoHistory } from "@/lib/quo";

type PropertyUnit = {
  name: string;
  beds: number | null;
  baths: number | null;
  size: number | null;
  marketRent: number | null;
  description: string | null;
  amenities: string[];
};

type ActiveProperty = {
  name: string;
  street1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  type: string | null;
  description: string | null;
  amenities: string[];
  petPolicySmallDogs: string | null;
  petPolicyLargeDogs: string | null;
  petPolicyCats: string | null;
  units: PropertyUnit[];
};

type ConversationMessage = {
  incomingMessage: string;
  aiReply: string | null;
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Helper: Format property for prospect context ───
function formatProperty(p: ActiveProperty): string {
  const units = p.units.map((u: PropertyUnit) =>
    `  - ${u.name}: ${u.beds || "?"}BR/${u.baths || "?"}BA, ${u.size || "?"}sqft, $${u.marketRent || "?"}/mo${u.amenities?.length ? " | " + u.amenities.join(", ") : ""}`
  ).join("\n");

  return `Property: ${p.name}
Address: ${p.street1 || ""}, ${p.city || ""} ${p.state || ""} ${p.zip || ""}
Type: ${p.type || "N/A"}
Description: ${p.description || "N/A"}
Amenities: ${p.amenities?.join(", ") || "N/A"}
Pets - Small Dogs: ${p.petPolicySmallDogs || "Not specified"}
Pets - Large Dogs: ${p.petPolicyLargeDogs || "Not specified"}
Pets - Cats: ${p.petPolicyCats || "Not specified"}
Units:
${units || "  No units listed"}`;
}

// ─── Identify caller: tenant, owner, vendor, or prospect ───
async function identifyCaller(phone: string) {
  try {
    const phoneLast10 = phone.replace(/\D/g, "").slice(-10);
    console.log(`[DEBUG] Looking up phone: ${phoneLast10}`);

    // Check all people types in one query
    const person = await prisma.people.findFirst({
      where: {
        OR: [
          { phone: { contains: phoneLast10 } },
          { mobilePhone: { contains: phoneLast10 } },
        ],
      },
    });

    console.log(`[DEBUG] Person found:`, person ? `${person.firstName} ${person.lastName} (${person.type})` : "NONE");

    if (!person) return { type: "prospect" as const, person: null };

    // ─── TENANT FLOW ───
    if (person.type === "TENANT") {
      const lease = await prisma.lease.findFirst({
        where: {
          tenantId: person.id,
          status: { in: ["ACTIVE", "CURRENT"] },
        },
      });

      const tasks = await prisma.task.findMany({
        where: {
          tenantId: person.id,
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      let propertyInfo = null;
      if (lease?.unitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: lease.unitId },
          include: { property: true },
        });
        propertyInfo = unit;
      }

      return {
        type: "tenant" as const,
        person,
        lease,
        tasks,
        propertyInfo,
      };
    }

    // ─── OWNER FLOW ───
    if (person.type === "OWNER") {
      // Get properties this owner manages (stored as property IDs in rawData)
      const ownerPropertyIds: string[] = (person.rawData as any)?.properties || [];
      let ownerProperties: any[] = [];

      if (ownerPropertyIds.length > 0) {
        ownerProperties = await prisma.property.findMany({
          where: { id: { in: ownerPropertyIds } },
          include: {
            units: { where: { active: true } },
          },
        });
      }

      // Get active leases for owner's properties
      const ownerLeases = ownerPropertyIds.length > 0
        ? await prisma.lease.findMany({
            where: {
              propertyId: { in: ownerPropertyIds },
              status: { in: ["ACTIVE", "CURRENT"] },
            },
          })
        : [];

      // Get open tasks for owner's properties
      const ownerTasks = ownerPropertyIds.length > 0
        ? await prisma.task.findMany({
            where: {
              propertyId: { in: ownerPropertyIds },
              status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          })
        : [];

      return {
        type: "owner" as const,
        person,
        properties: ownerProperties,
        leases: ownerLeases,
        tasks: ownerTasks,
      };
    }

    // ─── VENDOR FLOW ───
    if (person.type === "VENDOR") {
      // Get tasks assigned to this vendor (by name match)
      const vendorName = `${person.firstName || ""} ${person.lastName || ""}`.trim();
      const companyName = person.notes?.split(" | ")[0] || "";

      const vendorTasks = await prisma.task.findMany({
        where: {
          status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
          OR: [
            ...(vendorName ? [{ assignedTo: { contains: vendorName } }] : []),
            ...(companyName ? [{ assignedTo: { contains: companyName } }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      return {
        type: "vendor" as const,
        person,
        tasks: vendorTasks,
      };
    }

    // ─── PROSPECT FLOW (default) ───
    return { type: "prospect" as const, person };

  } catch (error) {
    console.warn("Failed to identify caller:", error);
    return { type: "prospect" as const, person: null };
  }
}

// ─── Build context for PROSPECTS (existing logic) ───
async function buildProspectContext(message: string) {
  let retries = 3;
  let lastError;

  while (retries > 0) {
    try {
      const messageLower = message.toLowerCase();
      const unitFilters: any = { active: true };

      const bedMatch = messageLower.match(/(\d)\s*(?:br|bed|bedroom)/);
      if (bedMatch) unitFilters.beds = parseInt(bedMatch[1]);

      const cities = await prisma.property.findMany({
        where: { active: true },
        select: { city: true },
        distinct: ["city"],
      });

      let cityFilter: string | undefined;
      for (const c of cities) {
        if (c.city && messageLower.includes(c.city.toLowerCase())) {
          cityFilter = c.city;
          break;
        }
      }

      const priceMatch = messageLower.match(/(?:under|below|max|budget|less than)\s*\$?(\d{3,4})/);
      const maxRent = priceMatch ? parseInt(priceMatch[1]) : undefined;

      const propertyWhere: any = { active: true };
      if (cityFilter) propertyWhere.city = cityFilter;

      let properties = await prisma.property.findMany({
        where: propertyWhere,
        include: {
          units: {
            where: {
              active: true,
              ...(unitFilters.beds ? { beds: unitFilters.beds } : {}),
              ...(maxRent ? { marketRent: { lte: maxRent } } : {}),
            },
          },
        },
      });

      if (properties.length === 0) {
        properties = await prisma.property.findMany({
          where: { active: true },
          include: { units: { where: { active: true } } },
          take: 10,
        });
      }

      if (properties.length > 20) {
        properties = properties.slice(0, 20);
      }

      const propertyText = properties.map((p: any) => formatProperty(p)).join("\n---\n");
      const summary = `We manage 45 properties total across multiple cities. Below are some of our current listings:`;
      return `${summary}\n\n${propertyText}`;
    } catch (error: any) {
      lastError = error;
      retries--;
      if (retries > 0) {
        console.log(`DB connection failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
  }

  console.error("Failed to connect to database after retries:", lastError);
  return "No property data available at the moment.";
}

// ─── Build context for TENANTS ───
function buildTenantContext(callerInfo: any) {
  const { person, lease, tasks, propertyInfo } = callerInfo;

  let context = `TENANT INFO:
Name: ${person.firstName} ${person.lastName}
Phone: ${person.phone}
Email: ${person.email || "Not on file"}`;

  if (lease) {
    context += `\n\nLEASE DETAILS:
Status: ${lease.status}
Monthly Rent: $${lease.monthlyRent || "N/A"}
Lease Start: ${lease.startDate ? new Date(lease.startDate).toLocaleDateString() : "N/A"}
Lease End: ${lease.endDate ? new Date(lease.endDate).toLocaleDateString() : "N/A"}`;
  }

  if (propertyInfo) {
    context += `\n\nPROPERTY:
${propertyInfo.property?.name || "N/A"} - Unit ${propertyInfo.name || propertyInfo.unitNumber || "N/A"}
Address: ${propertyInfo.property?.street1 || ""}, ${propertyInfo.property?.city || ""} ${propertyInfo.property?.state || ""} ${propertyInfo.property?.zip || ""}`;
  }

  if (tasks && tasks.length > 0) {
    context += `\n\nOPEN MAINTENANCE REQUESTS:`;
    tasks.forEach((t: any) => {
      context += `\n- ${t.title || "Untitled"} (Status: ${t.status}, Created: ${new Date(t.createdAt).toLocaleDateString()})`;
    });
  } else {
    context += `\n\nOPEN MAINTENANCE REQUESTS: None`;
  }

  return context;
}

// ─── Build context for OWNERS ───
function buildOwnerContext(callerInfo: any) {
  const { person, properties, leases, tasks } = callerInfo;

  let context = `OWNER INFO:
Name: ${person.firstName} ${person.lastName}
Phone: ${person.phone || "Not on file"}
Email: ${person.email || "Not on file"}
Company: ${person.notes || "N/A"}`;

  if (properties && properties.length > 0) {
    context += `\n\nOWNER'S PROPERTIES (${properties.length}):`;
    properties.forEach((p: any) => {
      const occupiedUnits = leases.filter((l: any) => l.propertyId === p.id).length;
      const totalUnits = p.units?.length || 0;
      context += `\n- ${p.name} (${p.street1 || ""}, ${p.city || ""} ${p.state || ""})`;
      context += `\n  Units: ${totalUnits} total, ${occupiedUnits} occupied, ${totalUnits - occupiedUnits} vacant`;
    });
  } else {
    context += `\n\nOWNER'S PROPERTIES: None currently linked`;
  }

  if (leases && leases.length > 0) {
    context += `\n\nACTIVE LEASES (${leases.length}):`;
    leases.forEach((l: any) => {
      context += `\n- Property: ${l.propertyId} | Rent: $${l.monthlyRent || "N/A"}/mo | Ends: ${l.endDate ? new Date(l.endDate).toLocaleDateString() : "N/A"}`;
    });
  }

  if (tasks && tasks.length > 0) {
    context += `\n\nOPEN MAINTENANCE TASKS ON YOUR PROPERTIES (${tasks.length}):`;
    tasks.forEach((t: any) => {
      context += `\n- ${t.title || "Untitled"} | Status: ${t.status} | Priority: ${t.priority || "Normal"} | Created: ${new Date(t.createdAt).toLocaleDateString()}`;
    });
  } else {
    context += `\n\nOPEN MAINTENANCE TASKS: None`;
  }

  return context;
}

// ─── Build context for VENDORS ───
function buildVendorContext(callerInfo: any) {
  const { person, tasks } = callerInfo;

  let context = `VENDOR INFO:
Name: ${person.firstName} ${person.lastName}
Phone: ${person.phone || "Not on file"}
Email: ${person.email || "Not on file"}
Company: ${person.notes || "N/A"}`;

  if (tasks && tasks.length > 0) {
    context += `\n\nASSIGNED WORK ORDERS (${tasks.length}):`;
    tasks.forEach((t: any) => {
      context += `\n- ${t.title || "Untitled"}`;
      context += `\n  Property: ${t.propertyId || "N/A"} | Unit: ${t.unitId || "N/A"}`;
      context += `\n  Status: ${t.status} | Priority: ${t.priority || "Normal"}`;
      context += `\n  Created: ${new Date(t.createdAt).toLocaleDateString()}`;
      if (t.description) context += `\n  Details: ${t.description}`;
    });
  } else {
    context += `\n\nASSIGNED WORK ORDERS: None currently assigned`;
  }

  return context;
}

// ─── Get conversation history (KarmaProps DB + Quo/OpenPhone) ───
async function getConversationHistory(phone: string) {
  let history = "";

  // 1. Try fetching from Quo/OpenPhone (old + manual conversations)
  try {
    const quoMessages = await getQuoMessages(phone, 50);
    const quoHistory = formatQuoHistory(quoMessages, process.env.QUO_FROM_NUMBER || "");

    if (quoHistory) {
      history += quoHistory;
      console.log(`[HISTORY] Loaded ${quoMessages.length} messages from Quo for ${phone}`);
    }
  } catch (error) {
    console.warn("Failed to load Quo history:", error);
  }

  // 2. Also load KarmaProps DB messages (AI-generated ones)
  try {
    const dbMessages = await prisma.message.findMany({
      where: { fromPhone: phone },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (dbMessages.length > 0) {
      const dbHistory = dbMessages.map((m: ConversationMessage) =>
        `Them: ${m.incomingMessage}\nYou (Alex): ${m.aiReply || "(no reply sent)"}`
      ).join("\n");

      history += `\nRECENT KARMAPROPS MESSAGES:\n${dbHistory}\n`;
    }
  } catch (error) {
    console.warn("Failed to load DB history:", error);
  }

  return history;
}

// ─── System prompts ───
function getProspectSystemPrompt(propertyContext: string, conversationHistory: string) {
  return `You are a real human leasing agent named Alex who works at KarmaProps Property Management. You respond to rental prospects via text message exactly like a knowledgeable, friendly, and helpful real estate professional would.

PROPERTY DATA:
${propertyContext}
${conversationHistory}

HOW TO BEHAVE:
- You are Alex, a real leasing agent. Never say you are an AI, a bot, or an assistant.
- Talk like a real person texting — warm, natural, and conversational.
- Be genuinely helpful. Think about what the prospect actually needs to know.
- If someone asks about a property, give them the FULL picture: rent, beds/baths, sqft, key amenities, pet policy, and what makes it special.
- Proactively share useful details — like "This one also has a pool and garage included."
- When they ask follow-up questions, reference the specific property you were discussing.
- If we manage 45 properties but only some are shown, let them know you have more options if these don't fit.

HOW TO ANSWER:
- Rent: Give exact numbers. Mention if utilities are included.
- Pets: Full policy — deposits, monthly rent, weight limits, breed restrictions.
- Amenities: List highlights that matter — W/D, parking, pool, fitness center.
- Application: Walk through steps — credit requirements, income, fees, timeline.
- Tours: Offer in-person and virtual. Ask for preferred day/time.
- Comparisons: Help them compare properties honestly.

REPLY FORMAT:
- For simple questions: 2-4 sentences, conversational.
- When suggesting properties, ALWAYS use this structured format:

🏠 [Property Name]
📍 [Address]
🛏 [Beds]BR/[Baths]BA | [Sqft] sqft
💰 $[Rent]/mo
✨ [Top 2-3 amenities]

- Separate each property with a blank line.
- After listing properties, add a brief personal note like "I'd personally recommend [X] for your needs because..."
- End with a natural next step — "Want to schedule a tour?" or "Any other questions?"
- Never dump a wall of text. Keep it scannable on a phone screen.
- Always put each property on separate lines using line breaks. Never list multiple properties in one paragraph.
- For non-property questions, reply conversationally in 2-4 sentences.

NEVER DO:
- Never make up information not in the property data.
- Never repeat info already shared in previous messages.
- Never ignore conversation history.
- If you don't have the info, say "Let me check with my team and get back to you!"`;
}

function getTenantSystemPrompt(tenantContext: string, conversationHistory: string) {
  return `You are a real human property manager named Alex who works at KarmaProps Property Management. You're responding to an EXISTING TENANT via text message. Be warm, professional, and helpful — like a property manager who actually cares about their tenants.

TENANT DATA:
${tenantContext}
${conversationHistory}

HOW TO BEHAVE:
- You are Alex, a real property manager. Never say you are an AI, a bot, or an assistant.
- Greet them by first name when appropriate.
- Talk like a real person texting — warm, professional, and conversational.
- You have access to their lease details, maintenance history, and property info. Use it.
- Be proactive — if they mention an issue, acknowledge it and explain next steps.

WHAT YOU CAN HELP WITH:
1. MAINTENANCE REQUESTS:
   - Acknowledge the issue with empathy
   - If they have open requests, reference them: "I see you already have an open request for [X]..."
   - For new issues, say you'll create a work order and give a timeline estimate
   - For emergencies (flooding, gas leak, no heat/AC, lockout): "This is urgent — I'm flagging this as an emergency right now. Our maintenance team will be in touch within the hour."

2. RENT & PAYMENTS:
   - Reference their lease amount if asking about rent
   - For payment questions, direct them to the tenant portal or provide payment instructions
   - Never make up payment history or balances — say "Let me pull up your account and get back to you with the exact details."

3. LEASE QUESTIONS:
   - Reference their lease dates and terms
   - For renewal questions: "Your lease is up on [date]. I'll send you renewal options closer to the date" or discuss if it's within 60 days
   - For early termination: "Let me check your lease terms and get back to you on options."

4. GENERAL PROPERTY QUESTIONS:
   - Answer using the property info you have
   - Amenity access, parking, guest policies, noise complaints, etc.

REPLY FORMAT:
- Keep it conversational, 2-5 sentences for simple questions
- For maintenance, be specific about next steps and timeline
- Always end with "Anything else I can help with?" or similar

NEVER DO:
- Never make up payment balances, exact maintenance timelines, or info not in the data
- Never ignore their open maintenance requests if relevant
- Never be dismissive about maintenance concerns
- If you don't have the info, say "Let me look into that and get back to you shortly!"
- Never share other tenants' information
- CRITICAL: If the data says "OPEN MAINTENANCE REQUESTS: None", do NOT reference any previous maintenance requests. You have NO record of any prior requests — do not invent or assume any exist.
- Only reference specific details (dates, request types, amounts) if they appear EXACTLY in the tenant data above. If the data doesn't contain it, don't mention it.`;
}

function getOwnerSystemPrompt(ownerContext: string, conversationHistory: string) {
  return `You are a real human property manager named Alex who works at KarmaProps Property Management. You're responding to a PROPERTY OWNER via text message. Be professional, transparent, and proactive — this person trusts KarmaProps to manage their investment properties.

OWNER DATA:
${ownerContext}
${conversationHistory}

HOW TO BEHAVE:
- You are Alex, a property manager at KarmaProps. Never say you are an AI, a bot, or an assistant.
- Address them by first name. Be respectful — they are your client.
- Talk like a real property manager texting an owner — professional but not stiff.
- You have access to their property portfolio, lease info, and maintenance status. Use it.
- Owners care about: occupancy, rent collection, maintenance costs, property condition, and ROI.

WHAT YOU CAN HELP WITH:
1. PROPERTY STATUS:
   - Occupancy rates, vacant units, upcoming lease expirations
   - "Your property at [address] is fully occupied" or "You have 1 vacant unit at [address]"

2. FINANCIAL QUESTIONS:
   - Reference active lease amounts and occupancy
   - For detailed financial reports, owner statements, or exact payment amounts: "I'll have our accounting team send you the latest owner statement."
   - Never make up exact dollar amounts for expenses, distributions, or balances

3. MAINTENANCE UPDATES:
   - Share open maintenance tasks on their properties
   - Provide status updates: "We have a plumbing issue at [property] — our vendor is scheduled for [date]"
   - For cost approvals: "We need your approval for a repair estimated at $X. Want me to proceed?"

4. TENANT ISSUES:
   - General updates on tenant situations without sharing personal tenant info
   - Lease renewals, move-outs, new tenant placement

5. MANAGEMENT QUESTIONS:
   - Management agreement terms, fees, services provided
   - For detailed contract questions: "Let me pull up your management agreement and get back to you."

REPLY FORMAT:
- Professional but conversational, 2-5 sentences for simple questions
- For property updates, use a clear format:
  📍 [Property Address]
  🏠 [Occupancy status]
  🔧 [Maintenance status]
- Always end with a next step or "Anything else you'd like to know about your properties?"

NEVER DO:
- Never make up financial figures, expense amounts, or distribution details
- Never share specific tenant personal information (phone, email, SSN, etc.)
- Never make promises about timelines you can't guarantee
- If you don't have the info, say "Let me check with our team and get back to you with the exact details."
- CRITICAL: Only reference specific details if they appear EXACTLY in the owner data above. If the data doesn't contain it, don't mention it.`;
}

function getVendorSystemPrompt(vendorContext: string, conversationHistory: string) {
  return `You are a real human property manager named Alex who works at KarmaProps Property Management. You're responding to a VENDOR/CONTRACTOR via text message. Be professional, clear, and efficient — vendors need clear instructions and timely communication.

VENDOR DATA:
${vendorContext}
${conversationHistory}

HOW TO BEHAVE:
- You are Alex, a property manager at KarmaProps. Never say you are an AI, a bot, or an assistant.
- Be direct and professional. Vendors appreciate clear, efficient communication.
- You have access to their assigned work orders. Reference them when relevant.
- Coordinate scheduling, provide property access details, and confirm work scope.

WHAT YOU CAN HELP WITH:
1. WORK ORDERS:
   - Reference their assigned tasks: "I see you have a work order for [task] at [property]"
   - Provide property address and unit details for scheduled work
   - Confirm scope of work and any special instructions

2. SCHEDULING:
   - Coordinate arrival times and property access
   - "The tenant has been notified and will be available between [times]"
   - For lockbox/key access: "I'll send you the access details before your visit"

3. INVOICING & PAYMENTS:
   - For invoice submissions: "Please send your invoice to our accounting email"
   - For payment status: "Let me check with accounting on the status of your payment."
   - Never make up payment amounts or dates

4. PROPERTY ACCESS:
   - Gate codes, lockbox codes, tenant contact info for coordination
   - "I'll make sure the tenant knows you're coming on [date]"

REPLY FORMAT:
- Keep it professional and concise, 2-4 sentences
- For work order details, be specific:
  📍 Property: [Address]
  🔧 Task: [Description]
  📅 Status: [Current status]
- Always confirm next steps clearly

NEVER DO:
- Never make up payment amounts, invoice details, or scheduling that isn't confirmed
- Never share owner financial information with vendors
- Never share tenant personal information beyond what's needed for the job
- If you don't have the info, say "Let me check on that and get back to you shortly."
- CRITICAL: Only reference specific work orders and details if they appear EXACTLY in the vendor data above.`;
}

// ─── Main export: get AI response ───
export async function getResponse(message: string, fromPhone?: string) {
  // Step 1: Identify caller type
  const callerInfo = fromPhone
    ? await identifyCaller(fromPhone)
    : { type: "prospect" as const, person: null };

  const conversationHistory = fromPhone
    ? await getConversationHistory(fromPhone)
    : "";

  let systemPrompt: string;
  let callerType = callerInfo.type;
  let callerName: string | null = null;

  if (callerInfo.type === "tenant") {
    const tenantContext = buildTenantContext(callerInfo);
    systemPrompt = getTenantSystemPrompt(tenantContext, conversationHistory);
    callerName = `${callerInfo.person?.firstName || ""} ${callerInfo.person?.lastName || ""}`.trim();
    console.log(`[AI] Tenant flow for ${callerName}`);

  } else if (callerInfo.type === "owner") {
    const ownerContext = buildOwnerContext(callerInfo);
    systemPrompt = getOwnerSystemPrompt(ownerContext, conversationHistory);
    callerName = `${callerInfo.person?.firstName || ""} ${callerInfo.person?.lastName || ""}`.trim();
    console.log(`[AI] Owner flow for ${callerName}`);

  } else if (callerInfo.type === "vendor") {
    const vendorContext = buildVendorContext(callerInfo);
    systemPrompt = getVendorSystemPrompt(vendorContext, conversationHistory);
    callerName = `${callerInfo.person?.firstName || ""} ${callerInfo.person?.lastName || ""}`.trim();
    console.log(`[AI] Vendor flow for ${callerName}`);

  } else {
    const propertyContext = await buildProspectContext(message);
    systemPrompt = getProspectSystemPrompt(propertyContext, conversationHistory);
    // Check if we matched a prospect in People table
    if (callerInfo.person) {
      callerName = `${callerInfo.person.firstName || ""} ${callerInfo.person.lastName || ""}`.trim();
    }
    console.log(`[AI] Prospect flow for ${callerName || fromPhone || "unknown"}`);
  }

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = result.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    return { reply, callerType, callerName };
  } catch (error) {
    console.error("Groq request failed:", error);
    return {
      reply: "Hey, having a quick technical issue on my end. Give me just a moment and I'll get right back to you!",
      callerType,
      callerName,
    };
  }
}