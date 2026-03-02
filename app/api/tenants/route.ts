import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const tenants = await prisma.people.findMany({
      where: { type: "TENANT" },
      include: { leases: true, tasks: true },
      orderBy: { firstName: "asc" },
    });
    return Response.json({ tenants });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}