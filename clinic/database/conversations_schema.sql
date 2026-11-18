-- ─── Conversations persistées (lot 3 de la refonte du chat) ─────────────────
-- Utilisé par clinic/manager/conversation_store.py et clinic/routers/conversations_router.py
-- (drapeau CONVERSATIONS_ENABLED côté backend, NEXT_PUBLIC_CONVERSATIONS_ENABLED côté frontend).
--
-- Principe : Supabase est la source de vérité de l'historique. Pas de mémoire implicite :
-- l'assistant ne voit que les messages et les sources de la conversation (et, au lot 4,
-- les instructions et sources de son projet).
-- Le backend écrit avec la clé de service et vérifie lui-même le propriétaire ; les
-- politiques RLS ci-dessous protègent un éventuel accès direct depuis le navigateur.
-- Fichiers : bucket privé existant « processmate-files », préfixe conversations/<owner>/<conversation>/.

CREATE TABLE IF NOT EXISTS conversations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL,                 -- auth.users.id
  title          TEXT NOT NULL DEFAULT 'Nouvelle conversation',
  procedure_ids  TEXT[] NOT NULL DEFAULT '{}',  -- workflows.id liés à la conversation
  project_id     UUID,                          -- lot 4 (projects.id), facultatif
  state          JSONB NOT NULL DEFAULT '{}',   -- dernière proposition, fichiers de référence
  summary        TEXT,                          -- résumé des anciens échanges (contexte long)
  summary_upto   INTEGER NOT NULL DEFAULT 0,    -- nombre de messages couverts par le résumé
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS conversations_owner_updated_idx ON conversations (owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_procedures_idx ON conversations USING GIN (procedure_ids);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'clarify')),
  content          TEXT NOT NULL DEFAULT '',
  payload          JSONB NOT NULL DEFAULT '{}',  -- étapes, proposition, générations, relecture, suggestions, pièces jointes
  interaction_id   TEXT,                         -- identifiant d'interaction Gemini (optimisation, peut expirer)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS conversation_messages_conv_idx ON conversation_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS conversation_sources (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  filename         TEXT NOT NULL,
  type             TEXT NOT NULL,                -- pdf, image, docx, pptx
  size             BIGINT NOT NULL DEFAULT 0,
  sha256           TEXT NOT NULL,                -- dédoublonnage
  storage_path     TEXT NOT NULL,
  pages            INTEGER,
  added_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS conversation_sources_conv_idx ON conversation_sources (conversation_id) WHERE removed_at IS NULL;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversations_owner ON conversations
    FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY conversation_messages_owner ON conversation_messages
    FOR ALL USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY conversation_sources_owner ON conversation_sources
    FOR ALL USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
