
ARCHITECTURE (1).md
Elle June 25, 2026 at 9:21 AM
21KB Markdown (raw) snippet. This file is private.

# Mailbox.bot Social Listening Agent — Architecture Review & Revised Blueprint

> **Verdict in one line:** The *philosophy* is right and I'd keep it — deterministic event pipeline, a hard human-approval boundary, and disciplined restraint on frameworks. The *X integration model is built on a pre-2026 mental model of the API and will not survive contact with reality as written.* The single highest-value change in this document is collapsing three ingestion paths into one and treating delivered-post volume as a hard cost budget. Almost everything else is operational hardening the original draft was missing.

This is not a rewrite for its own sake. I kept every genuinely novel idea, cut the parts that were either non-viable or generic boilerplate, and added the operational layer a system that touches a brand's public voice actually needs.

---

## 1. The thing that breaks the original design: the X API changed under it

Between February and April 2026, X replaced its entire access model. This is not a footnote — it invalidates the core of the "X Integration Model" section as written. Facts that matter, from X's 2026 developer pricing docs and the surrounding ecosystem:

| Capability | 2026 reality | Consequence for this design |
|---|---|---|
| **Tier model** | Pay-per-use is the **only** path for new developers. Legacy Basic ($200/mo) and Pro ($5,000/mo) are closed to new signups; remaining Basic subscribers auto-migrated starting June 1, 2026. Enterprise starts ~$42k+/mo. | You will be on pay-per-use. Plan all economics around per-resource billing, not a flat tier. |
| **Filtered stream** | **Available on pay-per-use**, but with a hard constraint: **1 concurrent connection, 1,000 rules, 1,024 chars/rule.** Each unique delivered post counts as a **post read (~$0.005)**, deduped within a 24h UTC window. | Discovery still works. But it is a **single shardable-by-rules, not shardable-by-connection** pipe. See §6. |
| **Monthly read cap** | Pay-per-use is **hard-capped at 2M post reads/month**. Above that, Enterprise is the only option. | This is a ceiling, not a guideline. A noisy ruleset can hit it. Cost guardrails are mandatory (§11). |
| **Account Activity API (webhooks)** | Legacy / enterprise-gated. Documented under `enterprise-gnip-2.0`; "thousands of subscriptions" is the enterprise tier. Multiple developers in 2026 report tweet-create webhooks **silently failing on pay-per-use**. | **The "Watch Account → Activity API subscription" feature is not viable on pay-per-use.** Drop it. Replace with `from:` rules on the stream you already run (§6). |
| **Writes** | Post creation ~$0.015, or **~$0.20 if the post contains a URL** (Apr 20, 2026). Following, liking, and quote-posting moved to **Enterprise-only** on the same date. | Reinforces the human-publish boundary — see below. |

**Three implications that reshape the architecture:**

1. **The human-publish boundary is now a cost and access feature, not just a safety feature.** Because a human opens X and posts the reply manually, the agent performs **zero API writes**. That sidesteps write costs entirely *and* the enterprise-only follow/like/quote wall. Keep this boundary even if you later get tempted to automate — it is load-bearing for both brand safety and unit economics.

2. **Collapse three ingestion sources into one.** The original has Filtered Stream + Activity Webhooks + Recent Search. On the 2026 API, the Activity Webhook path is enterprise-gated and unreliable, and its *function* (monitoring specific accounts) is fully achievable with `from:username` rules on the single filtered stream. So the real architecture is **one real-time source (filtered stream) + Recent Search used only for gap recovery.** This deletes an entire subsystem — the inbound `/webhooks/x` endpoint, CRC validation, subscription lifecycle management, and the `watchlist_subscriptions` table — while *improving* reliability.

3. **Delivered-post volume is your budget.** Cost ≈ unique delivered posts/month × ~$0.005. Rule precision and a high score threshold are no longer just quality levers; they are spend controls. This must be instrumented from day one, not Phase 3.

---

## 2. Keep / Cut / Fix

| Keep (genuinely good, kept as-is or sharpened) | Cut (non-viable or generic bloat) | Fix (was wrong or missing) |
|---|---|---|
| Unified `SocialEvent` model | Account Activity webhook subsystem | Stream "scaling" model — it's a singleton, not horizontally sharded |
| `UNIQUE (source, source_event_key)` dedup | `watchlist_subscriptions` table (folds into rules) | No idempotency on Slack actions (Slack retries) |
| Product Truth Layer (capability + forbidden claims) | Inbound `GET/POST /webhooks/x` + CRC | No dead-letter queue / backpressure |
| Hard human-publish boundary | `#security-scan-agent` channel (unrelated) | No author/conversation cooldowns (brand-spam risk) |
| "Handlers only validate, store, ack; async via queue" | Hermes as a *core* component (defer to a phase) | Model output trusted without schema validation |
| Restraint list (no LangChain/vector DB/Redis-yet) | `ROLE=stream` (plural) as a scaling story | No cost model or spend guardrails |
| Opportunity state machine (trimmed) | Multi-source ingestion complexity | No observability / SLOs / alerting |

