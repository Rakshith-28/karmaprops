import { NextRequest } from "next/server";
import { getQuoMessages, getAllQuoContacts } from "@/lib/quo";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);
    const conversationId = request.nextUrl.searchParams.get("conversationId");

    // Check if this is a group conversation
    let isGroup = false;
    if (conversationId) {
      const groupCheck = await prisma.message.findFirst({
        where: { conversationId },
        select: { isGroup: true },
      });
      isGroup = groupCheck?.isGroup || false;
    }

    // Load Quo contacts for name resolution
    let quoContacts: Record<string, string> = {};
    try {
      quoContacts = await getAllQuoContacts();
    } catch (err) {
      console.warn("Failed to load Quo contacts:", err);
    }

    let quoMessages: any[] = [];

    // For 1-on-1 only: fetch full history from Quo API
    if (!isGroup) {
      try {
        const raw = await getQuoMessages(decodedPhone, 100);
        quoMessages = raw
          .filter((m) => m.text || (m as any).media?.length > 0)
          .map((m) => ({
            id: m.id,
            text: m.text || "📎 Image/Media",
            direction: m.direction,
            timestamp: m.createdAt,
            source: "quo",
            status: m.direction === "outgoing" ? "sent" : "delivered",
            fromPhone: m.from,
            callerName: quoContacts[m.from] || null,
          }));
      } catch (err) {
        console.warn("Failed to load Quo messages:", err);
      }
    }
    // For groups: only use DB messages (webhook data)

    // Fetch from KarmaProps DB
    const dbMessages = await prisma.message.findMany({
      where: conversationId
        ? { conversationId }
        : { fromPhone: decodedPhone },
      orderBy: { createdAt: "asc" },
    });

    const dbFormatted = dbMessages.flatMap((m) => {
      const msgs: any[] = [];

      // Outgoing manual messages saved via message.delivered webhook
      if (m.callerType === "outgoing") {
        msgs.push({
          id: `${m.id}-out`,
          text: m.incomingMessage,
          direction: "outgoing",
          timestamp: m.createdAt,
          source: "karmaprops",
          status: "sent",
          messageId: m.id,
        });
        return msgs;
      }

      // Incoming messages
      msgs.push({
        id: `${m.id}-in`,
        text: m.incomingMessage,
        direction: "incoming",
        timestamp: m.createdAt,
        source: "karmaprops",
        status: m.status === "received" ? "received" : "delivered",
        messageId: m.id,
        fromPhone: m.fromPhone,
        callerName: m.callerName,
      });

      // AI replies
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

    // Merge, deduplicate, and sort
    const allMessages = [...quoMessages, ...dbFormatted];
    const deduped: any[] = [];
    const seen = new Set<string>();

    for (const msg of allMessages) {
      if (msg.source === "karmaprops") {
        const key = `${msg.text.slice(0, 50).trim().toLowerCase()}-${msg.direction}`;
        seen.add(key);
        deduped.push(msg);
      }
    }

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