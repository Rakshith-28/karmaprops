import { getAllQuoContacts } from "@/lib/quo";

export async function GET() {
  try {
    const contacts = await getAllQuoContacts();
    return Response.json({ contacts });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}