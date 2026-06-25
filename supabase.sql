create table if not exists social_events (
  id bigserial primary key,
  source text not null,
  source_event_key text not null,
  post_id text not null,
  author_id text not null,
  author_username text not null,
  text text not null,
  url text not null,
  conversation_id text not null,
  matched_rule_tags text[] not null default '{}',
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  raw jsonb not null,
  created_at timestamptz not null default now(),
  unique (source, source_event_key)
);

create index if not exists social_events_received_at_idx
  on social_events (received_at desc);

create index if not exists social_events_post_id_idx
  on social_events (post_id);

create index if not exists social_events_matched_rule_tags_idx
  on social_events using gin (matched_rule_tags);

alter table social_events enable row level security;

create or replace view agent_memory_social_events as
select
  id,
  source,
  post_id,
  author_id,
  author_username,
  text,
  url,
  conversation_id,
  matched_rule_tags,
  occurred_at,
  received_at
from social_events;
