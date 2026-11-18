-- ─── Versions de procédure (lot 5 de la refonte du chat) ────────────────────
-- Utilisé par clinic/routers/orchestration_router.py (enregistrement) et
-- clinic/routers/versions_router.py (historique, restauration), drapeau VERSIONS_ENABLED.
-- Une version à chaque enregistrement ; au premier enregistrement suivi, l'état d'avant est
-- aussi conservé (source « initial »). Restaurer crée une nouvelle version : rien n'est détruit.
-- procedure_id = workflows.id (TEXT, comme ailleurs dans le schéma).

CREATE TABLE IF NOT EXISTS procedure_versions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id             TEXT NOT NULL,
  version                  INTEGER NOT NULL,
  workflow_json            JSONB NOT NULL DEFAULT '[]',
  enrichments_json         JSONB NOT NULL DEFAULT '{}',   -- sans le XML (colonne dédiée)
  bpmn_xml                 TEXT,
  metadata                 JSONB NOT NULL DEFAULT '{}',
  source                   TEXT NOT NULL DEFAULT 'manuel'
                             CHECK (source IN ('initial', 'manuel', 'ia', 'restauration')),
  author_id                UUID,
  conversation_message_id  UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_id, version)
);

CREATE INDEX IF NOT EXISTS procedure_versions_proc_idx ON procedure_versions (procedure_id, version DESC);

-- Accès par le backend (clé de service) uniquement.
ALTER TABLE procedure_versions ENABLE ROW LEVEL SECURITY;
