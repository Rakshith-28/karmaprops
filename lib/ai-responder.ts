import Groq from "groq-sdk";
import { prisma } from "@/lib/prisma";

type PropertyUnit = {
  name: string;
  beds: number | null;
  baths: number | null;
  size: number | null;
  marketRent: number | null;
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
  units: PropertyUnit[];
};

type ConversationMessage = {
  incomingMessage: string;
  aiReply: string | null;
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function buildContext() {
  // Retry logic for Neon database auto-pause wakeup
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
          `  - ${u.name}: ${u.beds || "?"}BR/${u.baths || "?"}BA, ${u.size || "?"}sqft, $${u.marketRent || "?"}/mo`
        ).join("\n");

        return `Property: ${p.name}
Address: ${p.street1 || ""}, ${p.city || ""} ${p.state || ""} ${p.zip || ""}
Type: ${p.type || "N/A"}
Description: ${p.description || "N/A"}
Amenities: ${p.amenities?.join(", ") || "N/A"}
Pets: ${p.petPolicySmallDogs || "Not specified"}
Units:
${units || "  No units listed"}`;
      }).join("\n---\n");

      return propertyText;
    } catch (error: any) {
      lastError = error;
      retries--;
      if (retries > 0) {
        console.log(`DB connection failed, retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3s before retry
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
          content: `You are a friendly and professional leasing assistant. You reply to rental prospects via text message.

Here is everything you know about the properties you manage:
${propertyContext}
${conversationHistory}
Rules:
- Keep replies short and SMS-friendly (under 300 characters when possible)
- Be warm and professional
- Only use information from the property data above
- If you don't know something, say you'll have the leasing team follow up
- If they want to schedule a tour, ask for their preferred time
- Include specific details like rent, sqft, availability when relevant
- Don't mention you are an AI unless directly asked
- Use the conversation history to give context-aware replies
- Don't repeat information already shared in previous messages`,
        },
        {
          role: "user",
          content: message,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const reply = result.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
    return reply;
  } catch (error) {
    console.error("Groq request failed:", error);
    return "Sorry, I'm having trouble responding right now. Please try again shortly.";
  }
}