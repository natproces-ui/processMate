-- ─── Emplacements de campagne (prompt 5 de docs/prompts-organisations.md) ────
-- Une campagne porte des « procédures attendues » (emplacements) qui n'existent pas
-- forcément encore dans le référentiel : procedure_id devient facultatif.
-- Les lignes existantes restent des emplacements déjà reliés (aucune perte).
-- Activation : CAMPAIGN_SLOTS_ENABLED=true. Idempotent.

ALTER TABLE campaign_procedures ALTER COLUMN procedure_id DROP NOT NULL;
ALTER TABLE campaign_procedures ADD COLUMN IF NOT EXISTS taxonomy_id UUID;
ALTER TABLE campaign_procedures ADD COLUMN IF NOT EXISTS equipe_id   UUID;
ALTER TABLE campaign_procedures ADD COLUMN IF NOT EXISTS echeance    DATE;
ALTER TABLE campaign_procedures ADD COLUMN IF NOT EXISTS origine     TEXT NOT NULL DEFAULT 'referentiel';
-- RACI tant que l'emplacement n'est pas relié ; ensuite porté par procedure_assignments
ALTER TABLE campaign_procedures ADD COLUMN IF NOT EXISTS raci        JSONB;

-- Statuts : ajout de « soumise » (submitted) et « en relecture » (in_review)
DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'campaign_procedures'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE campaign_procedures DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE campaign_procedures ADD CONSTRAINT campaign_procedures_status_check
  CHECK (status IN ('pending', 'in_progress', 'submitted', 'in_review', 'formalized', 'validated', 'skipped'));

DO $$ BEGIN
  ALTER TABLE campaign_procedures ADD CONSTRAINT campaign_procedures_origine_check
    CHECK (origine IN ('referentiel', 'document', 'bian', 'analyse', 'proposition', 'saisie'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS campaign_procedures_equipe_idx ON campaign_procedures (equipe_id);

-- Vérification : SELECT status, origine, count(*) FROM campaign_procedures GROUP BY 1, 2;
