import { NextRequest } from "next/server";
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

    // Identify caller from People table
    const phoneLast10 = fromPhone.replace(/\D/g, "").slice(-10);
    const person = await prisma.people.findFirst({
      where: {
        OR: [
          { phone: { contains: phoneLast10 } },
          { mobilePhone: { contains: phoneLast10 } },
        ],
      },
    });

    const callerType = person?.type?.toLowerCase() || "prospect";
    const callerName = person
      ? `${person.firstName || ""} ${person.lastName || ""}`.trim()
      : null;

    // Save message WITHOUT AI reply
    const message = await prisma.message.create({
      data: {
        fromPhone,
        toPhone,
        incomingMessage,
        aiReply: null,
        status: "received",
        callerType,
        callerName: callerName || null,
      },
    });

    console.log(`[${callerType.toUpperCase()}] ${callerName || fromPhone} — new message: ${message.id}`);
    return Response.json({ success: true, messageId: message.id, callerType });
  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}