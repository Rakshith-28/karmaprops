import { getResponse } from "@/lib/ai-responder";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { message } = await request.json();
  const reply = await getResponse(message);
  return Response.json({ reply });
}