import { NextRequest } from "next/server";
import { getResponse } from "@/lib/ai-responder";
import { prisma } from "@/lib/prisma";
import { getConversation } from "@/lib/quo";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    if (event.type !== "message.received" && event.type !== "message.delivered") {
      return Response.json({ message: "ignored" });
    }

    // For outgoing messages (manual sends), just save to DB for history
    if (event.type === "message.delivered") {
      const data = event.data.object;
      const conversationId = data.conversationId || null;

      if (conversationId && data.body) {
        // Check if group exists in DB
        let existingGroup = await prisma.message.findFirst({
          where: { conversationId, isGroup: true },
          select: { participants: true, groupName: true },
        });

        // If not in DB yet, look up from Quo conversations API
        if (!existingGroup) {
          try {
            const convo = await getConversation(conversationId);
            const quoNumber = process.env.QUO_FROM_NUMBER;
            if (convo && convo.participants && convo.participants.length > 1) {
              const participants = quoNumber
                ? convo.participants.filter((p: string) => p !== quoNumber)
                : convo.participants;
              if (participants.length > 1) {
                existingGroup = { participants, groupName: convo.name || null };
              }
            }
          } catch (err) {
            console.warn("[WEBHOOK] Failed to fetch conversation:", err);
          }
        }

        if (existingGroup) {
          await prisma.message.create({
            data: {
              fromPhone: data.from,
              toPhone: Array.isArray(data.to) ? data.to.join(",") : data.to,
              incomingMessage: data.body,
              status: "sent",
              conversationId,
              participants: existingGroup.participants,
              isGroup: true,
              groupName: existingGroup.groupName,
              callerType: "outgoing",
              callerName: "KPMS",
            },
          });
          console.log(`[WEBHOOK] Saved manual outgoing group message: ${conversationId}`);
        }
      }

      return Response.json({ success: true });
    }

    // Handle incoming messages
    const data = event.data.object;
    const incomingMessage = data.body;
    const fromPhone = data.from;
    const toPhone = data.to;
    const conversationId = data.conversationId || null;

    let participants: string[] = [fromPhone];
    let isGroup = false;
    let groupName: string | null = null;

    // If we have a conversationId, look up the full participant list from Quo
    if (conversationId) {
      try {
        const convo = await getConversation(conversationId);
        if (convo && convo.participants && convo.participants.length > 1) {
          participants = convo.participants;
          isGroup = true;
          groupName = convo.name || null;
          console.log(`[WEBHOOK] Group conversation detected: ${conversationId} with ${participants.length} participants`);
        }
      } catch (err) {
        console.warn("[WEBHOOK] Failed to fetch conversation from Quo:", err);
      }

      // Fallback: check our DB for previous messages with this conversationId
      if (!isGroup) {
        const prevMessages = await prisma.message.findMany({
          where: { conversationId },
          select: { participants: true, isGroup: true, groupName: true },
          take: 1,
          orderBy: { createdAt: "desc" },
        });

        if (prevMessages.length > 0 && prevMessages[0].isGroup) {
          participants = prevMessages[0].participants;
          isGroup = true;
          groupName = prevMessages[0].groupName;
        }
      }
    }

    // Remove your Quo number from participants
    const quoNumber = process.env.QUO_FROM_NUMBER;
    if (quoNumber) {
      participants = participants.filter((p) => p !== quoNumber);
    }

    // Deduplicate
    participants = [...new Set(participants)];
    if (participants.length > 1) isGroup = true;

    // Generate AI reply
    const memoryKey = conversationId || fromPhone;
    const response = await getResponse(incomingMessage, memoryKey);

    // Save as pending
    const message = await prisma.message.create({
      data: {
        fromPhone,
        toPhone: Array.isArray(toPhone) ? toPhone.join(",") : toPhone,
        incomingMessage,
        aiReply: response.reply,
        status: "pending",
        conversationId,
        participants,
        isGroup,
        groupName,
        callerType: response.callerType,
        callerName: response.callerName || null,
      },
    });

    console.log(
      `New ${isGroup ? "GROUP" : "1-on-1"} message from ${fromPhone}${
        isGroup ? ` (${participants.length} participants)` : ""
      }: ${message.id}`
    );

    return Response.json({ success: true, messageId: message.id });
  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}