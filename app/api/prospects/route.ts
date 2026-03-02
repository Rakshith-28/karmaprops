import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const prospects = await prisma.people.findMany({
      where: { type: "PROSPECT" },
      orderBy: { firstName: "asc" },
    });
    return Response.json({ prospects });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}