---

## 3. Revised architecture

```
                         ┌─────────────────────────────────────────┐
                         │  X Filtered Stream  (1 connection)        │
                         │  rules = discovery + watchlist (from:)    │
                         └───────────────────┬───────────────────────┘
                                             │  newline-delimited JSON
        Recent Search ──(gap recovery only)──┤
                                             ▼
                    ┌─────────────────────────────────────────┐
                    │  Stream Consumer  (SINGLETON)             │
                    │  Postgres advisory lock = exactly-once    │
                    │  validate → dedup → enqueue → ack         │
                    └───────────────────┬───────────────────────┘
                                        ▼
                    ┌─────────────────────────────────────────┐
                    │  Supabase: Postgres + pgmq (Queues)       │
                    │  event store · queue · DLQ · usage ledger │
                    └───────────────────┬───────────────────────┘
                                        ▼
        ┌──────────────── Workers (scale horizontally) ────────────────┐
        │  1. deterministic filters + cooldowns                         │
        │  2. triage score   (cheap model, gate)                        │
        │  3. enrich linked content (Firecrawl, optional)               │
        │  4. draft reply    (strong model, only for 85+)               │
        │  5. validate draft against Product Truth Layer                │
        └───────────────────┬───────────────────────────────────────────┘
                            ▼
        ┌─────────────────────────────────┐     ┌──────────────────────────┐
        │  Slack  (one app, signed)        │◄────┤  Next.js Control Plane    │
        │  review card + actions           │     │  queue · rules · truth     │
        └───────────────┬─────────────────┘     │  watchlist · post-to-Slack │
                        │                         └──────────────────────────┘
                        ▼
        Human edits / approves / dismisses / watches
                        ▼
        Human opens X and publishes the reply  (agent does ZERO writes)
                        ▼
        Outcome + feedback recorded → Phase-3 economics
```

Two control surfaces sit on the same Supabase backend: **Slack** (fast, in-the-flow triage) and the **Next.js console** (rules, watchlist, truth-layer editing, analytics, and a manual "post to Slack" trigger). Supabase is the permanent audit log; Slack and the UI are views.

---

## 4. Ingestion: one source, scaled by rules

**Discovery** uses Streaming Rules with stable tags, exactly as the original proposed:

```
("certified mail" OR "return receipt") (API OR automate OR webhook) -is:retweet lang:en
→ tag: pain:certified-mail-api:v1
```

**Watchlist** is *not* a separate webhook subsystem. "Watch this account" appends a rule:

```
from:acmelogistics
→ tag: watch:acmelogistics:v1
```

This reuses the single connection and the existing rule + tag infrastructure. The 1,000-rule budget is generous for a discovery + watchlist workload. **Recent Search** is demoted to a single job: after any stream disconnect or deploy, query `/2/tweets/search/recent` from the last seen post ID to backfill the gap, then resume the stream. It is not a parallel discovery path (every Recent Search read also counts against the 2M cap).

---

## 5. Stream consumer: a singleton, not a fleet

This is the most common way teams get the 2026 API wrong, and the original blueprint's `ROLE=stream` (implying many) walks straight into it. **Pay-per-use grants one filtered-stream connection.** You cannot run N parallel stream replicas.

- Run **exactly one** stream consumer. Enforce it with a **Postgres advisory lock** (leader election): whichever replica holds the lock owns the connection; others stand by and take over on failure. This gives you HA via **active/standby**, not active/active.
- Detect stalls using the keep-alive newline X sends ~every 20s; on stall, reconnect with **exponential backoff + jitter**, then run the Recent Search backfill.
- Scale **throughput downstream** (workers off the queue), never the stream itself. The ingestion-side scaling unit is **rules**, capped at 1,000.

---

## 6. Unified event model (trimmed to what exists)

```ts
type SocialEvent = {
  source: "x.filtered_stream" | "x.recent_search";  // activity webhook removed
  sourceEventKey: string;       // dedup key
  postId: string;
  authorId: string;
  conversationId: string;
  matchedRuleTags: string[];    // e.g. ["pain:certified-mail-api:v1"] or ["watch:acme:v1"]
  occurredAt: string;
  receivedAt: string;
  raw: unknown;
};
```

```sql
UNIQUE (source, source_event_key)
```

The dedup constraint is correct and stays. It is doing even more work now that X's own 24h read-dedup is a soft guarantee that can break during outages.

