import { prisma } from "@/lib/prisma";

const DOORLOOP_BASE_URL = "https://app.doorloop.com/api";

async function doorloopFetch(endpoint: string) {
  const res = await fetch(`${DOORLOOP_BASE_URL}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${process.env.DOORLOOP_API_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`DoorLoop API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ─── Fetch all records using page_size parameter ───
async function doorloopFetchAll(endpoint: string): Promise<any[]> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${endpoint}${separator}page_size=1000`;
  console.log(`[SYNC] Fetching: ${url}`);

  const data = await doorloopFetch(url);
  const records = data.data || data;

  console.log(`[SYNC] Got ${Array.isArray(records) ? records.length : 0} records (total in API: ${data.total || "unknown"})`);

  return Array.isArray(records) ? records : [];
}

export async function syncProperties() {
  const properties = await doorloopFetchAll("/properties");

  let count = 0;
  for (const p of properties) {
    await prisma.property.upsert({
      where: { id: p.id },
      update: {
        name: p.name || "",
        description: p.description || null,
        street1: p.address?.street1 || null,
        street2: p.address?.street2 || null,
        city: p.address?.city || null,
        state: p.address?.state || null,
        zip: p.address?.zip || null,
        country: p.address?.country || null,
        type: p.type || null,
        class: p.class || null,
        active: p.active ?? true,
        amenities: p.amenities || [],
        petPolicySmallDogs: p.petsPolicy?.smallDogs?.restrictions || null,
        petPolicyLargeDogs: p.petsPolicy?.largeDogs?.restrictions || null,
        petPolicyCats: p.petsPolicy?.cats?.restrictions || null,
        numActiveUnits: p.numActiveUnits || null,
        rawData: p,
        syncedAt: new Date(),
      },
      create: {
        id: p.id,
        name: p.name || "",
        description: p.description || null,
        street1: p.address?.street1 || null,
        street2: p.address?.street2 || null,
        city: p.address?.city || null,
        state: p.address?.state || null,
        zip: p.address?.zip || null,
        country: p.address?.country || null,
        type: p.type || null,
        class: p.class || null,
        active: p.active ?? true,
        amenities: p.amenities || [],
        petPolicySmallDogs: p.petsPolicy?.smallDogs?.restrictions || null,
        petPolicyLargeDogs: p.petsPolicy?.largeDogs?.restrictions || null,
        petPolicyCats: p.petsPolicy?.cats?.restrictions || null,
        numActiveUnits: p.numActiveUnits || null,
        rawData: p,
      },
    });
    count++;
  }

  return count;
}

export async function syncUnits() {
  const units = await doorloopFetchAll("/units");

  let count = 0;
  for (const u of units) {
    if (!u.property) continue;

    await prisma.unit.upsert({
      where: { id: u.id },
      update: {
        name: u.name || "",
        propertyId: u.property,
        street1: u.address?.street1 || null,
        city: u.address?.city || null,
        state: u.address?.state || null,
        zip: u.address?.zip || null,
        beds: u.beds || null,
        baths: u.baths || null,
        size: u.size || null,
        marketRent: u.marketRent || null,
        description: u.description || null,
        amenities: u.amenities || [],
        active: u.active ?? true,
        inEviction: u.inEviction ?? false,
        rawData: u,
        syncedAt: new Date(),
      },
      create: {
        id: u.id,
        name: u.name || "",
        propertyId: u.property,
        street1: u.address?.street1 || null,
        city: u.address?.city || null,
        state: u.address?.state || null,
        zip: u.address?.zip || null,
        beds: u.beds || null,
        baths: u.baths || null,
        size: u.size || null,
        marketRent: u.marketRent || null,
        description: u.description || null,
        amenities: u.amenities || [],
        active: u.active ?? true,
        inEviction: u.inEviction ?? false,
        rawData: u,
      },
    });
    count++;
  }

  return count;
}

// ─── Sync tenants & prospects from DoorLoop into People table ───
export async function syncPeople() {
  const tenants = await doorloopFetchAll("/tenants");

  let count = 0;
  for (let i = 0; i < tenants.length; i += 10) {
    const batch = tenants.slice(i, i + 10);

    await Promise.all(batch.map(async (t) => {
      const phone =
        t.phone ||
        t.mobilePhone ||
        (Array.isArray(t.phones) ? t.phones[0]?.number : null) ||
        null;

      const mobilePhone =
        t.mobilePhone ||
        (Array.isArray(t.phones)
          ? t.phones.find((p: any) => p.type === "mobile")?.number
          : null) ||
        null;

      // Map DoorLoop types to clean types
      const type = t.type === "LEASE_TENANT" ? "TENANT"
        : t.type === "PROSPECT_TENANT" ? "PROSPECT"
        : t.type || null;

      try {
        await prisma.people.upsert({
          where: { id: t.id },
          update: {
            firstName: t.firstName || null,
            lastName: t.lastName || null,
            email: t.email || null,
            phone: phone ? normalizePhone(phone) : null,
            mobilePhone: mobilePhone ? normalizePhone(mobilePhone) : null,
            type,
            status: t.status || null,
            notes: t.notes || null,
            rawData: t,
            syncedAt: new Date(),
          },
          create: {
            id: t.id,
            firstName: t.firstName || null,
            lastName: t.lastName || null,
            email: t.email || null,
            phone: phone ? normalizePhone(phone) : null,
            mobilePhone: mobilePhone ? normalizePhone(mobilePhone) : null,
            type,
            status: t.status || null,
            notes: t.notes || null,
            rawData: t,
          },
        });
        count++;
      } catch (error: any) {
        console.error(`[SYNC] Failed to upsert person ${t.id} (${t.firstName} ${t.lastName}):`, error.message);
      }
    }));

    console.log(`[SYNC] People batch ${Math.floor(i / 10) + 1}: ${count} saved so far`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return count;
}

export async function syncLeases() {
  const leases = await doorloopFetchAll("/leases?filter_status=ACTIVE");

  let count = 0;
  for (const l of leases) {
    const tenantId =
      l.tenantId ||
      l.tenant ||
      (Array.isArray(l.tenants) ? l.tenants[0]?.id || l.tenants[0] : null) ||
      null;

    await prisma.lease.upsert({
      where: { id: l.id },
      update: {
        tenantId: tenantId ? String(tenantId) : null,
        propertyId: l.property ? String(l.property) : null,
        unitId: l.unit ? String(l.unit) : null,
        status: l.status || null,
        startDate: l.start ? new Date(l.start) : null,
        endDate: l.end ? new Date(l.end) : null,
        monthlyRent: l.rent ?? l.monthlyRent ?? null,
        securityDeposit: l.securityDeposit ?? null,
        rentDueDay: l.rentDueDay ?? null,
        lateFee: l.lateFee ?? null,
        leaseType: l.leaseType || null,
        renewalStatus: l.renewalStatus || null,
        moveInDate: l.moveInDate ? new Date(l.moveInDate) : null,
        moveOutDate: l.moveOutDate ? new Date(l.moveOutDate) : null,
        rawData: l,
        syncedAt: new Date(),
      },
      create: {
        id: l.id,
        tenantId: tenantId ? String(tenantId) : null,
        propertyId: l.property ? String(l.property) : null,
        unitId: l.unit ? String(l.unit) : null,
        status: l.status || null,
        startDate: l.start ? new Date(l.start) : null,
        endDate: l.end ? new Date(l.end) : null,
        monthlyRent: l.rent ?? l.monthlyRent ?? null,
        securityDeposit: l.securityDeposit ?? null,
        rentDueDay: l.rentDueDay ?? null,
        lateFee: l.lateFee ?? null,
        leaseType: l.leaseType || null,
        renewalStatus: l.renewalStatus || null,
        moveInDate: l.moveInDate ? new Date(l.moveInDate) : null,
        moveOutDate: l.moveOutDate ? new Date(l.moveOutDate) : null,
        rawData: l,
      },
    });
    count++;
  }

  return count;
}

export async function syncTasks() {
  const [openTasks, inProgressTasks] = await Promise.all([
    doorloopFetchAll("/tasks?filter_status=OPEN"),
    doorloopFetchAll("/tasks?filter_status=IN_PROGRESS"),
  ]);

  const tasks = [...openTasks, ...inProgressTasks];

  let count = 0;
  for (const t of tasks) {
    await prisma.task.upsert({
      where: { id: t.id },
      update: {
        tenantId: t.tenant ? String(t.tenant) : null,
        propertyId: t.property ? String(t.property) : null,
        unitId: t.unit ? String(t.unit) : null,
        type: t.type || null,
        title: t.subject || t.title || null,
        description: t.description || null,
        status: t.status || null,
        priority: t.priority || null,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        assignedTo: t.assignedTo?.name || t.assignedToUser || null,
        rawData: t,
        syncedAt: new Date(),
      },
      create: {
        id: t.id,
        tenantId: t.tenant ? String(t.tenant) : null,
        propertyId: t.property ? String(t.property) : null,
        unitId: t.unit ? String(t.unit) : null,
        type: t.type || null,
        title: t.subject || t.title || null,
        description: t.description || null,
        status: t.status || null,
        priority: t.priority || null,
        dueDate: t.dueDate ? new Date(t.dueDate) : null,
        completedAt: t.completedAt ? new Date(t.completedAt) : null,
        assignedTo: t.assignedTo?.name || t.assignedToUser || null,
        rawData: t,
      },
    });
    count++;
  }

  return count;
}

// ─── Sync owners from DoorLoop into People table ───
export async function syncOwners() {
  const owners = await doorloopFetchAll("/owners");

  let count = 0;
  for (const o of owners) {
    const email = Array.isArray(o.emails)
      ? o.emails.find((e: any) => e.address)?.address || null
      : null;

    const phone = o.e164PhoneMobileNumber ||
      (Array.isArray(o.phones) ? o.phones.find((p: any) => p.number)?.number : null) ||
      null;

    try {
      await prisma.people.upsert({
        where: { id: o.id },
        update: {
          firstName: o.firstName || null,
          lastName: o.lastName || null,
          email,
          phone: phone ? normalizePhone(phone) : null,
          type: "OWNER",
          status: o.active ? "ACTIVE" : "INACTIVE",
          notes: o.companyName || null,
          rawData: o,
          syncedAt: new Date(),
        },
        create: {
          id: o.id,
          firstName: o.firstName || null,
          lastName: o.lastName || null,
          email,
          phone: phone ? normalizePhone(phone) : null,
          type: "OWNER",
          status: o.active ? "ACTIVE" : "INACTIVE",
          notes: o.companyName || null,
          rawData: o,
        },
      });
      count++;
    } catch (error: any) {
      console.error(`[SYNC] Failed to upsert owner ${o.id} (${o.name}):`, error.message);
    }
  }

  return count;
}

// ─── Sync vendors from DoorLoop into People table ───
export async function syncVendors() {
  const vendors = await doorloopFetchAll("/vendors");

  let count = 0;
  for (const v of vendors) {
    const email = Array.isArray(v.emails)
      ? v.emails.find((e: any) => e.address)?.address || null
      : null;

    const phone = v.e164PhoneMobileNumber ||
      (Array.isArray(v.phones) ? v.phones.find((p: any) => p.number)?.number : null) ||
      null;

    try {
      await prisma.people.upsert({
        where: { id: v.id },
        update: {
          firstName: v.firstName || null,
          lastName: v.lastName || null,
          email,
          phone: phone ? normalizePhone(phone) : null,
          type: "VENDOR",
          status: v.active ? "ACTIVE" : "INACTIVE",
          notes: v.companyName ? `${v.companyName}${v.notes ? " | " + v.notes : ""}` : v.notes || null,
          rawData: v,
          syncedAt: new Date(),
        },
        create: {
          id: v.id,
          firstName: v.firstName || null,
          lastName: v.lastName || null,
          email,
          phone: phone ? normalizePhone(phone) : null,
          type: "VENDOR",
          status: v.active ? "ACTIVE" : "INACTIVE",
          notes: v.companyName ? `${v.companyName}${v.notes ? " | " + v.notes : ""}` : v.notes || null,
          rawData: v,
        },
      });
      count++;
    } catch (error: any) {
      console.error(`[SYNC] Failed to upsert vendor ${v.id} (${v.name}):`, error.message);
    }
  }

  return count;
}

// ─── Sync everything ───
export async function syncAll() {
  const properties = await syncProperties();
  const units = await syncUnits();
  const people = await syncPeople();
  const leases = await syncLeases();
  const tasks = await syncTasks();
  const owners = await syncOwners();
  const vendors = await syncVendors();
  return { properties, units, people, leases, tasks, owners, vendors };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}