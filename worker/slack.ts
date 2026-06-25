import type { Lead, Post } from "./brain";
import type { SocialEvent } from "./events";

interface SlackApiResponse {
  ok?: boolean;
  error?: string;
}

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

async function postSlackText(text: string): Promise<void> {
  const url = process.env.SLACK_SOCIAL_WEBHOOK_URL;
  if (url) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    if (!res.ok) {
      throw new Error(`Slack webhook ${res.status}: ${await res.text()}`);
    }
    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_SOCIAL_CHANNEL_ID;
  if (!token || !channel) {
    throw new Error(
      "Set SLACK_SOCIAL_WEBHOOK_URL or both SLACK_BOT_TOKEN and SLACK_SOCIAL_CHANNEL_ID"
    );
  }

  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ channel, text })
  });

  if (!res.ok) {
    throw new Error(`Slack API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as SlackApiResponse;
  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error ?? "unknown_error"}`);
  }
}

export async function postLead(post: Post, lead: Lead, matchedQuery: string): Promise<void> {
  await postSlackText(formatLead(post, lead, matchedQuery));
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
  const limit = Number(process.env.SOCIAL_LISTENING_SLACK_DIGEST_LIMIT ?? 8);
  const visibleEvents = events.slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8);

  await postSlackText(formatDigest(visibleEvents, queryTag, queryText, resultCount));
}
