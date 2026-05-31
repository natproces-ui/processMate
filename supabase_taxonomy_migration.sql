-- ═══════════════════════════════════════════════════════════
-- ProcessMate — Taxonomie des processus
-- À exécuter dans l'éditeur SQL Supabase (une seule fois)
-- ═══════════════════════════════════════════════════════════

-- 1. Table de taxonomie hiérarchique
CREATE TABLE IF NOT EXISTS process_taxonomy (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  level       TEXT NOT NULL CHECK (level IN ('theme', 'category', 'subcategory')),
  parent_id   UUID REFERENCES process_taxonomy(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Colonne taxonomy_id sur workflows
ALTER TABLE workflows
  ADD COLUMN IF NOT EXISTS taxonomy_id UUID REFERENCES process_taxonomy(id) ON DELETE SET NULL;

-- 3. Index pour les requêtes arbre
CREATE INDEX IF NOT EXISTS idx_taxonomy_parent_id   ON process_taxonomy(parent_id);
CREATE INDEX IF NOT EXISTS idx_taxonomy_level       ON process_taxonomy(level);
CREATE INDEX IF NOT EXISTS idx_workflows_taxonomy   ON workflows(taxonomy_id);

-- 4. RLS : accessible en lecture par tous les authentifiés, écriture service_role
ALTER TABLE process_taxonomy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "taxonomy_read" ON process_taxonomy
  FOR SELECT USING (true);

CREATE POLICY "taxonomy_write" ON process_taxonomy
  FOR ALL USING (auth.role() = 'service_role');
