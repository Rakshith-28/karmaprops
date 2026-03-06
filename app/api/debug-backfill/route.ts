import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;

export async function GET(request: NextRequest) {
  // Test: fetch messages for Brian+Casey group (both participants)
  const participants = ["+13363245587", "+17045607277"];

  const params = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    maxResults: "10",
  });
  for (const phone of participants) {
    params.append("participants[]", phone);
  }

  const res = await fetch(
    `https://api.openphone.com/v1/messages?${params.toString()}`,
    { headers: { Authorization: QUO_API_KEY } }
  );

  const data = await res.json();

  // Also get DB messages for these phones
  const dbMsgs = await prisma.message.findMany({
    where: { fromPhone: { in: participants } },
    select: { fromPhone: true, incomingMessage: true },
  });

  return Response.json({
    quoMessages: (data.data || []).map((m: any) => ({
      from: m.from,
      to: m.to,
      text: m.text?.slice(0, 50),
      direction: m.direction,
    })),
    dbMessages: dbMsgs.map((m: any) => ({
      fromPhone: m.fromPhone,
      text: m.incomingMessage?.slice(0, 50),
    })),
  });
}