-- Run this once in Supabase SQL Editor for Kwentayo/Open Stage.
-- These grants allow the server-side staff moderation API to act with the service role.

grant select, delete on table public.open_stage_messages to service_role;
grant select, delete on table public.open_stage_queue to service_role;
grant select, update on table public.open_stage_state to service_role;
