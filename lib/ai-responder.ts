import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

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

async function buildContext(message: string) {
  let retries = 3;
  let lastError;

  while (retries > 0) {
    try {
      // Extract search hints from the message
      const messageLower = message.toLowerCase();

      // Build database filters based on what the prospect asked
      const unitFilters: any = { active: true };

      // Check for bedroom count
      const bedMatch = messageLower.match(/(\d)\s*(?:br|bed|bedroom)/);
      if (bedMatch) unitFilters.beds = parseInt(bedMatch[1]);

      // Check for city
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

      // Check for price range
      const priceMatch = messageLower.match(/(?:under|below|max|budget|less than)\s*\$?(\d{3,4})/);
      const maxRent = priceMatch ? parseInt(priceMatch[1]) : undefined;

      // Query matching properties
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

      // If filters returned nothing, get all properties but limit to 10
      if (properties.length === 0) {
        properties = await prisma.property.findMany({
          where: { active: true },
          include: { units: { where: { active: true } } },
          take: 10,
        });
      }

      // If still too many, limit to 15
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

async function getConversationHistory(phone: string) {
  try {
    const messages = await prisma.message.findMany({
      where: { fromPhone: phone },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    if (messages.length === 0) return "";

    const history = messages.map((m: ConversationMessage) =>
      `Prospect: ${m.incomingMessage}\nYou: ${m.aiReply || "(no reply sent)"}`
    ).join("\n");

    return `\nPREVIOUS CONVERSATION WITH THIS PROSPECT:\n${history}\n`;
  } catch (error) {
    console.warn("Failed to load conversation history:", error);
    return "";
  }
}

export async function getResponse(message: string, fromPhone?: string) {
  const propertyContext = await buildContext(message);
  const conversationHistory = fromPhone ? await getConversationHistory(fromPhone) : "";

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a real human leasing agent named Alex who works at KarmaProps Property Management. You respond to rental prospects via text message exactly like a knowledgeable, friendly, and helpful real estate professional would.

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
- 2-4 sentences for simple questions, longer for detailed ones.
- End with a natural next step — "Want to schedule a tour?" or "Any other questions?"
- Never give generic one-line responses. Always add value.

NEVER DO:
- Never make up information not in the property data.
- Never repeat info already shared in previous messages.
- Never ignore conversation history.
- If you don't have the info, say "Let me check with my team and get back to you!"`,
        },
        {
          role: "user",
          content: message,
        },
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