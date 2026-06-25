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

`npm run worker` compiles the TypeScript worker into `dist/worker` and starts the 15-minute loop. A tiny health server stays on `PORT` for Railway.

Hello-world ingest, one query, no LLM or Slack:

```bash
SOCIAL_LISTENING_QUERY='("certified mail" OR "return receipt") (api OR automate OR webhook) -is:retweet lang:en' \
SOCIAL_LISTENING_QUERY_TAG='hello:certified-mail-api:v1' \
npm run worker:once
```

Required worker env:

```text
X_BEARER_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Required only when `SOCIAL_LISTENING_INGEST_ONLY` is not enabled:

```text
OPENROUTER_API_KEY
SLACK_SOCIAL_WEBHOOK_URL
```

Optional worker env:

```text
OPENROUTER_MODEL
LEAD_RELEVANCE_THRESHOLD
X_SEARCH_MAX_RESULTS
SOCIAL_LISTENING_QUERY
SOCIAL_LISTENING_QUERY_TAG
SOCIAL_LISTENING_INGEST_ONLY
SOCIAL_LISTENING_RUN_ONCE
PORT
```

## Supabase

Apply `supabase.sql` first. It creates `social_events` and the lightweight `agent_memory_social_events` view for future agent reads.

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
