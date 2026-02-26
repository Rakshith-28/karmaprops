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

export async function syncProperties() {
  const data = await doorloopFetch("/properties");
  const properties = data.data || data;

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
  const data = await doorloopFetch("/units");
  const units = data.data || data;

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

// ─── NEW: Sync Tenants ────────────────────────────────────────────────────────

export async function syncTenants() {
  const data = await doorloopFetch("/tenants");
  const tenants = data.data || data;

  let count = 0;
  for (const t of tenants) {
    // DoorLoop may return phone in different fields — check all possibilities
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

    await prisma.tenant.upsert({
      where: { id: t.id },
      update: {
        firstName: t.firstName || null,
        lastName: t.lastName || null,
        email: t.email || null,
        phone: phone ? normalizePhone(phone) : null,
        mobilePhone: mobilePhone ? normalizePhone(mobilePhone) : null,
        type: t.type || null,
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
        type: t.type || null,
        status: t.status || null,
        notes: t.notes || null,
        rawData: t,
      },
    });
    count++;
  }

  return count;
}

// ─── NEW: Sync Leases ─────────────────────────────────────────────────────────

export async function syncLeases() {
  const data = await doorloopFetch("/leases?filter_status=ACTIVE");
  const leases = data.data || data;

  let count = 0;
  for (const l of leases) {
    // DoorLoop leases can have multiple tenants — grab the primary one
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

// ─── NEW: Sync Tasks (Maintenance Requests) ───────────────────────────────────

export async function syncTasks() {
  // Fetch open and in-progress tasks separately then combine
  const [openData, inProgressData] = await Promise.all([
    doorloopFetch("/tasks?filter_status=OPEN"),
    doorloopFetch("/tasks?filter_status=IN_PROGRESS"),
  ]);

  const tasks = [
    ...(openData.data || openData),
    ...(inProgressData.data || inProgressData),
  ];

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

// ─── Master Sync ──────────────────────────────────────────────────────────────

export async function syncAll() {
  const properties = await syncProperties();
  const units = await syncUnits();
  const tenants = await syncTenants();
  const leases = await syncLeases();
  const tasks = await syncTasks();
  return { properties, units, tenants, leases, tasks };
}

// ─── Helper ───────────────────────────────────────────────────────────────────

// Normalize any phone format to E.164 (+1XXXXXXXXXX) for consistent matching
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}