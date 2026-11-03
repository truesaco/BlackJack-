-- One row per finished hand of blackjack, used by the stats page.
create table public.hands (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  played_at        timestamptz not null default now(),
  session_id       uuid not null,
  hand_in_session  integer not null,
  strategy         text not null default 'Unspecified' check (char_length(strategy) between 1 and 60),

  -- money
  bet              integer not null check (bet > 0),   -- initial bet
  total_wagered    integer not null check (total_wagered >= bet), -- after any double down
  payout           integer not null check (payout >= 0),
  net              integer not null,                    -- payout - total_wagered
  bankroll_before  integer not null,
  bankroll_after   integer not null,

  -- result
  outcome          text not null check (outcome in ('blackjack', 'win', 'push', 'lose')),
  reason           text not null check (reason in ('both_blackjack', 'player_blackjack', 'dealer_blackjack',
                                                   'player_bust', 'dealer_bust', 'higher_total',
                                                   'lower_total', 'equal_total')),

  -- cards
  player_cards     text[] not null,
  dealer_cards     text[] not null,
  player_total     integer not null,
  dealer_total     integer not null,
  start_total      integer not null,
  start_soft       boolean not null,
  start_pair       boolean not null,
  dealer_upcard    text not null,
  dealer_up_value  integer not null check (dealer_up_value between 2 and 11),

  -- play
  actions          text not null default '',            -- e.g. 'HHS', 'D', 'S'
  decisions        jsonb not null default '[]'::jsonb,  -- each decision vs basic strategy
  doubled          boolean not null default false,
  player_bust      boolean not null default false,
  dealer_bust      boolean not null default false,
  player_blackjack boolean not null default false,
  dealer_blackjack boolean not null default false,
  bs_decisions     integer not null default 0,
  bs_matches       integer not null default 0,

  -- shoe
  running_count    integer not null default 0,          -- Hi-Lo, before the deal
  true_count       numeric(5,1) not null default 0,
  shoe_remaining   integer,
  decks            integer not null default 6,
  duration_ms      integer
);

create index hands_user_played_at_idx on public.hands (user_id, played_at desc);

alter table public.hands enable row level security;

create policy "hands: users read own"
  on public.hands for select to authenticated
  using (user_id = (select auth.uid()));

create policy "hands: users insert own"
  on public.hands for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "hands: users delete own"
  on public.hands for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.hands to authenticated;
