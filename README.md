# Social Listening Agent

v1.0 worker for mailbox.bot social listening. It keeps the live path deliberately small:

```text
X recent search -> one OpenRouter score/draft call -> Supabase leads row -> Slack #social
```

No v2.0 routing, few-shot examples, Hermes, Slack buttons, or auto-posting live here yet.

## Worker

```bash
npm install
npm run worker:check
npm run worker
```

`npm run worker` compiles the TypeScript worker into `dist/worker` and starts the 15-minute loop. A tiny health server stays on `PORT` for Railway.

Required worker env:

```text
X_BEARER_TOKEN
OPENROUTER_API_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SLACK_SOCIAL_WEBHOOK_URL
```

Optional worker env:

```text
OPENROUTER_MODEL
LEAD_RELEVANCE_THRESHOLD
X_SEARCH_MAX_RESULTS
PORT
```

## Supabase

v1.0 uses one table:

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
