import { syncAll } from "@/lib/doorloop";

export async function POST() {
  try {
    const results = await syncAll();
    return Response.json({
      success: true,
      message: `Synced ${results.properties} properties, ${results.units} units, ${results.tenants} tenants, ${results.leases} leases, ${results.tasks} tasks`,
      ...results,
    });
  } catch (error: any) {
    console.error("Sync error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}