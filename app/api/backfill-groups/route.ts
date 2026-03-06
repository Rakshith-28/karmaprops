import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;

// Fetch Quo messages for a specific phone
async function fetchMessagesForPhone(phone: string) {
  const params = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    "participants[]": phone,
    maxResults: "50",
  });

  const res = await fetch(
    `https://api.openphone.com/v1/messages?${params.toString()}`,
    { headers: { Authorization: QUO_API_KEY } }
  );

  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

// Fetch conversation details to get name
async function fetchConversations() {
  const allConvos: any[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  while (pages < 20) {
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
    allConvos.push(...(data.data || []));
    pages++;

    if (!data.nextPageToken || (data.data || []).length === 0) break;
    nextPageToken = data.nextPageToken;
    await new Promise((r) => setTimeout(r, 200));
  }

  return allConvos;
}

export async function POST(request: NextRequest) {
  try {
    // Step 1: Get all unique phones from untagged messages
    const untagged = await prisma.message.findMany({
      where: { conversationId: null },
      select: { fromPhone: true },
      distinct: ["fromPhone"],
    });

    const phones = untagged.map((m) => m.fromPhone);
    console.log(`[BACKFILL] ${phones.length} phones with untagged messages`);

    // Step 2: Fetch all conversations to build a lookup of conversationId -> name/participants
    const conversations = await fetchConversations();
    console.log(`[BACKFILL] Loaded ${conversations.length} conversations from Quo`);

    // Build lookup: sort participants to create a key -> conversation details
    const quoNumber = process.env.QUO_FROM_NUMBER;
    const convoLookup: Record<string, { id: string; name: string | null; participants: string[] }> = {};

    for (const convo of conversations) {
      if (!convo.participants || convo.participants.length <= 1) continue;
      const externalParticipants = quoNumber
        ? convo.participants.filter((p: string) => p !== quoNumber).sort()
        : convo.participants.sort();
      if (externalParticipants.length <= 1) continue;

      const key = externalParticipants.join(",");
      convoLookup[key] = {
        id: convo.id,
        name: convo.name || null,
        participants: externalParticipants,
      };
    }

    console.log(`[BACKFILL] ${Object.keys(convoLookup).length} group conversations indexed`);

    // Step 3: For each phone, fetch their Quo messages and check `to` field
    let totalUpdated = 0;

    for (const phone of phones) {
      try {
        const quoMsgs = await fetchMessagesForPhone(phone);

        for (const qm of quoMsgs) {
          if (!qm.text) continue;

          // Determine participants from the message itself
          // For incoming: `from` is the sender, `to` is your Quo number(s)
          // For outgoing: `from` is your number, `to` is the recipients
          // The `to` array having multiple entries = group message
          const toArray: string[] = Array.isArray(qm.to) ? qm.to : [qm.to];

          let messageParticipants: string[];
          if (qm.direction === "incoming") {
            // Incoming group: the `to` field might just be your number
            // But if other participants replied, we need to check by matching to conversations
            // Use the from + to to figure out all external participants
            messageParticipants = [qm.from, ...toArray].filter((p: string) => p !== quoNumber).sort();
          } else {
            // Outgoing: `to` contains all recipients
            messageParticipants = toArray.filter((p: string) => p !== quoNumber).sort();
          }

          // Only process if it looks like a group (multiple external participants)
          // OR if it matches a known group conversation
          const participantKey = messageParticipants.join(",");
          let convoInfo = convoLookup[participantKey];

          // Also try: check if this phone is part of any group
          if (!convoInfo) {
            for (const [key, info] of Object.entries(convoLookup)) {
              if (info.participants.includes(phone) && messageParticipants.length <= 1) {
                // This phone is in a group but this specific message might be 1-on-1
                // Skip — don't tag 1-on-1 messages as group
                break;
              }
            }
          }

          if (!convoInfo) continue;

          // Only match incoming messages to our DB
          if (qm.direction !== "incoming") continue;

          // Find matching DB message by phone + text
          const result = await prisma.message.updateMany({
            where: {
              fromPhone: qm.from,
              incomingMessage: qm.text,
              conversationId: null,
            },
            data: {
              conversationId: convoInfo.id,
              participants: convoInfo.participants,
              isGroup: true,
              groupName: convoInfo.name,
            },
          });

          if (result.count > 0) {
            console.log(`[BACKFILL] Matched "${qm.text.slice(0, 30)}..." -> ${convoInfo.name || convoInfo.id}`);
            totalUpdated += result.count;
          }
        }

        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn(`[BACKFILL] Failed for ${phone}:`, err);
      }
    }

    return Response.json({
      success: true,
      phonesChecked: phones.length,
      conversationsIndexed: Object.keys(convoLookup).length,
      messagesUpdated: totalUpdated,
    });
  } catch (error: any) {
    console.error("Backfill error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}