-- ProcessMate Référentiel d'outils schema draft.
-- This file is not applied automatically — see referentiel-outils.md.
--
-- Référentiel global à toute la plateforme (pas propre à une procédure) : un outil
-- (Nov@, TI+, email, e-trade...) défini une fois, réutilisé par toutes les procédures —
-- cohérent avec la Cartographie applicative (ApplicatifsPanel.tsx) qui compte déjà les
-- mêmes outils à travers toutes les procédures.
--
-- Table1Row.outil (dans workflows.workflow_json) reste la source unique de "quel outil
-- pour cette étape" — ces tables ne stockent que le catalogue (écrans/champs/codes),
-- pas de lien direct à une étape ou une procédure.

CREATE TABLE IF NOT EXISTS tools (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  color       TEXT,          -- reprend la palette déjà utilisée dans ApplicatifsPanel.tsx/GrapheApplicatifs.tsx
  created_by  UUID,          -- auth.users.id
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_screens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id         UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  -- Chemin dans le bucket Storage "processmate-files" (même bucket que le reste de
  -- l'app, cf. clinic/database/supabase_client.py:upload_file_to_storage) — pas une URL
  -- publique : le bucket est privé, l'image est servie via un endpoint backend qui la
  -- télécharge et la reproxy, comme le fait déjà regulatory_impact_processor.py.
  screenshot_path TEXT,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_screen_fields (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_id      UUID NOT NULL REFERENCES tool_screens(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  field_type     TEXT NOT NULL DEFAULT 'texte'
                   CHECK (field_type IN ('texte', 'nombre', 'date', 'liste')),
  required       BOOLEAN NOT NULL DEFAULT FALSE,
  example_value  TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catalogue par outil (pas par étape) : les codes qui existent pour cet outil,
-- consultables depuis n'importe quelle étape qui l'utilise.
-- 'informatique' = un vrai extrait de code (SQL, COBOL, appel API, macro...), pas un
-- code métier fixe comme les trois autres — d'où `language` (optionnel, ex: SQL, COBOL,
-- API REST, WinDev) pour donner le contexte, absent pour transaction/produit/erreur.
CREATE TABLE IF NOT EXISTS tool_codes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id      UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  code_type    TEXT NOT NULL CHECK (code_type IN ('transaction', 'produit', 'erreur', 'informatique')),
  code         TEXT NOT NULL,
  language     TEXT,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_screens_tool_id ON tool_screens(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_screen_fields_screen_id ON tool_screen_fields(screen_id);
CREATE INDEX IF NOT EXISTS idx_tool_codes_tool_id ON tool_codes(tool_id);
CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);

-- RLS — même convention que campaigns_schema.sql : accès complet pour les utilisateurs
-- authentifiés (pas de notion de propriétaire sur un référentiel partagé).
ALTER TABLE tools               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_screens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_screen_fields  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_codes          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON tools
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_authenticated" ON tool_screens
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_authenticated" ON tool_screen_fields
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_authenticated" ON tool_codes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─── Migration : ajout de 'informatique' + language ────────────────────────
-- Si vous avez déjà exécuté ce fichier une première fois (tool_codes existe déjà),
-- le CREATE TABLE IF NOT EXISTS ci-dessus ne le modifie pas — ce bloc met à jour la
-- table existante. Idempotent, peut être relancé sans risque.
ALTER TABLE tool_codes ADD COLUMN IF NOT EXISTS language TEXT;
ALTER TABLE tool_codes DROP CONSTRAINT IF EXISTS tool_codes_code_type_check;
ALTER TABLE tool_codes ADD CONSTRAINT tool_codes_code_type_check
  CHECK (code_type IN ('transaction', 'produit', 'erreur', 'informatique'));

-- ─── Migration : règles de gestion + données de l'outil ────────────────────
-- Deux nouvelles familles, en plus des écrans/champs et des codes :
-- - tool_business_rules : ce que L'OUTIL impose/vérifie (validation, calcul, contrôle),
--   distinct des règles de gestion de la PROCÉDURE (procedure_metadata_json.regles_gestion
--   côté workflows) — même nom de concept, portée différente.
-- - tool_data_entities : les objets métier que l'outil manipule (ex. "Compte client",
--   "Dossier de crédit"), pas les champs UI d'un écran (tool_screen_fields) — un niveau
--   au-dessus, plus proche d'un dictionnaire de données que d'un détail d'écran.

CREATE TABLE IF NOT EXISTS tool_business_rules (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id      UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  rule         TEXT NOT NULL,
  rule_type    TEXT NOT NULL DEFAULT 'autre'
                 CHECK (rule_type IN ('validation', 'calcul', 'controle', 'autre')),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tool_data_entities (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id      UUID NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  nature       TEXT NOT NULL DEFAULT 'reference'
                 CHECK (nature IN ('entree', 'sortie', 'reference')),
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_business_rules_tool_id ON tool_business_rules(tool_id);
CREATE INDEX IF NOT EXISTS idx_tool_data_entities_tool_id ON tool_data_entities(tool_id);

ALTER TABLE tool_business_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_data_entities  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON tool_business_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_authenticated" ON tool_data_entities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
