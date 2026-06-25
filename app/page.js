export const dynamic = "force-dynamic";

const workerUrl = process.env.NEXT_PUBLIC_WORKER_URL;
const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const openRouterReady = Boolean(process.env.OPENROUTER_API_KEY);
const slackReady = Boolean(process.env.SLACK_SOCIAL_WEBHOOK_URL);
const defaultQuery = '((postal mail mcp) OR ("ai agent" "physical address")) -is:retweet lang:en';
const defaultTag = "hello:postal-mcp-ai-address:v1";
const currentQuery = process.env.SOCIAL_LISTENING_QUERY ?? defaultQuery;
const currentTag = process.env.SOCIAL_LISTENING_QUERY_TAG ?? defaultTag;

function supabaseHeaders(extra = {}) {
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    ...extra
  };
}

async function fetchEvents() {
  if (!supabaseUrl || !supabaseKey) {
    return { events: [], total: null, error: "Supabase is not configured" };
  }

  try {
    const [eventsRes, countRes] = await Promise.all([
      fetch(
        `${supabaseUrl}/rest/v1/social_events?select=id,source,post_id,author_username,text,url,matched_rule_tags,received_at&matched_rule_tags=cs.%7B${encodeURIComponent(currentTag)}%7D&order=received_at.desc&limit=8`,
        {
          headers: supabaseHeaders(),
          cache: "no-store"
        }
      ),
      fetch(`${supabaseUrl}/rest/v1/social_events?select=id`, {
        headers: supabaseHeaders({
          Prefer: "count=exact",
          Range: "0-0"
        }),
        cache: "no-store"
      })
    ]);

    if (!eventsRes.ok) {
      throw new Error(`Supabase ${eventsRes.status}`);
    }

    const events = await eventsRes.json();
    const total = parseCount(countRes.headers.get("content-range"));
    return { events, total, error: null };
  } catch (error) {
    return {
      events: [],
      total: null,
      error: error instanceof Error ? error.message : "Unable to load events"
    };
  }
}

function parseCount(contentRange) {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function formatTime(value) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function statusLabel(value) {
  return value ? "Ready" : "Waiting";
}

export default async function Home() {
  const { events, total, error } = await fetchEvents();

  return (
    <main className="shell">
      <section className="topbar" aria-label="Service status">
        <div>
          <p className="eyebrow">Mailbox.bot</p>
          <h1>Social listening</h1>
        </div>
        <div className="healthStrip">
          <span data-state={supabaseUrl && supabaseKey ? "ok" : "idle"}>
            Supabase {statusLabel(supabaseUrl && supabaseKey)}
          </span>
          <span data-state={openRouterReady ? "ok" : "idle"}>
            OpenRouter {statusLabel(openRouterReady)}
          </span>
          <span data-state={slackReady ? "ok" : "idle"}>Slack {statusLabel(slackReady)}</span>
        </div>
      </section>

      <section className="metrics" aria-label="Ingest summary">
        <div className="metric">
          <span>Total events</span>
          <strong>{total ?? "..."}</strong>
        </div>
        <div className="metric">
          <span>Current matches</span>
          <strong>{events.length}</strong>
        </div>
        <div className="metric">
          <span>Review path</span>
          <strong>{slackReady ? "Slack cards" : "Page only"}</strong>
        </div>
        <div className="metric">
          <span>Current tag</span>
          <strong className="fitText">{currentTag}</strong>
        </div>
      </section>

      <section className="workspace">
        <div className="streamPane">
          <div className="sectionHead">
            <div>
              <p className="eyebrow">Recent events</p>
              <h2>Current query intake</h2>
            </div>
            {workerUrl ? (
              <a className="textButton" href={`${workerUrl.replace(/\/$/, "")}/health`}>
                Worker health
              </a>
            ) : null}
          </div>

          {error ? <p className="notice">{error}</p> : null}

          <div className="eventList">
            {events.length > 0 ? (
              events.map((event) => (
                <article className="eventCard" key={event.id}>
                  <div className="eventMeta">
                    <span>@{event.author_username}</span>
                    <time dateTime={event.received_at}>{formatTime(event.received_at)}</time>
                  </div>
                  <p>{event.text}</p>
                  <div className="eventFooter">
                    <span>{event.matched_rule_tags?.[0] ?? event.source}</span>
                    <a href={event.url}>Open in X</a>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty">
                No stored events match the current tag yet. The latest ingest
                ran cleanly, but X returned zero matching posts.
              </p>
            )}
          </div>
        </div>

        <aside className="sidePane" aria-label="Pipeline">
          <div className="sectionHead compact">
            <div>
              <p className="eyebrow">Phase 0</p>
              <h2>Pipeline</h2>
            </div>
          </div>

          <ol className="pipeline">
            <li data-state="done">
              <span>X Recent Search</span>
              <strong>Verified</strong>
            </li>
            <li data-state="done">
              <span>Supabase memory</span>
              <strong>{events.length ? "Receiving" : "Ready"}</strong>
            </li>
            <li data-state={openRouterReady ? "ready" : "idle"}>
              <span>Score and draft</span>
              <strong>{statusLabel(openRouterReady)}</strong>
            </li>
            <li data-state={slackReady ? "ready" : "idle"}>
              <span>Human review</span>
              <strong>{slackReady ? "Slack" : "Pending"}</strong>
            </li>
          </ol>

          <div className="queryPanel">
            <p className="eyebrow">Current query</p>
            <p>{currentQuery}</p>
          </div>

          <div className="tagPanel">
            <p className="eyebrow">Current stored tag</p>
            <div className="tagList">
              <span>{currentTag}</span>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
