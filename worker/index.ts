import { createServer } from "node:http";
import { scoreAndDraft } from "./brain";
import { hasLead, insertLead, markNotified } from "./db";
import { QUERIES } from "./queries";
import { postLead } from "./slack";
import { recentSearch } from "./x";

const PORT = Number(process.env.PORT ?? 3001);
const POLL_MS = 15 * 60 * 1000;
const THRESHOLD = Number(process.env.LEAD_RELEVANCE_THRESHOLD ?? 70);

const cursors = new Map<string, string>();
let running = false;

async function runCycle(): Promise<void> {
  if (running) {
    console.log("Previous worker cycle still running; skipping this tick");
    return;
  }

  running = true;
  console.log(`Worker cycle started at ${new Date().toISOString()}`);

  try {
    for (const query of QUERIES) {
      if (!query.enabled) continue;

      try {
        const result = await recentSearch(query.text, cursors.get(query.text));
        let hadPostFailure = false;

        for (const post of result.posts) {
          try {
            if (await hasLead(post.id)) continue;

            const lead = await scoreAndDraft(post, query.text);
            await insertLead({ ...post, ...lead, query: query.text });

            if (lead.relevance >= THRESHOLD) {
              await postLead(post, lead, query.text);
              await markNotified(post.id);
            }
          } catch (error) {
            hadPostFailure = true;
            console.error(`Post ${post.id} failed`, error);
          }
        }

        if (!hadPostFailure && result.newestId) {
          cursors.set(query.text, result.newestId);
        }
      } catch (error) {
        console.error(`Query failed: ${query.text}`, error);
      }
    }
  } finally {
    running = false;
    console.log(`Worker cycle finished at ${new Date().toISOString()}`);
  }
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

startHealthServer();
void runCycle();
setInterval(() => void runCycle(), POLL_MS);
