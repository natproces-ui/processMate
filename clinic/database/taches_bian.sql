-- ─── Tâches, notifications, couverture BIAN (prompt 7 de docs/prompts-organisations.md) ─
-- Prérequis : organisations_schema.sql. Idempotent.

-- E-mail des tâches : activé par défaut, désactivable par chaque personne
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id       UUID PRIMARY KEY,
  email_taches  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Correspondances procédure ↔ domaine de service BIAN, propres à chaque organisation.
-- Le catalogue (bian_scenarios) reste commun.
CREATE TABLE IF NOT EXISTS procedure_bian (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  procedure_id    TEXT NOT NULL,
  domaine         TEXT NOT NULL,
  statut          TEXT NOT NULL DEFAULT 'accepte' CHECK (statut IN ('suggere', 'accepte')),
  source          TEXT NOT NULL DEFAULT 'manuel' CHECK (source IN ('manuel', 'assistant')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, procedure_id, domaine)
);
CREATE INDEX IF NOT EXISTS procedure_bian_domaine_idx ON procedure_bian (organisation_id, domaine) WHERE statut = 'accepte';
ALTER TABLE procedure_bian ENABLE ROW LEVEL SECURITY;

-- Relances : appeler POST /api/taches/relances une fois par jour (tâche planifiée DigitalOcean)
-- avec l'en-tête X-Cron-Token = variable CRON_TOKEN. À défaut, les relances partent au plus une
-- fois par heure quand un membre ouvre son compteur « À faire ».
-- Paramètre d'organisation (défaut 3 jours) :
-- UPDATE organisations SET parametres = parametres || '{"relance_jours": 5}' WHERE id = '<organisation>';
