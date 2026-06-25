import type { Lead, Post } from "./brain";
import type { SocialEvent } from "./events";

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

function slackEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function formatDigest(
  events: SocialEvent[],
  queryTag: string,
  queryText: string,
  resultCount: number
): string {
  const lines = [
    `Mailbox.bot social listening digest`,
    `${events.length} new stored event(s) from ${resultCount} returned X result(s)`,
    `Tag: ${queryTag}`,
    `Query: ${queryText}`
  ];

  if (events.length === 0) {
    lines.push("", "No new matching posts were stored this cycle.");
    return lines.join("\n");
  }

  lines.push("");
  for (const event of events) {
    lines.push(
      `- @${slackEscape(event.authorUsername)}: ${slackEscape(truncate(event.text, 240))}`,
      `  <${event.url}|Open in X>`
    );
  }

  return lines.join("\n");
}

export async function postEventDigest(
  events: SocialEvent[],
  queryTag: string,
  queryText: string,
  resultCount: number
): Promise<void> {
  const url = process.env.SLACK_SOCIAL_WEBHOOK_URL;
  if (!url) {
    throw new Error("SLACK_SOCIAL_WEBHOOK_URL is required");
  }

  const limit = Number(process.env.SOCIAL_LISTENING_SLACK_DIGEST_LIMIT ?? 8);
  const visibleEvents = events.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: formatDigest(visibleEvents, queryTag, queryText, resultCount)
    })
  });

  if (!res.ok) {
    throw new Error(`Slack ${res.status}: ${await res.text()}`);
  }
}
