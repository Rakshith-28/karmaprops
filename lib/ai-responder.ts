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

// ─── Identify caller: tenant or prospect ───
async function identifyCaller(phone: string) {
  try {
    const phoneLast10 = phone.replace(/\D/g, "").slice(-10);
    console.log(`[DEBUG] Looking up phone: ${phoneLast10}`);

    const tenant = await prisma.tenant.findFirst({
      where: {
        phone: { contains: phoneLast10 },
        type: "LEASE_TENANT",
      },
    });

    console.log(`[DEBUG] Tenant found:`, tenant ? `${tenant.firstName} ${tenant.lastName}` : "NONE");

    if (!tenant) return { type: "prospect" as const, tenant: null };

    // Get their lease info
    const lease = await prisma.lease.findFirst({
      where: {
        tenantId: tenant.id,
        status: { in: ["ACTIVE", "CURRENT"] },
      },
    });

    // Get open maintenance tasks
    const tasks = await prisma.task.findMany({
      where: {
        tenantId: tenant.id,
        status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    // Get the property/unit info if we have a lease
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
      tenant,
      lease,
      tasks,
      propertyInfo,
    };
  } catch (error) {
    console.warn("Failed to identify caller:", error);
    return { type: "prospect" as const, tenant: null };
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

      if (properties.length > 15) {
        properties = properties.slice(0, 15);
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
  const { tenant, lease, tasks, propertyInfo } = callerInfo;

  let context = `TENANT INFO:
Name: ${tenant.firstName} ${tenant.lastName}
Phone: ${tenant.phone}
Email: ${tenant.email || "Not on file"}`;

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
      context += `\n- ${t.subject || "Untitled"} (Status: ${t.status}, Created: ${new Date(t.createdAt).toLocaleDateString()})`;
    });
  } else {
    context += `\n\nOPEN MAINTENANCE REQUESTS: None`;
  }

  return context;
}

// ─── Get conversation history ───
// ─── Get conversation history (KarmaProps DB + Quo/OpenPhone) ───
async function getConversationHistory(phone: string) {
  let history = "";

  // 1. Try fetching from Quo/OpenPhone (old + manual conversations)
  try {
    const quoMessages = await getQuoMessages(phone, 30);
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
      take: 20,
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
- Never share other tenants' information`;
}

// ─── Main export: get AI response ───
export async function getResponse(message: string, fromPhone?: string) {
  // Step 1: Identify if this is a tenant or prospect
  const callerInfo = fromPhone
    ? await identifyCaller(fromPhone)
    : { type: "prospect" as const, tenant: null };

  const conversationHistory = fromPhone
    ? await getConversationHistory(fromPhone)
    : "";

  let systemPrompt: string;

  if (callerInfo.type === "tenant") {
    // TENANT FLOW
    const tenantContext = buildTenantContext(callerInfo);
    systemPrompt = getTenantSystemPrompt(tenantContext, conversationHistory);
    console.log(`[AI] Tenant flow for ${callerInfo.tenant?.firstName} ${callerInfo.tenant?.lastName}`);
  } else {
    // PROSPECT FLOW (existing behavior)
    const propertyContext = await buildProspectContext(message);
    systemPrompt = getProspectSystemPrompt(propertyContext, conversationHistory);
    console.log(`[AI] Prospect flow for ${fromPhone || "unknown"}`);
  }

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const reply = result.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    return reply;
  } catch (error) {
    console.error("Groq request failed:", error);
    return "Hey, having a quick technical issue on my end. Give me just a moment and I'll get right back to you!";
  }
}