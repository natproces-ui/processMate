-- Écrans « réels » du référentiel d'applicatifs, pour le défilement des écrans :
--  1. types de champs supplémentaires (case à cocher, dépôt de pièce, simple affichage) ;
--  2. la page HTML de chaque écran (tool_screens.html) et la charte graphique de
--     l'applicatif (tools.design_css), affichées ensemble dans un iframe isolé (sans script).
-- À appliquer une fois dans l'éditeur SQL Supabase (comme procedure_links_functions.sql).

ALTER TABLE tool_screen_fields DROP CONSTRAINT IF EXISTS tool_screen_fields_field_type_check;
ALTER TABLE tool_screen_fields ADD CONSTRAINT tool_screen_fields_field_type_check
  CHECK (field_type IN ('texte', 'nombre', 'date', 'liste', 'case', 'fichier', 'affichage'));

ALTER TABLE tool_screens ADD COLUMN IF NOT EXISTS html TEXT;
ALTER TABLE tools        ADD COLUMN IF NOT EXISTS design_css TEXT;
