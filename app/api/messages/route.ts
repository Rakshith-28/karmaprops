import { prisma } from "@/lib/prisma";
import { sendQuoMessage } from "@/lib/quo";

export async function GET() {
  try {
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ messages });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { id, action, editedReply } = await request.json();

    if (action === "approve") {
      const message = await prisma.message.findUnique({ where: { id } });
      if (!message) return Response.json({ error: "Message not found" }, { status: 404 });

      const replyText = editedReply || message.aiReply;

      try {
        await sendQuoMessage(message.fromPhone, replyText!);
      } catch (sendError: any) {
        console.error("Failed to send via Quo:", sendError.message);
        return Response.json({ error: "Failed to send message" }, { status: 500 });
      }

      const updated = await prisma.message.update({
        where: { id },
        data: { status: "sent", aiReply: replyText },
      });

      return Response.json({ success: true, message: updated });
    }

    if (action === "reject") {
      await prisma.message.delete({
        where: { id },
      });
      return Response.json({ success: true, deleted: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}