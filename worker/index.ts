import { createServer } from "node:http";
import { scoreAndDraft } from "./brain";
import { hasLead, insertLead, insertSocialEvent, markNotified } from "./db";
import { socialEventToPost } from "./events";
import { getQueries } from "./queries";
import { postLead } from "./slack";
import { recentSearch } from "./x";

const PORT = Number(process.env.PORT ?? 3001);
const POLL_MS = 15 * 60 * 1000;
const THRESHOLD = Number(process.env.LEAD_RELEVANCE_THRESHOLD ?? 70);
const INGEST_ONLY = envFlag("SOCIAL_LISTENING_INGEST_ONLY");
const RUN_ONCE = envFlag("SOCIAL_LISTENING_RUN_ONCE");

const cursors = new Map<string, string>();
let running = false;

function envFlag(name: string): boolean {
  const value = process.env[name]?.toLowerCase();
  return value === "1" || value === "true" || value === "yes";
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
        const result = await recentSearch(query.text, cursors.get(query.text), query.tag);
        let hadPostFailure = false;

        for (const event of result.events) {
          try {
            const inserted = await insertSocialEvent(event);
            if (!inserted) continue;
            storedEvents += 1;
            if (INGEST_ONLY) continue;

            const post = socialEventToPost(event);
            if (await hasLead(post.id)) continue;

            const lead = await scoreAndDraft(post, query.text);
            await insertLead({ ...post, ...lead, query: query.text });

            if (lead.relevance >= THRESHOLD) {
              await postLead(post, lead, query.text);
              await markNotified(post.id);
            }
          } catch (error) {
            cycleFailed = true;
            hadPostFailure = true;
            console.error(`Post ${event.postId} failed`, error);
          }
        }

        if (!hadPostFailure && result.newestId) {
          cursors.set(query.text, result.newestId);
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
