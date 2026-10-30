-- Disposition de la carte « Enchaînement des process », une par thème : position et taille
-- de chaque procédure (bassin BPMN) et dernière vue (zoom, déplacement). Enregistrée
-- automatiquement quand l'utilisateur quitte la carte. À appliquer une fois dans l'éditeur
-- SQL Supabase.

CREATE TABLE IF NOT EXISTS process_maps (
  theme_id    UUID PRIMARY KEY REFERENCES process_taxonomy(id) ON DELETE CASCADE,
  layout      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE process_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_authenticated" ON process_maps
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
