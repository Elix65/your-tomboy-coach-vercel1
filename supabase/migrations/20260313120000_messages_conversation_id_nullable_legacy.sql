-- Temporary rollback to legacy chat pipeline: public.messages is the only source of truth.
-- Keep conversation_id if present, but make it optional so inserts do not depend on conversations.

alter table if exists public.messages
  alter column conversation_id drop not null;
