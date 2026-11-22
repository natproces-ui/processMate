-- ─── Procédures de la conversation, côté serveur, avec leurs versions ───────────────────────────
-- Plan : docs/conversation-serveur.md (lot A). Utilisé par clinic/manager/conversation_procedures.py.
-- Le serveur fait foi : chaque génération, modification par le chat, correction à la main ou restauration
-- crée une version. Rien n'est écrasé ; « rétablir » crée une nouvelle version.
-- Le backend écrit avec la clé de service et vérifie lui-même le propriétaire de la conversation ;
-- les politiques RLS protègent un éventuel accès direct depuis le navigateur (comme conversations_schema.sql).
-- À appliquer après conversations_schema.sql. Idempotent.

CREATE TABLE IF NOT EXISTS conversation_procedures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  key              TEXT NOT NULL,                 -- clé stable utilisée par les messages et l'écran
  title            TEXT NOT NULL DEFAULT 'Procédure',
  position         INTEGER NOT NULL DEFAULT 0,    -- ordre des onglets
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archivee')),
  current_version  INTEGER NOT NULL DEFAULT 1,
  workflow_db_id   TEXT,                          -- procédure du référentiel où elle a été enregistrée
  saved_version    INTEGER,                       -- version enregistrée dans le référentiel
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, key)
);

CREATE INDEX IF NOT EXISTS conversation_procedures_conv_idx ON conversation_procedures (conversation_id, position);

CREATE TABLE IF NOT EXISTS conversation_procedure_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id      UUID NOT NULL REFERENCES conversation_procedures(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  title             TEXT NOT NULL DEFAULT 'Procédure',
  workflow_json     JSONB NOT NULL DEFAULT '[]',
  enrichments_json  JSONB NOT NULL DEFAULT '{}',
  metadata          JSONB NOT NULL DEFAULT '{}',
  bpmn_xml          TEXT,                          -- seulement quand le diagramme a été retouché à la main
  origine           TEXT NOT NULL DEFAULT 'generation'
                    CHECK (origine IN ('generation', 'modification', 'transcription', 'reecriture',
                                       'manuel', 'restauration', 'reprise')),
  message_id        UUID,                          -- message du chat qui l'a produite (vide : correction à la main)
  resume            TEXT,                          -- ce qui a changé, en une phrase
  author_id         UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_id, version)
);

CREATE INDEX IF NOT EXISTS conversation_procedure_versions_proc_idx
  ON conversation_procedure_versions (procedure_id, version DESC);

ALTER TABLE conversation_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_procedure_versions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY conversation_procedures_owner ON conversation_procedures
    FOR ALL USING (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_id AND c.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY conversation_procedure_versions_owner ON conversation_procedure_versions
    FOR ALL USING (EXISTS (SELECT 1 FROM conversation_procedures p JOIN conversations c ON c.id = p.conversation_id
                           WHERE p.id = procedure_id AND c.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM conversation_procedures p JOIN conversations c ON c.id = p.conversation_id
                        WHERE p.id = procedure_id AND c.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
