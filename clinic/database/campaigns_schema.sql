-- ─── Campagnes de formalisation ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS formalization_campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date    DATE,
  end_date      DATE,
  coordinator_id UUID,   -- user_profiles.id (nullable, no FK to keep it simple)
  created_by    UUID,    -- auth.users.id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_procedures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    UUID NOT NULL REFERENCES formalization_campaigns(id) ON DELETE CASCADE,
  procedure_id   TEXT NOT NULL,   -- workflows.id
  procedure_nom  TEXT,
  procedure_ref  TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'in_progress', 'formalized', 'validated', 'skipped')),
  assigned_to    UUID,            -- user_profiles.id
  notes          TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, procedure_id)
);

-- Index pour les requêtes par campagne
CREATE INDEX IF NOT EXISTS idx_campaign_procedures_campaign_id
  ON campaign_procedures(campaign_id);

-- RLS — toutes les opérations autorisées pour les utilisateurs authentifiés
ALTER TABLE formalization_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_procedures     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON formalization_campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "allow_all_authenticated" ON campaign_procedures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
