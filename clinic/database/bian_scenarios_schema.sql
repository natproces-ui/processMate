-- ─── Scénarios BIAN (référentiel de processus de base) ─────────────────────
-- Alimentée par clinic/scripts/bian_scraper.py + clinic/scripts/load_bian_scenarios.py.
-- Sert de bibliothèque de procédures de base : un utilisateur qui crée une
-- nouvelle procédure peut en choisir une ici comme point de départ, puis la
-- retravailler dans ProcessMate.

CREATE TABLE IF NOT EXISTS bian_scenarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version        TEXT NOT NULL,           -- ex. "14-0-0", "8-0"
  view_id        TEXT NOT NULL,           -- id BIAN d'origine (view_XXXXX)
  title          TEXT NOT NULL,
  category       TEXT,                    -- ex. "Card Products", "Lending"
  url            TEXT NOT NULL,           -- page source bian.org
  participants   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["Card Authorization", ...]
  steps          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{order, action, from, to}, ...]
  status         TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'imported')),
  imported_as_workflow_id TEXT,           -- workflows.id une fois repris par un utilisateur (pas de FK, cf. convention campaigns_schema.sql)
  scraped_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (version, view_id)
);

-- Index pour parcourir/filtrer la bibliothèque par catégorie ou par version
CREATE INDEX IF NOT EXISTS idx_bian_scenarios_category ON bian_scenarios(category);
CREATE INDEX IF NOT EXISTS idx_bian_scenarios_version  ON bian_scenarios(version);
CREATE INDEX IF NOT EXISTS idx_bian_scenarios_status   ON bian_scenarios(status);

-- RLS — toutes les opérations autorisées pour les utilisateurs authentifiés
ALTER TABLE bian_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON bian_scenarios
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