---

## 7. Processing pipeline (hardened)

```
1. Validate + normalize
2. Dedup (DB constraint)            ← idempotent on (source, source_event_key)
3. Deterministic filters + cooldowns ← drop obvious noise BEFORE spending a model token
4. Triage score   (cheap model)      ← gate: <70 ignore, 70–84 digest, 85+ continue
5. Enrich (Firecrawl, optional)
6. Draft reply    (strong model)     ← only runs for the few that pass the gate
7. Validate draft vs Product Truth   ← reject any draft containing a forbidden claim
8. Post review card to Slack
9. Human decides (idempotent on a decision key — Slack delivers retries)
10. Record outcome + cost + feedback
```

Two additions the original lacked and a production system requires:

- **Dead-letter queue.** Poison events (malformed payloads, repeated model failures) move to a DLQ after N attempts instead of blocking the queue. Alert on DLQ depth.
- **Backpressure.** A viral term can burst the stream far above worker throughput. Cap in-flight work, shed/queue the overflow, and — critically — let the **cost guardrail pause noisy rules** rather than letting the queue (and the bill) run away.

---

## 8. Scoring & drafting: split the model, validate the output

OpenRouter is a fine router, but two changes make it production-grade and materially cheaper:

1. **Two-model split.** Run a cheap, fast model for **triage scoring** on *every* event that clears the deterministic filters. Only invoke a stronger model for **drafting** on the ~15%+ that pass the threshold. You stop paying premium token rates on the long tail of low-fit posts. This is one of the biggest cost levers in the whole system.

2. **Never trust the JSON.** Validate every model response against a strict schema (zod / JSON Schema). On invalid output: one repair attempt, then reject to DLQ. Do not pass unvalidated model output downstream.

Scoring contract (unchanged, it was good):

```json
{ "fit_score": 91, "confidence": 0.94, "pain_cluster": "certified_mail_api",
  "replyable": true, "risk": "low", "reason": "Explicit request for certified-mail automation" }
```

Thresholds (`<70 ignore`, `70–84 digest`, `85+ card`, `high risk → manual`) are a fine **starting** point — but they are now also spend controls, and Phase 3 should tune them against real approval/conversion data and cost-per-rule.

---

## 9. Brand safety & anti-spam (was missing — this is a real risk)

Even with a human pressing publish, a brand that fires near-identical replies into many threads looks like a spam bot, and that is the fastest route to rate-limiting or suspension. The human boundary alone does not solve this. Add, before anything reaches Slack:

- **Author cooldown:** at most one queued opportunity per author per N days.
- **Conversation dedupe:** suppress if the brand has already replied in that `conversation_id`.
- **Template-drift check:** flag drafts that are too similar to recently approved replies, so the human sees variety, not a macro.

These run as deterministic filters (step 3), so they cost nothing and protect the account.

---

## 10. Product Truth Layer (kept — one of the best ideas here)

Version-controlled capability file, injected into **every** draft prompt, and used **twice**: once as context for generation, once as a post-generation gate that rejects any draft containing a forbidden claim.

```yaml
live:
  certified_mail: true
  return_receipt: true
  document_packets: true
  rest_api: true
  mcp: true
  tracking_webhooks: true
  approval_gates: true

forbidden_claims:
  - "Delivery is guaranteed"
  - "Mailbox.bot provides legal advice"
  - "Features not currently released are available"
```

The only change: make the post-generation forbidden-claim check **mechanical** (string/semantic match against the list), not something you trust the drafting model to self-enforce.

---

## 11. Cost model & guardrails (new — non-negotiable on pay-per-use)

Because billing is per-resource and capped, cost is now a first-class system concern:

- **Budget = delivered posts × $0.005.** Worked example: a ruleset delivering ~10,000 unique posts/day ≈ ~300,000 reads/month ≈ **~$1,500/month** in reads alone, before any model spend. Sloppy rules can multiply this.
- **Hard ceiling:** 2M reads/month, then Enterprise. Stay well under.
- **In-console spending limit** plus an **app-level monthly read budget** with **automatic rule-pausing** as you approach the cap.
- **Usage ledger:** poll `GET /2/usage/tweets` and record per-rule delivered-post counts and per-opportunity model cost. This is what makes Phase 3 ("cost by listening rule") possible — and it's cheap to build now.

---

## 12. Observability & SLOs

`agent_events` is a fine audit log but it is **not** a metrics system. Add:

- **Metrics:** events/min, queue depth, DLQ depth, model latency + cost, reconnect count, approval rate, time-to-review.
- **Alerts:** stream down > 60s, queue depth over threshold, DLQ non-empty, spend-rate projecting over budget.
- **SLOs:** e.g. discovery-to-Slack-card P95 < 2 min; stream uptime > 99% (with backfill closing gaps); zero forbidden-claim drafts reaching a human.

