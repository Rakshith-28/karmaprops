import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const owners = await prisma.people.findMany({
      where: { type: "OWNER" },
      orderBy: { firstName: "asc" },
    });
    return Response.json({ owners });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}