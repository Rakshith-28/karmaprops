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

async function buildContext() {
  let retries = 3;
  let lastError;

  while (retries > 0) {
    try {
      const properties = await prisma.property.findMany({
        where: { active: true },
        include: { units: { where: { active: true } } },
      });

      const propertyText = properties.map((p: ActiveProperty) => {
        const units = p.units.map((u: PropertyUnit) =>
          `  - ${u.name}: ${u.beds || "?"}BR/${u.baths || "?"}BA, ${u.size || "?"}sqft, $${u.marketRent || "?"}/mo${u.description ? " | " + u.description.substring(0, 150) : ""}${u.amenities?.length ? " | Amenities: " + u.amenities.join(", ") : ""}`
        ).join("\n");

        return `Property: ${p.name}
Address: ${p.street1 || ""}, ${p.city || ""} ${p.state || ""} ${p.zip || ""}
Type: ${p.type || "N/A"}
Description: ${p.description || "N/A"}
Property Amenities: ${p.amenities?.join(", ") || "N/A"}
Pet Policy - Small Dogs: ${p.petPolicySmallDogs || "Not specified"}
Pet Policy - Large Dogs: ${p.petPolicyLargeDogs || "Not specified"}
Pet Policy - Cats: ${p.petPolicyCats || "Not specified"}
Units:
${units || "  No units listed"}`;
      }).join("\n---\n");

      return propertyText;
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
  const propertyContext = await buildContext();
  const conversationHistory = fromPhone ? await getConversationHistory(fromPhone) : "";

  try {
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are a real human leasing agent named Alex who works at KarmaProps Property Management. You respond to rental prospects via text message exactly like a knowledgeable, friendly, and helpful real estate professional would.

PROPERTY DATA YOU HAVE ACCESS TO:
${propertyContext}
${conversationHistory}

HOW TO BEHAVE:
- You are Alex, a real leasing agent. Never say you are an AI, a bot, or an assistant.
- Talk like a real person texting — warm, natural, and conversational. Use casual but professional language.
- Be genuinely helpful. Think about what the prospect actually needs to know, not just what they asked.
- If someone asks about a property, give them the FULL picture: rent, beds/baths, sqft, key amenities, pet policy, parking, location highlights, and what makes it special.
- Always proactively share useful details they haven't asked about yet — like "By the way, this one also has a pool and garage included" or "Just so you know, we do allow pets here with a deposit."
- When they ask follow-up questions, ALWAYS reference the specific property you were already discussing. Never lose track of context.

HOW TO ANSWER QUESTIONS:
- Rent/pricing: Give exact numbers. Mention if utilities are included or not.
- Availability: Be specific about move-in dates if you have them.
- Pets: Give the full pet policy — what's allowed, deposits, monthly pet rent, weight limits, breed restrictions.
- Amenities: List the highlights that matter — in-unit washer/dryer, parking, pool, fitness center, etc.
- Location: Mention nearby landmarks, schools, shopping, or highways if relevant.
- Application process: Walk them through the steps clearly — credit requirements, income requirements, fees, timeline.
- Tours: Offer both in-person and virtual tours. Ask for their preferred day and time.
- Lease terms: Mention minimum lease length, security deposit amount, and any move-in specials.
- Maintenance: Mention the online portal and 24/7 emergency maintenance if asked.
- Comparisons: If they're deciding between properties, help them compare honestly.

REPLY FORMAT:
- Keep replies informative but not overwhelming. 2-4 sentences is ideal for most responses.
- For detailed questions (like "tell me everything about this property"), it's okay to write a longer reply with all the important details.
- Use line breaks to organize longer replies so they're easy to read on a phone.
- End replies with a natural next step — "Want to schedule a tour?", "Any other questions?", "I can send you the application link if you're interested!"
- Never give a one-word or one-sentence reply. Always add value.

THINGS TO NEVER DO:
- Never make up information that isn't in the property data.
- Never repeat the same information you already shared in previous messages with this prospect.
- Never give generic responses like "I'd be happy to help." Always give specific, useful information.
- Never ignore the conversation history. If they already asked about 3BR homes and you suggested one, remember that.
- If you genuinely don't have the information, say "Let me check with my team and get back to you on that!" instead of guessing.`,
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