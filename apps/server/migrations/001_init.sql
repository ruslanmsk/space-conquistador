-- Guests: a nickname and a hashed bearer token (the raw token is only ever held by the client).
create table players (
  id            text primary key,
  nickname      text not null,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create table rooms (
  code         text primary key,
  host_id      text not null references players(id),
  max_players  int  not null check (max_players between 2 and 4),
  status       text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  -- Current or last match of the room.
  match_id     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table room_members (
  room_code  text not null references rooms(code) on delete cascade,
  player_id  text not null references players(id),
  ready      boolean not null default false,
  -- Seat in the current/last match (p1..p4), null in the lobby.
  seat       text,
  joined_at  timestamptz not null default now(),
  primary key (room_code, player_id)
);
create index room_members_player_idx on room_members (player_id);

create table matches (
  id           text primary key,
  room_code    text references rooms(code) on delete set null,
  map_id       text not null,
  -- [{ seat, playerId, nickname }]
  seats        jsonb not null,
  -- Seed of the game rng: createMatch + match_events replays the match exactly.
  rng_seed     bigint not null,
  status       text not null default 'playing' check (status in ('playing', 'finished', 'aborted')),
  winner       text,
  end_reason   text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  final_state  jsonb
);
create index matches_room_idx on matches (room_code);

create table match_players (
  match_id     text not null references matches(id) on delete cascade,
  player_id    text not null references players(id),
  seat         text not null,
  final_score  int,
  rank         int,
  primary key (match_id, seat)
);
create index match_players_player_idx on match_players (player_id);

-- Every accepted game action, in order. `source`: player = sent by the client,
-- timeout = the server acted for an idle/offline seat, auto = reveal closed by everyone/timer.
create table match_events (
  match_id    text not null references matches(id) on delete cascade,
  seq         int  not null,
  player_id   text references players(id),
  source      text not null,
  action      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (match_id, seq)
);
