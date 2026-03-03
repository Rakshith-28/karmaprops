import { NextRequest } from "next/server";
import { getQuoMessages } from "@/lib/quo";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);

    // 1. Fetch from Quo/OpenPhone
    let quoMessages: any[] = [];
    try {
      const raw = await getQuoMessages(decodedPhone, 100);
      quoMessages = raw
        .filter((m) => m.text)
        .map((m) => ({
          id: m.id,
          text: m.text,
          direction: m.direction,
          timestamp: m.createdAt,
          source: "quo",
          status: m.direction === "outgoing" ? "sent" : "delivered",
        }));
    } catch (err) {
      console.warn("Failed to load Quo messages:", err);
    }

    // 2. Fetch from KarmaProps DB
    const dbMessages = await prisma.message.findMany({
      where: { fromPhone: decodedPhone },
      orderBy: { createdAt: "asc" },
    });

    const dbFormatted = dbMessages.flatMap((m) => {
      const msgs: any[] = [];
      msgs.push({
        id: `${m.id}-in`,
        text: m.incomingMessage,
        direction: "incoming",
        timestamp: m.createdAt,
        source: "karmaprops",
        status: m.status === "received" ? "received" : "delivered",
        messageId: m.id,
      });
      if (m.aiReply) {
        msgs.push({
          id: `${m.id}-out`,
          text: m.aiReply,
          direction: "outgoing",
          timestamp: m.updatedAt || m.createdAt,
          source: "karmaprops",
          status: m.status,
          messageId: m.id,
        });
      }
      return msgs;
    });

   // 3. Merge, deduplicate, and sort
    const allMessages = [...quoMessages, ...dbFormatted];
    
    // Deduplicate: if a Quo message and DB message have the same text 
    // and are within 2 minutes of each other, keep only the DB version (it has status info)
    const deduped: any[] = [];
    const seen = new Set<string>();
    
    // First pass: add all DB messages and mark them
    for (const msg of allMessages) {
      if (msg.source === "karmaprops") {
        const key = `${msg.text.slice(0, 50).trim().toLowerCase()}-${msg.direction}`;
        seen.add(key);
        deduped.push(msg);
      }
    }
    
    // Second pass: add Quo messages only if not already covered by DB
    for (const msg of allMessages) {
      if (msg.source === "quo") {
        const key = `${msg.text.slice(0, 50).trim().toLowerCase()}-${msg.direction}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(msg);
        }
      }
    }
    
    deduped.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // 4. Get caller info
    const phoneLast10 = decodedPhone.replace(/\D/g, "").slice(-10);
    const person = await prisma.people.findFirst({
      where: {
        OR: [
          { phone: { contains: phoneLast10 } },
          { mobilePhone: { contains: phoneLast10 } },
        ],
      },
    });

    return Response.json({
      phone: decodedPhone,
      callerName: person ? `${person.firstName || ""} ${person.lastName || ""}`.trim() : null,
      callerType: person?.type?.toLowerCase() || "prospect",
      messages: deduped,
    });
  } catch (error: any) {
    console.error("Conversation fetch error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}