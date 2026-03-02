import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const leases = await prisma.lease.findMany({
      include: { tenant: true },
      orderBy: { startDate: "desc" },
    });
    return Response.json({ leases });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}