---

## 13. Slack control plane

One Slack app, topic channels (`#social-media-agent`, `#agent-ops`, `#agent-learning` — drop `#security-scan-agent`, it's unrelated). Card unchanged in spirit:

```
91/100 · Certified Mail API · Low Risk
POST   <original post text>
WHY IT MATCHED   Explicit API request and proof-of-delivery requirement.
DRAFT  <suggested mailbox.bot reply>
[Open in X] [Edit] [Dismiss] [Watch Account]
```

Two requirements the original implied but didn't state: **verify the Slack signing secret** on `POST /slack/actions`, and make every action **idempotent on a decision key** (Slack redelivers interaction payloads).

---

## 14. Data model (trimmed)

```
social_events          -- raw normalized events + dedup
opportunities          -- post + score + draft + state (merge social_posts in here)
listening_rules        -- discovery AND watch rules (watchlist folded in)
decisions              -- human actions, idempotent
outcomes               -- opened/posted/engaged/converted + feedback
usage_ledger           -- per-rule reads, per-opportunity model cost   ← new
product_truth          -- versioned capability + forbidden claims
agent_events           -- audit log
```

Removed: `watchlist_subscriptions` (now rules), and `social_posts` collapses into `opportunities` unless you have a reason to keep raw post bodies separate.

State machine, trimmed to what changes behavior:

```
discovered → scored → drafted → review → published → converted
                                   └→ dismissed
```

---

## 15. Deployment & roles (corrected)

One TypeScript codebase, one image, role-switched — same idea as the original, with the scaling model fixed:

```
ROLE=all      # start here
ROLE=web      # Next.js UI + POST /slack/actions + /health  (scale horizontally)
ROLE=stream   # SINGLETON stream consumer w/ advisory lock  (1 active, 1 standby)
ROLE=worker   # queue consumers                              (scale horizontally)
```

Endpoints (note: inbound X webhook is **gone**):

```
POST /slack/actions   Slack interactions (verify signing secret)
GET  /health          liveness
GET  /ready           readiness (stream connected? queue reachable?)
```

Stay on Supabase Queues (pgmq). Do not add Redis until pgmq demonstrably can't keep up — the restraint in the original is correct.

---

## 16. Security

- Verify the Slack signing secret on every interaction.
- X credentials and the Slack webhook URL live only in server-side env (Railway secrets); never shipped to the browser.
- Supabase RLS on every table; the Next.js console talks to Supabase via a server-side service boundary, not from the client.
- Enforce the X spending limit in-console as a backstop against runaway cost.

---

## 17. Rollout (with a mandatory Phase 0)

- **Phase 0 — Access & cost probe (do this before building anything else).** Confirm pay-per-use access, register a small ruleset, run the filtered stream for one week, and measure real delivered-post volume and cost. This single week tells you whether the unit economics work. Skipping it is the biggest risk in the project.
- **Phase 1 — Shadow mode.** Collect, score, review. No publishing.
- **Phase 2 — Assisted publishing.** Slack review + prefilled X reply links + the Next.js console.
- **Phase 3 — Adaptive rules + economics.** Approval rate, reply rate, conversion, and **cost per rule** (now critical). Pause or tune rules that cost more than they convert.
- **Phase 4 — Analytics (optional, was "Hermes").** Weekly reports, rule recommendations, missed-cluster detection. Useful, but a separate concern — don't let it block Phases 0–3.

---

## 18. Explicitly cut

- Account Activity webhook subsystem, CRC validation, inbound `/webhooks/x` — replaced by `from:` rules.
- `watchlist_subscriptions` table — folded into `listening_rules`.
- `#security-scan-agent` channel — unrelated to this agent.
- Hermes as a *core* component — deferred to Phase 4.
- The `ROLE=stream` (plural) scaling story — corrected to a singleton.

Still endorsed from the original "Avoid Initially" list: no LangChain/LangGraph, no Redis (yet), no separate vector DB, no multiple Slack bots, no browser automation, no autonomous unsolicited posting, no multi-agent debate.

---

## 19. Decisions you need to make

1. **Run the Phase 0 cost probe before committing.** If delivered volume puts you near the 2M cap, the economics change and Enterprise/third-party data providers enter the conversation.
2. **Confirm whether any watchlist account genuinely needs DM/follow-level events** (the only thing `from:` rules can't give you). If yes, that specific need — and only that — may justify an Enterprise conversation later.
3. **Pick the triage vs drafting models** on OpenRouter and validate that your chosen drafting model honors structured output; if not, lean harder on the schema-validation/repair step.
wrap long lines