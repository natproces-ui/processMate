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
