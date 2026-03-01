import { NextRequest } from "next/server";
import { getResponse } from "@/lib/ai-responder";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    if (event.type !== "message.received") {
      return Response.json({ message: "ignored" });
    }

    const incomingMessage = event.data.object.body;
    const fromPhone = event.data.object.from;
    const toPhone = event.data.object.to;

    // AI responder now handles identification and returns type + name
    const { reply, callerType, callerName } = await getResponse(incomingMessage, fromPhone);

    // Save as pending with caller type tagged
    const message = await prisma.message.create({
      data: {
        fromPhone,
        toPhone,
        incomingMessage,
        aiReply: reply,
        status: "pending",
        callerType,
        callerName: callerName || null,
      },
    });

    console.log(`[${callerType.toUpperCase()}] ${callerName || fromPhone} — pending message: ${message.id}`);
    return Response.json({ success: true, messageId: message.id, callerType });

  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}