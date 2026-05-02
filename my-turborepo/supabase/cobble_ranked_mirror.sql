-- Persistent mirror of CobbleRanked sync payloads (leaderboard, usage stats, battle feed).
-- Apply in Supabase SQL editor or via migration workflow. Backend uses service role.

create table if not exists cobble_ranked_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists cobble_ranked_battle_replays (
  id bigserial primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_cobble_ranked_battle_replays_received
  on cobble_ranked_battle_replays (received_at desc);

create table if not exists cobble_ranked_match_results (
  id bigserial primary key,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists idx_cobble_ranked_match_results_received
  on cobble_ranked_match_results (received_at desc);

-- Keep only the newest p_keep rows (same cap as COBBLE_RANKED_FEED_MAX in the backend).
create or replace function trim_cobble_ranked_battle_replays(p_keep int)
returns void
language plpgsql
as $$
begin
  if p_keep < 1 then
    return;
  end if;
  delete from cobble_ranked_battle_replays
  where id not in (
    select id from cobble_ranked_battle_replays
    order by received_at desc
    limit p_keep
  );
end;
$$;

create or replace function trim_cobble_ranked_match_results(p_keep int)
returns void
language plpgsql
as $$
begin
  if p_keep < 1 then
    return;
  end if;
  delete from cobble_ranked_match_results
  where id not in (
    select id from cobble_ranked_match_results
    order by received_at desc
    limit p_keep
  );
end;
$$;
