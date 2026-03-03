import { getResponse } from "@/lib/ai-responder";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const { messageId } = await request.json();

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) return Response.json({ error: "Message not found" }, { status: 404 });

    // Generate AI reply
    const { reply } = await getResponse(message.incomingMessage, message.fromPhone);

    // Update message with AI reply and set to pending
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { aiReply: reply, status: "pending" },
    });

    return Response.json({ success: true, reply, message: updated });
  } catch (error: any) {
    console.error("Generate reply error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
