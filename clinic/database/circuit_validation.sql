-- ─── Circuit de validation et propositions (prompt 6 de docs/prompts-organisations.md) ─
-- États de version (l'historique des versions doit être installé : procedure_versions_schema.sql),
-- validation portant le NOM figé et la DATE, propositions au référentiel.
-- La validation est aussi inscrite dans workflows.procedure_metadata_json.validation.
-- Prérequis : organisations_schema.sql. Idempotent.

ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS statut          TEXT NOT NULL DEFAULT 'enregistree';
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS soumise_par     UUID;
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS soumise_le      TIMESTAMPTZ;
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS validee_par     UUID;
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS validee_par_nom TEXT;   -- figé : survit à un départ
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS validee_le      TIMESTAMPTZ;
ALTER TABLE procedure_versions ADD COLUMN IF NOT EXISTS commentaire     TEXT;
DO $$ BEGIN
  ALTER TABLE procedure_versions ADD CONSTRAINT procedure_versions_statut_check
    CHECK (statut IN ('enregistree', 'soumise', 'en_relecture', 'validee', 'publiee', 'obsolete'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS procedure_propositions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  titre            TEXT NOT NULL,
  workflow_json    JSONB NOT NULL DEFAULT '[]',
  enrichments_json JSONB NOT NULL DEFAULT '{}',
  metadata         JSONB NOT NULL DEFAULT '{}',
  message          TEXT,
  propose_par      UUID NOT NULL,
  statut           TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee')),
  decision         TEXT CHECK (decision IN ('campagne', 'referentiel', 'refuser')),
  motif            TEXT,
  procedure_id     TEXT,
  campaign_id      UUID,
  traitee_par      UUID,
  traitee_le       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS procedure_propositions_statut_idx ON procedure_propositions (organisation_id, statut, created_at DESC);
ALTER TABLE procedure_propositions ENABLE ROW LEVEL SECURITY;

-- Paramètre d'organisation (désactivé par défaut) : un A peut valider sa propre soumission.
-- UPDATE organisations SET parametres = parametres || '{"auto_validation": true}' WHERE id = '<organisation>';
