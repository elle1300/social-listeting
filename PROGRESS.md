# Progress

Last updated: June 25, 2026

## Starting Point

This repo began as a small Railway-ready social listening worker:

```text
X recent search -> OpenRouter score/draft -> Supabase leads row -> Slack webhook
```

The worker already had:

- `worker/index.ts`: 15-minute polling loop plus health endpoint.
- `worker/x.ts`: X Recent Search client.
- `worker/brain.ts`: OpenRouter scoring/drafting prompt and parser.
- `worker/db.ts`: Supabase REST helpers for the existing `leads` table.
- `worker/slack.ts`: Slack incoming webhook notification.
- `worker/queries.ts`: hard-coded mailbox.bot listening queries.
- A minimal Next.js smoke-test frontend.

## Architecture Evaluation

Saved the June 25 architecture review as `ARCHITECTURE.md`.

Key evaluation:

- The blueprint is directionally right: deterministic event pipeline, Supabase/Postgres as durable memory, and a hard human-publish boundary.
- X API economics should drive the architecture. Delivered posts are a spend budget, not just data volume.
- The production ingestion target should be one X Filtered Stream singleton, not multiple active stream workers.
- Account Activity webhooks should stay out of the pay-per-use design.
- Recent Search is still useful for Phase 0 / hello-world probing and later gap recovery.
- Hermes/LangChain should not be core yet. They can read from Supabase once real event volume exists.

## Implemented This Session

Added a normalized event layer:

- Created `worker/events.ts`.
- Added `SocialEvent` with source, source event key, post ID, author ID, username, text, URL, conversation ID, matched rule tags, timestamps, and raw payload.
- Added `socialEventToPost` so the old scoring/drafting path can keep working from normalized events.

Updated X ingestion:

- `worker/x.ts` now returns `SocialEvent[]` instead of plain posts.
- Recent Search requests `author_id`, `conversation_id`, and `created_at`.
- Each event gets a stable source key and a matched rule tag.

Updated Supabase persistence:

- Added `insertSocialEvent` in `worker/db.ts`.
- Inserts into `social_events`.
- Dedupe uses `on_conflict=source,source_event_key`.
- Duplicate events are ignored before spending model tokens.

Added the Supabase schema:

- Created `supabase.sql`.
- Adds `social_events`.
- Adds indexes for received time, post ID, and matched rule tags.
- Enables RLS on `social_events`.
- Adds `agent_memory_social_events` view for future agent/Hermes/LangChain reads.

Added hello-world mode:

- `SOCIAL_LISTENING_QUERY` overrides the built-in query list with one keyword combo.
- `SOCIAL_LISTENING_QUERY_TAG` controls the stored rule tag.
- `SOCIAL_LISTENING_INGEST_ONLY=true` stores events without OpenRouter or Slack.
- `SOCIAL_LISTENING_RUN_ONCE=true` runs one cycle and exits.
- By default, the worker uses one low-volume probe query to protect the small X API credit balance.
- The broader built-in query set only runs with `SOCIAL_LISTENING_ENABLE_DEFAULT_QUERIES=true`.
- Added `npm run worker:once`, which defaults to run-once ingest-only mode.

Updated query metadata:

- Added stable tags to all built-in queries in `worker/queries.ts`.
- Added `getQueries()` to support the single-query hello-world override.

Updated docs:

- `README.md` now describes Supabase as the durable memory layer.
- Added the hello-world command.
- Split required env vars into ingest-only vs scoring/Slack requirements.

## Verification

Ran successfully:

```bash
npm run worker:check
npm run build
git diff --check
```

## Current Live-Run Blockers

The shell does not currently have these required secrets:

```text
X_BEARER_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Because of that, the X -> Supabase hello-world probe has not been executed yet.

Optional for the scoring/Slack path:

```text
OPENROUTER_API_KEY
SLACK_SOCIAL_WEBHOOK_URL
```

## Next Step

Apply `supabase.sql` to the Supabase project, then run:

```bash
SOCIAL_LISTENING_QUERY='("certified mail API" OR "certified mail webhook" OR "return receipt webhook") -is:retweet lang:en' \
SOCIAL_LISTENING_QUERY_TAG='hello:certified-mail-webhook:v1' \
npm run worker:once
```

Expected result:

- The worker calls X Recent Search for one careful keyword combo.
- New posts are inserted into `social_events`.
- Duplicate posts are skipped.
- No OpenRouter or Slack calls happen in this hello-world run.

After that works, the next architecture-aligned improvement is a real X Filtered Stream singleton with advisory locking and Recent Search as gap recovery.
