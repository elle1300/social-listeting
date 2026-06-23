import type { Lead, Post } from "./brain";

interface StoredLead extends Post, Lead {
  query: string;
}

function supabaseConfig(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return { url: url.replace(/\/$/, ""), key };
}

function headers(prefer?: string): HeadersInit {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {})
  };
}

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url } = supabaseConfig();
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...headers(),
      ...init.headers
    }
  });

  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  }

  return res;
}

export async function hasLead(xPostId: string): Promise<boolean> {
  const id = encodeURIComponent(xPostId);
  const res = await supabaseFetch(`leads?x_post_id=eq.${id}&select=x_post_id&limit=1`);
  const rows: unknown = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

export async function insertLead(lead: StoredLead): Promise<void> {
  await supabaseFetch("leads", {
    method: "POST",
    headers: headers("return=minimal"),
    body: JSON.stringify({
      x_post_id: lead.id,
      author: lead.author,
      text: lead.text,
      url: lead.url,
      query: lead.query,
      relevance: lead.relevance,
      intent: lead.intent,
      category: lead.category,
      reply_draft: lead.reply_draft,
      reasoning: lead.reasoning,
      status: "pending"
    })
  });
}

export async function markNotified(xPostId: string): Promise<void> {
  const id = encodeURIComponent(xPostId);
  await supabaseFetch(`leads?x_post_id=eq.${id}`, {
    method: "PATCH",
    headers: headers("return=minimal"),
    body: JSON.stringify({ notified_at: new Date().toISOString() })
  });
}
