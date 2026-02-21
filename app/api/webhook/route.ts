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

    const reply = await getResponse(incomingMessage);

    // Save as pending — waits for your approval before sending
    const message = await prisma.message.create({
      data: {
        fromPhone,
        toPhone,
        incomingMessage,
        aiReply: reply,
        status: "pending",
      },
    });

    console.log(`New pending message from ${fromPhone}: ${message.id}`);
    return Response.json({ success: true, messageId: message.id });

  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}