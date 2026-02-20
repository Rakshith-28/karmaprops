import Groq from "groq-sdk";
import fs from "fs";
import path from "path";

const knowledgeBase = fs.readFileSync(
  path.join(process.cwd(), "knowledge-base.md"),
  "utf-8"
);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function getResponse(message: string) {
  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You are a friendly and professional leasing assistant. You reply to rental prospects via text message.

Here is everything you know about the properties you manage:
${knowledgeBase}

Rules:
- Keep replies short and SMS-friendly (under 300 characters when possible)
- Be warm and professional
- Only use information from the knowledge base above
- If you don't know something, say you'll have the leasing team follow up
- If they want to schedule a tour, ask for their preferred time
- Include specific details like rent, sqft, availability when relevant
- Don't mention you are an AI unless directly asked`,
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
}