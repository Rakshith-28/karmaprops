import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllQuoContacts } from "@/lib/quo";

const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;

export async function GET(request: NextRequest) {
  try {
    const quoNumber = process.env.QUO_FROM_NUMBER || "";

    // 1. Fetch conversations from Quo
    const allConversations: any[] = [];
    let nextPageToken: string | undefined;
    let pages = 0;

    while (pages < 10) {
      const params = new URLSearchParams({
        phoneNumberId: QUO_PHONE_NUMBER_ID,
        maxResults: "50",
        excludeInactive: "true",
      });
      if (nextPageToken) params.set("pageToken", nextPageToken);

      const res = await fetch(
        `https://api.openphone.com/v1/conversations?${params.toString()}`,
        { headers: { Authorization: QUO_API_KEY } }
      );

      if (!res.ok) break;
      const data = await res.json();
      allConversations.push(...(data.data || []));
      pages++;

      if (!data.nextPageToken || (data.data || []).length === 0) break;
      nextPageToken = data.nextPageToken;
      await new Promise((r) => setTimeout(r, 150));
    }

    // 2. Load Quo contacts for name resolution
    let quoContacts: Record<string, string> = {};
    try {
      quoContacts = await getAllQuoContacts();
    } catch (err) {
      console.warn("Failed to load Quo contacts:", err);
    }

    // 3. Get pending counts from our DB per phone
    const pendingMessages = await prisma.message.findMany({
      where: { status: { in: ["pending", "received"] } },
      select: { fromPhone: true, conversationId: true },
    });

    // 4. Identify caller types from People table
    const people = await prisma.people.findMany({
      select: { phone: true, mobilePhone: true, type: true, firstName: true, lastName: true },
    });

    const phoneToType: Record<string, string> = {};
    const phoneToName: Record<string, string> = {};
    for (const p of people) {
      const name = `${p.firstName || ""} ${p.lastName || ""}`.trim();
      if (p.phone) {
        const last10 = p.phone.replace(/\D/g, "").slice(-10);
        phoneToType[last10] = p.type?.toLowerCase() || "prospect";
        if (name) phoneToName[last10] = name;
      }
      if (p.mobilePhone) {
        const last10 = p.mobilePhone.replace(/\D/g, "").slice(-10);
        phoneToType[last10] = p.type?.toLowerCase() || "prospect";
        if (name) phoneToName[last10] = name;
      }
    }

    function getCallerType(phone: string): string {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      return phoneToType[last10] || "prospect";
    }

    function getCallerName(phone: string): string | null {
      const last10 = phone.replace(/\D/g, "").slice(-10);
      return phoneToName[last10] || quoContacts[phone] || null;
    }

    // 5. Format conversations
    const conversations = allConversations.map((convo) => {
      const externalParticipants = (convo.participants || []).filter(
        (p: string) => p !== quoNumber
      );
      const isGroup = externalParticipants.length > 1;

      // Pending count: check if any participant has pending messages
      const pendingCount = pendingMessages.filter((pm) => {
        if (pm.conversationId === convo.id) return true;
        return externalParticipants.includes(pm.fromPhone);
      }).length;

      // Get caller type from first participant
      const primaryPhone = externalParticipants[0] || "";
      const callerType = getCallerType(primaryPhone);

      // Build display name
      let callerName: string | null;
      if (isGroup) {
        callerName = convo.name || externalParticipants
          .map((p: string) => getCallerName(p) || p)
          .join(", ");
      } else {
        callerName = getCallerName(primaryPhone);
      }

      return {
        conversationId: convo.id,
        phone: primaryPhone,
        participants: externalParticipants,
        isGroup,
        callerName,
        callerType,
        lastActivityAt: convo.lastActivityAt,
        pendingCount,
        groupName: convo.name || null,
      };
    });

    // Sort: pending first, then by last activity
    conversations.sort((a, b) => {
      if (a.pendingCount > 0 && b.pendingCount === 0) return -1;
      if (b.pendingCount > 0 && a.pendingCount === 0) return 1;
      return new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime();
    });

    return Response.json({ conversations });
  } catch (error: any) {
    console.error("Quo conversations error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}