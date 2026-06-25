# Social Listening Agent

v1.0 worker for mailbox.bot social listening. It keeps the live path deliberately small:

```text
X recent search -> Supabase social_events row -> optional OpenRouter score/draft -> leads row -> Slack #social
```

No v2.0 routing, few-shot examples, Hermes, Slack buttons, or auto-posting live here yet. Supabase/Postgres is the durable memory layer; Hermes or LangChain can read from `social_events` / `agent_memory_social_events` later.

## Architecture checkpoint

The June 25 blueprint is directionally right: use one normalized event model, keep a hard human-publish boundary, and treat X delivered-post volume as a cost budget. The next production turn should move ingestion from Recent Search to one Filtered Stream singleton, because X pay-per-use supports one stream connection with persistent rules. For this repo's first milestone, Recent Search is still the fastest safe probe: one keyword combo, small max results, durable event storage, no API writes.

## Worker

```bash
npm install
npm run worker:check
npm run worker
```

`npm run worker` compiles the TypeScript worker into `dist/worker` and starts the one-hour loop. A tiny health server stays on `PORT` for Railway.

Hello-world ingest, one query, no LLM or Slack:

```bash
SOCIAL_LISTENING_QUERY='("certified mail API" OR "certified mail webhook" OR "return receipt webhook") -is:retweet lang:en' \
SOCIAL_LISTENING_QUERY_TAG='hello:certified-mail-webhook:v1' \
npm run worker:once
```

With only a small X API credit balance, keep probes narrow. X post reads are billed per returned post, and `$5` buys roughly 1,000 returned posts at `$0.005` each. By default, the worker now uses one low-volume probe query. The broader built-in query set only runs when `SOCIAL_LISTENING_ENABLE_DEFAULT_QUERIES=true` is set.

Duplicate protection has two layers:

- `poll_cursors` stores the latest X `newest_id` per query tag and passes it back to X as `since_id` on the next poll. This prevents the same returned posts from being billed again on normal hourly runs.
- `social_events` still has a unique constraint on `(source, source_event_key)`, so duplicate rows are ignored if a retry, deploy, or cursor reset replays an already-seen post.

Required worker env:

```text
X_BEARER_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Required for hourly Slack digests:

```text
SOCIAL_LISTENING_SLACK_DIGEST=true
```

For Slack posting, use either:

```text
SLACK_SOCIAL_WEBHOOK_URL
```

or:

```text
SLACK_BOT_TOKEN
SLACK_SOCIAL_CHANNEL_ID
```

Required only when `SOCIAL_LISTENING_INGEST_ONLY` is not enabled:

```text
OPENROUTER_API_KEY
```

Optional worker env:

```text
OPENROUTER_MODEL
LEAD_RELEVANCE_THRESHOLD
X_SEARCH_MAX_RESULTS
SOCIAL_LISTENING_POLL_MS
SOCIAL_LISTENING_QUERY
SOCIAL_LISTENING_QUERY_TAG
SOCIAL_LISTENING_INGEST_ONLY
SOCIAL_LISTENING_RUN_ONCE
SOCIAL_LISTENING_ENABLE_DEFAULT_QUERIES
SOCIAL_LISTENING_SLACK_DIGEST
SOCIAL_LISTENING_SLACK_DIGEST_ON_ZERO
SOCIAL_LISTENING_SLACK_DIGEST_LIMIT
SLACK_SOCIAL_WEBHOOK_URL
SLACK_BOT_TOKEN
SLACK_SOCIAL_CHANNEL_ID
PORT
```

## Supabase

Apply `supabase.sql` first. It creates `social_events`, `poll_cursors`, and the lightweight `agent_memory_social_events` view for future agent reads.

The optional scoring path still uses `leads`:

```sql
create table leads (
  x_post_id    text primary key,
  author       text,
  text         text,
  url          text,
  query        text,
  relevance    int,
  intent       int,
  category     text,
  reply_draft  text,
  reasoning    text,
  status       text default 'pending',
  notified_at  timestamptz,
  created_at   timestamptz default now()
);
```

## Frontend

```bash
npm run dev
npm run build
npm run start
```
