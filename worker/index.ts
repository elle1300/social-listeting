import { createServer } from "node:http";
import { scoreAndDraft } from "./brain";
import {
  getPollCursor,
  hasLead,
  insertLead,
  insertSocialEvent,
  markNotified,
  upsertPollCursor
} from "./db";
import type { SocialEvent } from "./events";
import { socialEventToPost } from "./events";
import { getQueries } from "./queries";
import { postEventDigest, postLead } from "./slack";
import { recentSearch } from "./x";

const PORT = Number(process.env.PORT ?? 3001);
const POLL_MS = envNumber("SOCIAL_LISTENING_POLL_MS", 60 * 60 * 1000);
const THRESHOLD = Number(process.env.LEAD_RELEVANCE_THRESHOLD ?? 70);
const INGEST_ONLY = envFlag("SOCIAL_LISTENING_INGEST_ONLY");
const RUN_ONCE = envFlag("SOCIAL_LISTENING_RUN_ONCE");
const SLACK_DIGEST = envFlag("SOCIAL_LISTENING_SLACK_DIGEST");
const SLACK_DIGEST_ON_ZERO = envFlag("SOCIAL_LISTENING_SLACK_DIGEST_ON_ZERO");

let running = false;

function envFlag(name: string): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function envNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function processEvent(event: SocialEvent, queryText: string): Promise<void> {
  const post = socialEventToPost(event);
  if (await hasLead(post.id)) return;

  const lead = await scoreAndDraft(post, queryText);
  await insertLead({ ...post, ...lead, query: queryText });

  if (lead.relevance >= THRESHOLD) {
    await postLead(post, lead, queryText);
    await markNotified(post.id);
  }
}

async function runCycle(): Promise<boolean> {
  if (running) {
    console.log("Previous worker cycle still running; skipping this tick");
    return false;
  }

  running = true;
  let cycleFailed = false;
  let storedEvents = 0;
  console.log(`Worker cycle started at ${new Date().toISOString()}`);

  try {
    for (const query of getQueries()) {
      if (!query.enabled) continue;

      try {
        const sinceId = await getPollCursor(query.tag);
        const result = await recentSearch(query.text, sinceId, query.tag);
        const insertedEvents: SocialEvent[] = [];
        let hadStorageFailure = false;

        for (const event of result.events) {
          try {
            const inserted = await insertSocialEvent(event);
            if (!inserted) continue;
            storedEvents += 1;
            insertedEvents.push(event);
          } catch (error) {
            cycleFailed = true;
            hadStorageFailure = true;
            console.error(`Post ${event.postId} storage failed`, error);
          }
        }

        if (!hadStorageFailure) {
          await upsertPollCursor(query, result.newestId, result.resultCount);
        }

        if (result.nextToken) {
          console.warn(
            `Query ${query.tag} returned more than one page; skipping pagination to protect X credits`
          );
        }

        if (SLACK_DIGEST && (insertedEvents.length > 0 || SLACK_DIGEST_ON_ZERO)) {
          try {
            await postEventDigest(insertedEvents, query.tag, query.text, result.resultCount);
          } catch (error) {
            cycleFailed = true;
            console.error(`Slack digest failed for ${query.tag}`, error);
          }
        }

        if (INGEST_ONLY) continue;

        for (const event of insertedEvents) {
          try {
            await processEvent(event, query.text);
          } catch (error) {
            cycleFailed = true;
            console.error(`Post ${event.postId} processing failed`, error);
          }
        }
      } catch (error) {
        cycleFailed = true;
        console.error(`Query failed: ${query.text}`, error);
      }
    }
  } finally {
    running = false;
    console.log(
      `Worker cycle finished at ${new Date().toISOString()} with ${storedEvents} new event(s)`
    );
  }

  return !cycleFailed;
}

function startHealthServer(): void {
  const server = createServer((request, response) => {
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    });
    response.end(JSON.stringify({
      ok: true,
      service: "mailbox-bot-social-worker",
      path: request.url,
      time: new Date().toISOString()
    }));
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Worker health server listening on port ${PORT}`);
  });
}

if (!RUN_ONCE) {
  startHealthServer();
  void runCycle();
  setInterval(() => void runCycle(), POLL_MS);
} else {
  void runCycle().then((ok) => {
    if (!ok) process.exitCode = 1;
  });
}
