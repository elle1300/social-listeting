import type { Lead, Post } from "./brain";

function formatLead(post: Post, lead: Lead, matchedQuery: string): string {
  return [
    `New X lead: @${post.author}`,
    `${lead.relevance}/100 relevance, ${lead.intent}/100 intent`,
    post.url,
    "",
    post.text,
    "",
    `Why: ${lead.reasoning}`,
    `Draft: ${lead.reply_draft}`,
    `Query: ${matchedQuery}`
  ].join("\n");
}

export async function postLead(post: Post, lead: Lead, matchedQuery: string): Promise<void> {
  const url = process.env.SLACK_SOCIAL_WEBHOOK_URL;
  if (!url) {
    throw new Error("SLACK_SOCIAL_WEBHOOK_URL is required");
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: formatLead(post, lead, matchedQuery) })
  });

  if (!res.ok) {
    throw new Error(`Slack ${res.status}: ${await res.text()}`);
  }
}
