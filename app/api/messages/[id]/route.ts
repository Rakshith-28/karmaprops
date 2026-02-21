import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action, editedReply } = await request.json();

    if (action === "approve") {
      const message = await prisma.message.update({
        where: { id },
        data: {
          status: "approved",
          aiReply: editedReply || undefined,
        },
      });

      // Send via Quo API
      const quoResponse = await fetch("https://api.openphone.com/v1/messages", {
        method: "POST",
        headers: {
          "Authorization": process.env.QUO_API_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: message.aiReply,
          from: process.env.QUO_FROM_NUMBER!,
          to: [message.fromPhone],
        }),
      });

      if (!quoResponse.ok) {
        const error = await quoResponse.json();
        console.error("Quo send error:", error);
        return Response.json({ error: "Failed to send" }, { status: 500 });
      }

      await prisma.message.update({
        where: { id },
        data: { status: "sent" },
      });

      return Response.json({ success: true, status: "sent" });

    } else if (action === "reject") {
      await prisma.message.update({
        where: { id },
        data: { status: "rejected" },
      });
      return Response.json({ success: true, status: "rejected" });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });

  } catch (error: any) {
    console.error("Message action error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}