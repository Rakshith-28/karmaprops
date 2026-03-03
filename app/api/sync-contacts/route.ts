import { prisma } from "@/lib/prisma";
import { getAllQuoContacts } from "@/lib/quo";

export async function POST() {
  try {
    const contacts = await getAllQuoContacts();
    let updated = 0;

    // Get all messages with no callerName
    const messages = await prisma.message.findMany({
      where: { callerName: null },
      select: { id: true, fromPhone: true },
    });

    for (const msg of messages) {
      const name = contacts[msg.fromPhone];
      if (name) {
        await prisma.message.updateMany({
          where: { fromPhone: msg.fromPhone, callerName: null },
          data: { callerName: name },
        });
        updated++;
      }
    }

    return Response.json({ success: true, updated, totalContacts: Object.keys(contacts).length });
  } catch (error: any) {
    console.error("Sync contacts error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}