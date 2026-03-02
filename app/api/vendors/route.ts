import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const vendors = await prisma.people.findMany({
      where: { type: "VENDOR" },
      orderBy: { firstName: "asc" },
    });
    return Response.json({ vendors });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}