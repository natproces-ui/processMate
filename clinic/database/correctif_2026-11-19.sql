-- ═══ Correctif du 2026-11-19 — à exécuter MAINTENANT dans Supabase › SQL Editor ═══
-- Idempotent : peut être relancé sans risque.

-- ─── 1. URGENT : la production actuelle écrit sans organisation_id ──────────────
-- migrations_a_appliquer.sql a rendu organisation_id obligatoire (NOT NULL) sur les tables
-- métier. Le code en production ne le renseigne pas encore : chaque création de procédure,
-- tâche, session, campagne… échoue. Une valeur par défaut (processmate-org) corrige cela,
-- et reste correcte après déploiement (en mode organisations, le backend la renseigne lui-même).
DO $$
DECLARE
  t text;
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
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN organisation_id SET DEFAULT %L',
                     t, '00000000-0000-4000-8000-000000000001');
    END IF;
  END LOOP;
END $$;

-- ─── 2. Rôles : ne pas mélanger ──────────────────────────────────────────────
-- Super-admin processMate : ouedraogoaymar07@gmail.com (gère les espaces, ne voit pas les
--   procédures, n'est membre d'aucune organisation).
-- Admin de l'organisation processmate-org : ouedayma@gmail.com.

-- 2a. Retirer ouedayma@gmail.com des super-admins (ajouté par erreur)
DELETE FROM platform_admins
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'ouedayma@gmail.com');

-- 2b. ouedraogoaymar07@gmail.com devient super-admin et sort de l'organisation
INSERT INTO platform_admins (user_id)
  SELECT id FROM auth.users WHERE lower(email) = 'ouedraogoaymar07@gmail.com'
  ON CONFLICT DO NOTHING;
DELETE FROM organisation_members
WHERE user_id IN (SELECT id FROM auth.users WHERE lower(email) = 'ouedraogoaymar07@gmail.com');

-- 2c. ouedayma@gmail.com : administrateur actif de processmate-org (si son compte existe)
INSERT INTO organisation_members (organisation_id, user_id, role, statut)
  SELECT '00000000-0000-4000-8000-000000000001', id, 'admin', 'active'
  FROM auth.users WHERE lower(email) = 'ouedayma@gmail.com'
  ON CONFLICT (user_id) DO UPDATE
    SET organisation_id = EXCLUDED.organisation_id, role = 'admin', statut = 'active', updated_at = NOW();

-- ─── 3. Vérifications ────────────────────────────────────────────────────────
SELECT u.email,
       CASE WHEN pa.user_id IS NOT NULL THEN 'super-admin' ELSE '' END AS plateforme,
       COALESCE(o.nom, '—') AS organisation, COALESCE(m.role, '—') AS role, COALESCE(m.statut, '—') AS statut
FROM auth.users u
LEFT JOIN platform_admins pa ON pa.user_id = u.id
LEFT JOIN organisation_members m ON m.user_id = u.id
LEFT JOIN organisations o ON o.id = m.organisation_id
WHERE lower(u.email) IN ('ouedayma@gmail.com', 'ouedraogoaymar07@gmail.com');
-- Si ouedayma@gmail.com n'apparaît pas : son compte n'existe pas encore. Il sera créé avec un
-- lien d'invitation (le relancer ensuite rattache le compte comme admin).

SELECT count(*) AS admins_actifs_processmate_org FROM organisation_members
WHERE organisation_id = '00000000-0000-4000-8000-000000000001' AND role = 'admin' AND statut = 'active';
