import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const properties = await prisma.property.findMany({
      where: { active: true },
      include: { units: { where: { active: true } } },
      orderBy: { name: "asc" },
    });
    return Response.json({ properties });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}