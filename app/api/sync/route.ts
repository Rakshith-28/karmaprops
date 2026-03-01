import { syncAll } from "@/lib/doorloop";

export async function POST() {
  try {
    const results = await syncAll();
    return Response.json({
      success: true,
      message: `Synced ${results.properties} properties, ${results.units} units, ${results.people} people (tenants/prospects), ${results.leases} leases, ${results.tasks} tasks, ${results.owners} owners, ${results.vendors} vendors`,
      ...results,
    });
  } catch (error: any) {
    console.error("Sync error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
} 