-- Run this once in Supabase SQL Editor for Kwentayo/Open Stage.
-- The table is intentionally private: only server-side routes using the service role key access it.

create table if not exists public.open_stage_media_state (
  id integer primary key check (id = 1),
  status text not null default 'stopped' check (status in ('stopped', 'playing')),
  title text not null default '',
  kind text not null default 'music' check (kind in ('music', 'poem', 'audiobook', 'announcement')),
  audio_url text not null default '',
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.open_stage_media_state enable row level security;

insert into public.open_stage_media_state (
  id, status, title, kind, audio_url, started_at, updated_at, updated_by
)
values (1, 'stopped', '', 'music', '', null, now(), 'system')
on conflict (id) do nothing;
