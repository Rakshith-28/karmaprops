import { prisma } from "@/lib/prisma";

const DOORLOOP_BASE_URL = "https://app.doorloop.com/api";

async function doorloopFetch(endpoint: string) {
  const res = await fetch(`${DOORLOOP_BASE_URL}${endpoint}`, {
    headers: {
      "Authorization": `Bearer ${process.env.DOORLOOP_API_KEY}`,
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
    // Skip if no property link
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

export async function syncAll() {
  const properties = await syncProperties();
  const units = await syncUnits();
  return { properties, units };
}