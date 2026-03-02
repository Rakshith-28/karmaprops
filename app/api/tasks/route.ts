import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tasks = await prisma.task.findMany({
      include: { tenant: true },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ tasks });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}