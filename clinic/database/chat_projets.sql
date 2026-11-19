-- ─── Chat : épingler, description de projet (comme Claude / ChatGPT) ───────────
-- Idempotent. Sans ce fichier, le backend fonctionne mais sans épinglage ni description.
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_at   TIMESTAMPTZ;
ALTER TABLE projects      ADD COLUMN IF NOT EXISTS pinned_at   TIMESTAMPTZ;
ALTER TABLE projects      ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS conversations_owner_pinned_idx ON conversations (owner_id, pinned_at) WHERE pinned_at IS NOT NULL;
