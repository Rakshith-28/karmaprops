const QUO_API_KEY = process.env.QUO_API_KEY!;
const QUO_PHONE_NUMBER_ID = process.env.QUO_PHONE_NUMBER_ID!;
const BASE_URL = "https://api.openphone.com/v1";

type QuoMessage = {
  id: string;
  to: string[];
  from: string;
  text: string;
  phoneNumberId: string;
  direction: "incoming" | "outgoing";
  userId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type QuoListResponse = {
  data: QuoMessage[];
  totalItems: number;
  nextPageToken?: string;
};

async function quoFetch(endpoint: string): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { Authorization: QUO_API_KEY },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Quo API error ${res.status}: ${err}`);
  }

  return res.json();
}

// Fetch message history for a specific phone number
export async function getQuoMessages(
  participantPhone: string,
  limit: number = 50
): Promise<QuoMessage[]> {
  const allMessages: QuoMessage[] = [];
  let nextPageToken: string | undefined;

  while (allMessages.length < limit) {
    const params = new URLSearchParams({
      phoneNumberId: QUO_PHONE_NUMBER_ID,
      "participants[]": participantPhone,
      maxResults: String(Math.min(50, limit - allMessages.length)),
    });

    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const data: QuoListResponse = await quoFetch(`/messages?${params.toString()}`);

    allMessages.push(...data.data);

    if (!data.nextPageToken || data.data.length === 0) break;
    nextPageToken = data.nextPageToken;
  }

  // Sort oldest first
  return allMessages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

// Format Quo messages into conversation text for AI context
export function formatQuoHistory(messages: QuoMessage[], yourNumber: string): string {
  if (messages.length === 0) return "";

  const history = messages
    .filter((m) => m.text) // skip empty messages
    .map((m) => {
      const isFromUs = m.direction === "outgoing";
      const label = isFromUs ? "You (Alex)" : "Them";
      const date = new Date(m.createdAt).toLocaleDateString();
      return `[${date}] ${label}: ${m.text}`;
    })
    .join("\n");

  return `\nFULL CONVERSATION HISTORY (from Quo/OpenPhone):\n${history}\n`;
}

// Get all unique conversations (for bulk import)
export async function getAllConversations(): Promise<any[]> {
  const allConversations: any[] = [];
  let nextPageToken: string | undefined;

  while (true) {
    const params = new URLSearchParams({
      phoneNumberId: QUO_PHONE_NUMBER_ID,
      maxResults: "50",
    });

    if (nextPageToken) {
      params.set("pageToken", nextPageToken);
    }

    const data = await quoFetch(`/conversations?${params.toString()}`);
    allConversations.push(...data.data);

    if (!data.nextPageToken || data.data.length === 0) break;
    nextPageToken = data.nextPageToken;

    // Rate limit: Quo allows 10 req/sec
    await new Promise((r) => setTimeout(r, 150));
  }

  return allConversations;
}

export async function sendQuoMessage(toPhone: string, text: string) {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      Authorization: QUO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: QUO_PHONE_NUMBER_ID,
      to: [toPhone],
      content: text,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Quo send error ${res.status}: ${err}`);
  }

  return res.json();
}

// Fetch all contacts from Quo/OpenPhone
export async function getAllQuoContacts(): Promise<Record<string, string>> {
  const nameMap: Record<string, string> = {};
  let nextPageToken: string | undefined;

  while (true) {
    const params = new URLSearchParams({ maxResults: "50" });
    if (nextPageToken) params.set("pageToken", nextPageToken);

    const data = await quoFetch(`/contacts?${params.toString()}`);

    for (const contact of data.data || []) {
      const firstName = contact.defaultFields?.firstName || "";
      const lastName = contact.defaultFields?.lastName || "";
      const name = `${firstName} ${lastName}`.trim();

      if (name) {
        for (const phone of contact.defaultFields?.phoneNumbers || []) {
          if (phone.value) {
            nameMap[phone.value] = name;
          }
        }
      }
    }

    if (!data.nextPageToken || (data.data || []).length === 0) break;
    nextPageToken = data.nextPageToken;

    await new Promise((r) => setTimeout(r, 150));
  }

  return nameMap;
}

// Fetch a single conversation by ID to get participants
export async function getConversation(conversationId: string): Promise<any> {
  const params = new URLSearchParams({
    phoneNumberId: QUO_PHONE_NUMBER_ID,
    maxResults: "100",
  });
  
  const data = await quoFetch(`/conversations?${params.toString()}`);
  return data.data?.find((c: any) => c.id === conversationId) || null;
}

// Fetch messages for a conversation by participant phones (for groups)
// Fetch messages for a group conversation by fetching each participant separately
export async function getQuoGroupMessages(
  participantPhones: string[],
  limit: number = 100
): Promise<QuoMessage[]> {
  const allMessages: QuoMessage[] = [];
  const seenIds = new Set<string>();

  // Fetch messages for each participant separately and merge
  for (const phone of participantPhones) {
    try {
      const params = new URLSearchParams({
        phoneNumberId: QUO_PHONE_NUMBER_ID,
        "participants[]": phone,
        maxResults: String(Math.min(50, limit)),
      });

      const data: QuoListResponse = await quoFetch(`/messages?${params.toString()}`);

      for (const msg of data.data) {
        if (!seenIds.has(msg.id)) {
          seenIds.add(msg.id);
          allMessages.push(msg);
        }
      }

      // Rate limit
      await new Promise((r) => setTimeout(r, 150));
    } catch (err) {
      console.warn(`Failed to fetch messages for ${phone}:`, err);
    }
  }

  return allMessages.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}