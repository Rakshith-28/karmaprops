import { NextRequest } from "next/server";

const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;

export async function GET(request: NextRequest) {
  // Test Hannah (known working)
  const params1 = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    "participants[]": "+17046340472",
    maxResults: "3",
  });

  const res1 = await fetch(
    `https://api.openphone.com/v1/messages?${params1.toString()}`,
    { headers: { Authorization: QUO_API_KEY } }
  );
  const data1 = await res1.json();

  // Test Geetha
  const params2 = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    "participants[]": "+12482241025",
    maxResults: "3",
  });

  const res2 = await fetch(
    `https://api.openphone.com/v1/messages?${params2.toString()}`,
    { headers: { Authorization: QUO_API_KEY } }
  );
  const data2 = await res2.json();

  return Response.json({
    hannah_count: data1.data?.length || 0,
    hannah_msgs: (data1.data || []).map((m: any) => ({ text: m.text?.slice(0, 40), direction: m.direction })),
    geetha_count: data2.data?.length || 0,
    geetha_msgs: (data2.data || []).map((m: any) => ({ text: m.text?.slice(0, 40), direction: m.direction })),
  });
}