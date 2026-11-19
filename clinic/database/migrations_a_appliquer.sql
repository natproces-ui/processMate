-- ═══ processMate — toutes les migrations, dans l'ordre (à coller dans Supabase › SQL Editor) ═══
-- Généré le 2026-11-19. Idempotent : peut être relancé. security_lockdown.sql n'est PAS inclus
-- (à appliquer en dernier, après déploiement et vérification).


-- ════════════════ guest_usage_schema.sql ════════════════
-- ─── Compteurs du mode invité (lot 1 de la refonte du chat) ─────────────────
-- Utilisé par clinic/manager/guest_limits.py (drapeau GUEST_LIMITS_ENABLED).
-- Une ligne par jour (UTC) et par clé : « dev:<id appareil> » ou « ip:<empreinte de l'IP> ».
-- Aucune IP en clair. Seul le backend (clé service) lit et écrit : RLS activée sans
-- politique, donc aucun accès depuis le navigateur.
-- Sans cette table, le backend compte en mémoire (par instance).

CREATE TABLE IF NOT EXISTS guest_usage (
  day          DATE NOT NULL,
  key          TEXT NOT NULL,
  turns        INTEGER NOT NULL DEFAULT 0,
  generations  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, key)
);

ALTER TABLE guest_usage ENABLE ROW LEVEL SECURITY;

-- Ménage : les compteurs de plus de 30 jours ne servent plus.
-- À lancer périodiquement (ou via pg_cron) :
-- DELETE FROM guest_usage WHERE day < CURRENT_DATE - 30;

-- ════════════════ conversations_schema.sql ════════════════
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

