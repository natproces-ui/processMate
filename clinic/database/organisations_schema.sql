-- ─── Organisations (prompt 1 de docs/prompts-organisations.md) ────────────────
-- Une organisation = un client de processMate. Une personne appartient à UNE seule
-- organisation (organisation_members.user_id unique). Le super-admin processMate
-- (platform_admins) n'est membre d'aucune organisation.
-- Activation côté backend : ORGANISATIONS_ENABLED=true, APRÈS application de ce fichier
-- et vérification de la reprise (requêtes en fin de fichier).
-- Idempotent. Accès : backend seulement (clé de service), aucune politique pour les clients.

CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  statut      TEXT NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'suspendue')),
  parametres  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organisation_members (
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL UNIQUE,          -- une personne = une organisation
  role            TEXT NOT NULL DEFAULT 'contributeur'
                    CHECK (role IN ('admin', 'pilote', 'contributeur', 'lecteur')),
  statut          TEXT NOT NULL DEFAULT 'invitee' CHECK (statut IN ('active', 'invitee', 'suspendue')),
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS organisation_members_org_idx ON organisation_members (organisation_id, statut);

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id     UUID PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID,                          -- NULL : action de la plateforme
  actor_id         UUID,
  actor_nom        TEXT,
  action           TEXT NOT NULL,
  cible_type       TEXT,
  cible_id         TEXT,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_log_org_idx ON audit_log (organisation_id, created_at DESC);

ALTER TABLE organisations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- ─── Reprise de l'existant ───────────────────────────────────────────────────
-- Toutes les données actuelles appartiennent à UNE organisation, d'identifiant fixe
-- (réutilisé par la migration du prompt 2). Remplacer le nom avant d'appliquer.
INSERT INTO organisations (id, nom, slug)
VALUES ('00000000-0000-4000-8000-000000000001', 'Organisation principale', 'principale')
ON CONFLICT (id) DO NOTHING;

-- Rôles : admin → admin ; process_owner → pilote ; validator et contributor →
-- contributeur (la validation est portée par le A du RACI) ; viewer → lecteur.
-- Statuts : active → active ; invited → invitee (aucun accès tant qu'un admin n'active
-- pas, comme aujourd'hui) ; suspended → suspendue.
INSERT INTO organisation_members (organisation_id, user_id, role, statut)
SELECT '00000000-0000-4000-8000-000000000001', p.id,
       CASE p.global_role WHEN 'admin' THEN 'admin' WHEN 'process_owner' THEN 'pilote'
                          WHEN 'viewer' THEN 'lecteur' ELSE 'contributeur' END,
       CASE p.status WHEN 'active' THEN 'active' WHEN 'suspended' THEN 'suspendue' ELSE 'invitee' END
FROM user_profiles p
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON COLUMN user_profiles.global_role IS 'Obsolète depuis organisation_members.role (à retirer après bascule).';
COMMENT ON COLUMN user_profiles.status IS 'Obsolète depuis organisation_members.statut (à retirer après bascule).';

-- Premier super-admin processMate : à exécuter à la main, avec son identifiant de compte.
-- INSERT INTO platform_admins (user_id)
--   SELECT id FROM auth.users WHERE email = '<e-mail du super-admin>'
--   ON CONFLICT DO NOTHING;
-- Il ne doit PAS être membre d'une organisation :
-- DELETE FROM organisation_members WHERE user_id IN (SELECT user_id FROM platform_admins);

-- ─── Vérifications ───────────────────────────────────────────────────────────
-- SELECT role, statut, count(*) FROM organisation_members GROUP BY 1, 2 ORDER BY 1, 2;
-- SELECT p.email, p.global_role, p.status, m.role, m.statut
--   FROM user_profiles p LEFT JOIN organisation_members m ON m.user_id = p.id ORDER BY p.email;
-- Il doit rester au moins un admin actif :
-- SELECT count(*) FROM organisation_members WHERE role = 'admin' AND statut = 'active';
