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
