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

    // Check if this is a tenant or prospect
    const phoneLast10 = fromPhone.replace(/\D/g, "").slice(-10);
    const tenant = await prisma.tenant.findFirst({
      where: {
        phone: { contains: phoneLast10 },
        type: "LEASE_TENANT",
      },
    });

    const callerType = tenant ? "tenant" : "prospect";
    const callerName = tenant
      ? `${tenant.firstName || ""} ${tenant.lastName || ""}`.trim()
      : null;

    const reply = await getResponse(incomingMessage, fromPhone);

    // Save as pending with caller type tagged
    const message = await prisma.message.create({
      data: {
        fromPhone,
        toPhone,
        incomingMessage,
        aiReply: reply,
        status: "pending",
        callerType,
        callerName,
        tenantId: tenant?.id || null,
      },
    });

    console.log(`[${callerType.toUpperCase()}] ${callerName || fromPhone} — pending message: ${message.id}`);
    return Response.json({ success: true, messageId: message.id, callerType });

  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}