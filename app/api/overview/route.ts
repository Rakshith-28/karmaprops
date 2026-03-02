import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [
      propertyCount,
      unitCount,
      vacantUnits,
      tenantCount,
      prospectCount,
      ownerCount,
      vendorCount,
      activeLeases,
      expiringLeases,
      openTasks,
    ] = await Promise.all([
      prisma.property.count({ where: { active: true } }),
      prisma.unit.count({ where: { active: true } }),
      prisma.unit.count({ where: { active: true, inEviction: false } }),
      prisma.people.count({ where: { type: "TENANT" } }),
      prisma.people.count({ where: { type: "PROSPECT" } }),
      prisma.people.count({ where: { type: "OWNER" } }),
      prisma.people.count({ where: { type: "VENDOR" } }),
      prisma.lease.count({ where: { status: { in: ["ACTIVE", "CURRENT"] } } }),
      prisma.lease.count({
        where: {
          status: { in: ["ACTIVE", "CURRENT"] },
          endDate: { lte: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.task.count({ where: { status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] } } }),
    ]);

    const totalMessages = await prisma.message.count();
    const pendingMessages = await prisma.message.count({ where: { status: "pending" } });

    return Response.json({
      properties: propertyCount,
      units: unitCount,
      vacantUnits,
      tenants: tenantCount,
      prospects: prospectCount,
      owners: ownerCount,
      vendors: vendorCount,
      activeLeases,
      expiringLeases,
      openTasks,
      totalMessages,
      pendingMessages,
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}