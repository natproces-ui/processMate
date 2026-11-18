-- ─── Console plateforme (prompt 3 de docs/prompts-organisations.md) ─────────
-- Consommation IA par organisation, par jour et par tâche (jamais de contenu).
-- organisation_id = 00000000-0000-0000-0000-000000000000 : appels hors organisation
-- (invités, comptes libres). Prérequis : organisations_schema.sql. Idempotent.

CREATE TABLE IF NOT EXISTS ai_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL,
  jour            DATE NOT NULL,
  tache           TEXT NOT NULL,
  appels          INTEGER NOT NULL DEFAULT 0,
  jetons_entree   BIGINT NOT NULL DEFAULT 0,
  jetons_sortie   BIGINT NOT NULL DEFAULT 0,
  UNIQUE (organisation_id, jour, tache)
);

CREATE INDEX IF NOT EXISTS ai_usage_jour_idx ON ai_usage (jour, organisation_id);
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
