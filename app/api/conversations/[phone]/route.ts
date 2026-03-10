import { NextRequest } from "next/server";
import { getQuoMessages, getAllQuoContacts } from "@/lib/quo";
import { prisma } from "@/lib/prisma";

const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;

// Fetch raw messages from Quo for a single participant with date filter
async function fetchQuoMessagesSince(phone: string, since: string, limit: number = 50) {
  const params = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    "participants[]": phone,
    maxResults: String(limit),
    createdAfter: since,
  });

  const res = await fetch(
    `https://api.openphone.com/v1/messages?${params.toString()}`,
    { headers: { Authorization: QUO_API_KEY } }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ phone: string }> }
) {
  try {
    const { phone } = await params;
    const decodedPhone = decodeURIComponent(phone);
    const conversationId = request.nextUrl.searchParams.get("conversationId");
    const quoNumber = process.env.QUO_FROM_NUMBER || "";

    // Check if this is a group conversation and get participants
    let isGroup = false;
    let groupParticipants: string[] = [];

    if (conversationId) {
      // Check Quo conversations API
      try {
        const cParams = new URLSearchParams({
          phoneNumberId: QUO_PHONE_NUMBER_ID,
          maxResults: "100",
        });
        const res = await fetch(
          `https://api.openphone.com/v1/conversations?${cParams.toString()}`,
          { headers: { Authorization: QUO_API_KEY } }
        );
        if (res.ok) {
          const data = await res.json();
          const convo = (data.data || []).find((c: any) => c.id === conversationId);
          if (convo && convo.participants) {
            groupParticipants = convo.participants.filter((p: string) => p !== quoNumber);
            isGroup = groupParticipants.length > 1;
          }
        }
      } catch (err) {
        console.warn("Failed to fetch conversation details:", err);
      }

      // Fallback: check DB
      if (groupParticipants.length === 0) {
        const dbMsg = await prisma.message.findFirst({
          where: { conversationId },
          select: { participants: true, isGroup: true },
        });
        if (dbMsg) {
          groupParticipants = dbMsg.participants;
          isGroup = dbMsg.isGroup;
        }
      }
    }

    // Load Quo contacts for name resolution
    let quoContacts: Record<string, string> = {};
    try {
      quoContacts = await getAllQuoContacts();
    } catch (err) {
      console.warn("Failed to load Quo contacts:", err);
    }

    // 1. Fetch from Quo/OpenPhone
    let quoMessages: any[] = [];
    try {
      if (isGroup) {
        // For groups: fetch recent messages per participant, deduplicate,
        // and filter to only messages involving multiple group members
        const cutoffDate = "2026-03-06T00:00:00Z"; // Today — only recent messages
        const allRaw: any[] = [];
        const seenIds = new Set<string>();

        for (const participant of groupParticipants) {
          const msgs = await fetchQuoMessagesSince(participant, cutoffDate, 50);
          for (const msg of msgs) {
            if (!seenIds.has(msg.id)) {
              seenIds.add(msg.id);
              allRaw.push(msg);
            }
          }
          await new Promise((r) => setTimeout(r, 150));
        }

        // Filter: keep only messages where multiple group participants are involved
        quoMessages = allRaw
          .filter((m) => {
            const toArray: string[] = Array.isArray(m.to) ? m.to : [m.to];
            const allInvolved = [...new Set([m.from, ...toArray].filter((p: string) => p !== quoNumber))];

            // Outgoing from us to multiple people = group message
            if (m.direction === "outgoing" && toArray.filter((p: string) => p !== quoNumber).length > 1) {
              return true;
            }

            // Incoming: check if sender is a group participant
            // Since we fetched per-participant, incoming from any group member is potentially group
            // But we need to avoid 1-on-1 messages
            // Heuristic: if the same message text appears for multiple participants, it's group
            // Simpler: if we fetched it from multiple participant queries, it might be group
            // Safest: just include all incoming from group participants fetched after cutoff
            if (m.direction === "incoming" && groupParticipants.includes(m.from)) {
              return true;
            }

            // Outgoing from us (manual sends)
            if (m.direction === "outgoing") {
              return true;
            }

            return false;
          })
          .filter((m) => m.text || m.media?.length > 0)
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
      } else {
        // 1-on-1: fetch full history from Quo
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
      }
    } catch (err) {
      console.warn("Failed to load Quo messages:", err);
    }

    // 2. Fetch from KarmaProps DB
    const dbMessages = await prisma.message.findMany({
      where: conversationId
        ? { conversationId }
        : { fromPhone: decodedPhone },
      orderBy: { createdAt: "asc" },
    });

    const dbFormatted = dbMessages.flatMap((m) => {
      const msgs: any[] = [];
      // For outgoing manual messages saved via message.delivered webhook
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