-- ════════════════ projects_schema.sql ════════════════
-- ─── Projets (lot 4 de la refonte du chat) ──────────────────────────────────
-- Un projet = des instructions + des sources partagées + des conversations.
-- Pas de mémoire implicite : l'assistant d'une conversation du projet voit les
-- instructions et les sources du projet, rien d'autre.
-- Prérequis : conversations_schema.sql (conversations.project_id).
-- Campagnes : NON fusionnées. Une campagne (ce qu'il faut livrer) a au plus UN projet
-- de travail (l'endroit où l'on formalise) : projects.campaign_id, unique.
-- Fichiers : bucket privé « processmate-files », préfixe projects/<project>/.

CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL,                  -- auth.users.id
  name          TEXT NOT NULL,
  instructions  TEXT NOT NULL DEFAULT '',
  campaign_id   UUID,                           -- formalization_campaigns.id, facultatif
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS projects_campaign_unique ON projects (campaign_id) WHERE campaign_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_members (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  role        TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS project_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  type          TEXT NOT NULL,
  size          BIGINT NOT NULL DEFAULT 0,
  sha256        TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  added_by      UUID,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  removed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_sources_project_idx ON project_sources (project_id) WHERE removed_at IS NULL;

DO $$ BEGIN
  ALTER TABLE conversations
    ADD CONSTRAINT conversations_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_sources ENABLE ROW LEVEL SECURITY;

-- Lecture : propriétaire ou membre. Écriture : propriétaire (le backend gère les éditeurs).
DO $$ BEGIN
  CREATE POLICY projects_read ON projects FOR SELECT USING (
    owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = id AND m.user_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY projects_write ON projects FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY project_members_read ON project_members FOR SELECT USING (
    user_id = auth.uid() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY project_sources_read ON project_sources FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND (p.owner_id = auth.uid()
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ════════════════ procedure_versions_schema.sql ════════════════
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

-- ════════════════ organisations_schema.sql ════════════════
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
VALUES ('00000000-0000-4000-8000-000000000001', 'processmate-org', 'processmate-org')
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

-- ════════════════ organisations_cloisonnement.sql ════════════════
-- ─── Cloisonnement par organisation (prompt 2 de docs/prompts-organisations.md) ──
-- Prérequis : organisations_schema.sql (organisation d'identifiant fixe pour l'existant).
-- Ajoute organisation_id à chaque table « propre à une organisation » (liste identique
-- à ORG_TABLES dans clinic/database/org_scope.py), la remplit avec l'organisation
-- reprise, la rend obligatoire et l'indexe. Idempotent ; ignore les tables absentes.
--
-- Le backend filtre ensuite TOUTES les requêtes sur ces tables par l'organisation de
-- l'appelant (ORGANISATIONS_ENABLED=true). À activer seulement après ce fichier.

DO $$
DECLARE
  t text;
  default_org uuid := '00000000-0000-4000-8000-000000000001';
  org_tables text[] := ARRAY[
    'workflows', 'sessions', 'messages', 'files', 'process_taxonomy', 'process_maps',
    'procedure_versions', 'procedure_assignments', 'procedure_validation_reviews', 'procedure_events',
    'formalization_campaigns', 'campaign_procedures', 'campaigns',
    'procedure_tasks', 'procedure_task_comments', 'procedure_task_events', 'procedure_notifications',
    'analysis_sessions', 'analysis_messages', 'analysis_artifacts',
    'irritants', 'findings', 'pistes', 'piste_messages', 'specifications',
    'tools', 'tool_screens', 'tool_screen_fields', 'tool_codes', 'tool_business_rules', 'tool_data_entities',
    'jira_links'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'Table absente, ignorée : %', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS organisation_id UUID REFERENCES organisations(id)', t);
    EXECUTE format('UPDATE public.%I SET organisation_id = %L WHERE organisation_id IS NULL', t, default_org);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organisation_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (organisation_id)', t || '_organisation_idx', t);
  END LOOP;
END $$;

-- ─── Unicités à rendre propres à chaque organisation ─────────────────────────
-- Une référence ou un code unique sur toute la base empêcherait deux clients d'avoir la
-- même. Ce bloc LISTE les contraintes d'unicité (hors clé primaire) des tables
-- cloisonnées qui n'incluent pas organisation_id : à transformer au cas par cas en
-- UNIQUE (organisation_id, …) après vérification. Il ne modifie rien.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'u'
      AND c.connamespace = 'public'::regnamespace
      AND c.conrelid::regclass::text IN (
        'workflows', 'sessions', 'process_taxonomy', 'process_maps', 'formalization_campaigns',
        'campaign_procedures', 'procedure_assignments', 'tools', 'tool_screens', 'tool_codes',
        'specifications', 'jira_links', 'irritants', 'procedure_versions')
      AND NOT EXISTS (
        SELECT 1 FROM unnest(c.conkey) k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'organisation_id')
  LOOP
    RAISE NOTICE 'Unicité globale à revoir : % % %', r.tbl, r.conname, r.def;
  END LOOP;
END $$;

-- ─── Vérifications ───────────────────────────────────────────────────────────
-- Aucune ligne sans organisation (doit renvoyer 0 partout) :
-- SELECT 'workflows', count(*) FROM workflows WHERE organisation_id IS NULL
-- UNION ALL SELECT 'formalization_campaigns', count(*) FROM formalization_campaigns WHERE organisation_id IS NULL
-- UNION ALL SELECT 'procedure_tasks', count(*) FROM procedure_tasks WHERE organisation_id IS NULL;
-- Les fonctions procedure_link_edges / screen_step_usages ne sont pas cloisonnées : en
-- mode organisations le backend ne les appelle plus (calcul applicatif filtré).

-- ════════════════ plateforme_schema.sql ════════════════
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

-- ════════════════ equipes_schema.sql ════════════════
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

-- ════════════════ campagnes_emplacements.sql ════════════════
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

-- ════════════════ circuit_validation.sql ════════════════
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

-- ════════════════ taches_bian.sql ════════════════
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

-- ════════════════ Super-admin processMate : ouedayma@gmail.com ════════════════
-- Si le compte existe déjà : il devient super-admin et sort de l'organisation (un super-admin
-- n'est membre d'aucune organisation). S'il n'existe pas encore, ces lignes ne font rien :
-- le compte sera créé par lien (voir docs/organisations-mise-en-service.md), puis relancer ce bloc.
INSERT INTO platform_admins (user_id)
  SELECT id FROM auth.users WHERE lower(email) = 'ouedayma@gmail.com'
  ON CONFLICT DO NOTHING;
DELETE FROM organisation_members WHERE user_id IN (SELECT user_id FROM platform_admins);

-- ════════════════ Vérifications ════════════════
SELECT 'organisation' AS quoi, nom AS valeur FROM organisations
UNION ALL SELECT 'membres actifs', count(*)::text FROM organisation_members WHERE statut = 'active'
UNION ALL SELECT 'admins actifs', count(*)::text FROM organisation_members WHERE role = 'admin' AND statut = 'active'
UNION ALL SELECT 'super-admins', count(*)::text FROM platform_admins
UNION ALL SELECT 'procédures sans organisation', count(*)::text FROM workflows WHERE organisation_id IS NULL;
