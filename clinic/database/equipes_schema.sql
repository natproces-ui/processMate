-- ─── Administration de l'organisation (prompt 4 de docs/prompts-organisations.md) ─
-- Équipes, membres d'équipe, branches de taxonomie dont une équipe est responsable,
-- invitations de rattachement (compte déjà inscrit librement : il doit accepter).
-- Prérequis : organisations_schema.sql. Idempotent.

CREATE TABLE IF NOT EXISTS equipes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  nom             TEXT NOT NULL,
  responsable_id  UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organisation_id, nom)
);

CREATE TABLE IF NOT EXISTS equipe_membres (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  equipe_id       UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  PRIMARY KEY (equipe_id, user_id)
);

-- Une branche de la taxonomie a au plus une équipe responsable (R proposé par défaut
-- pour les procédures de la branche, prompt 5).
CREATE TABLE IF NOT EXISTS equipe_branches (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  equipe_id       UUID NOT NULL REFERENCES equipes(id) ON DELETE CASCADE,
  taxonomy_id     UUID NOT NULL UNIQUE,
  PRIMARY KEY (equipe_id, taxonomy_id)
);

CREATE TABLE IF NOT EXISTS organisation_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'contributeur' CHECK (role IN ('admin', 'pilote', 'contributeur', 'lecteur')),
  statut          TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'acceptee', 'refusee', 'annulee')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  repondu_le      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS organisation_invitations_email_idx ON organisation_invitations (lower(email)) WHERE statut = 'en_attente';
CREATE INDEX IF NOT EXISTS equipe_membres_user_idx ON equipe_membres (user_id);

ALTER TABLE equipes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_membres           ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_branches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_invitations ENABLE ROW LEVEL SECURITY;
