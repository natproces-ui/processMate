-- ProcessMate — calcul des liens entre procédures et des usages d'écrans, côté base.
-- Ce fichier n'est pas appliqué automatiquement : le coller une fois dans l'éditeur SQL
-- de Supabase. Tant qu'il n'est pas appliqué, le backend garde son calcul Python
-- (orchestration_router._collect_links, tools_router.get_screen_usages), qui relit
-- toutes les procédures (~2 Mo, ~2-4 s). Une fois appliqué : quelques lignes renvoyées.
--
-- Aucune table, aucune copie : les fonctions lisent les mêmes champs JSON que le code
-- (enrichments_json[step].liens / .ecrans, procedure_metadata_json.necessite), sur la
-- dernière version de chaque procédure. Le résultat est donc toujours à jour, quel que
-- soit le chemin qui a enregistré la procédure.

-- Dernière version de chaque procédure (même règle que _get_latest_workflows).
-- security_invoker : la vue applique les droits (RLS) de l'appelant sur `workflows` ;
-- sans ça, une vue Supabase les contourne et serait lisible via l'API publique.
CREATE OR REPLACE VIEW latest_workflows WITH (security_invoker = true) AS
SELECT DISTINCT ON (session_id)
       id::text          AS workflow_id,
       session_id::text  AS session_id,
       COALESCE(NULLIF(procedure_metadata_json::jsonb ->> 'nom', ''), title, 'Sans titre') AS nom,
       CASE WHEN jsonb_typeof(workflow_json::jsonb) = 'array'
            THEN workflow_json::jsonb ELSE '[]'::jsonb END             AS workflow_json,
       CASE WHEN jsonb_typeof(enrichments_json::jsonb) = 'object'
            THEN enrichments_json::jsonb ELSE '{}'::jsonb END          AS enrichments_json,
       CASE WHEN jsonb_typeof(procedure_metadata_json::jsonb) = 'object'
            THEN procedure_metadata_json::jsonb ELSE '{}'::jsonb END   AS metadata
FROM workflows
ORDER BY session_id, version DESC;


-- Nom d'une étape (Table1Row.étape) à partir de son id
CREATE OR REPLACE FUNCTION _step_name(rows jsonb, step_id text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT r ->> 'étape' FROM jsonb_array_elements(rows) r WHERE r ->> 'id' = step_id LIMIT 1
$$;


-- Arêtes source → cible. p_session NULL = toutes (Carte des process),
-- sinon celles dont la procédure est la source ou la cible.
CREATE OR REPLACE FUNCTION procedure_link_edges(p_session text DEFAULT NULL)
RETURNS TABLE (
    source_session text, source_workflow_id text, source_nom text,
    target_session text, target_workflow_id text, target_nom text,
    link_type text, step_id text, step_name text
)
LANGUAGE sql STABLE AS $$
    WITH edges AS (
        -- fait_appel_a / declenche : posés sur une étape
        SELECT l.session_id AS src, lien ->> 'cible' AS tgt, lien ->> 'type' AS link_type,
               e.key AS step_id, _step_name(l.workflow_json, e.key) AS step_name
        FROM latest_workflows l
        CROSS JOIN LATERAL jsonb_each(l.enrichments_json) e
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(e.value -> 'liens') = 'array' THEN e.value -> 'liens' ELSE '[]'::jsonb END
        ) lien
        WHERE left(e.key, 2) <> '__'
          AND lien ->> 'type' IN ('fait_appel_a', 'declenche')
          AND COALESCE(lien ->> 'cible', '') <> ''
        UNION ALL
        -- necessite : posé sur la procédure
        SELECT l.session_id, cible, 'necessite', NULL, NULL
        FROM latest_workflows l
        CROSS JOIN LATERAL jsonb_array_elements_text(
            CASE WHEN jsonb_typeof(l.metadata -> 'necessite') = 'array' THEN l.metadata -> 'necessite' ELSE '[]'::jsonb END
        ) cible
        WHERE cible <> ''
    )
    SELECT e.src, s.workflow_id, s.nom,
           e.tgt, t.workflow_id, COALESCE(t.nom, 'Procédure supprimée'),
           e.link_type, e.step_id, e.step_name
    FROM edges e
    JOIN latest_workflows s ON s.session_id = e.src
    LEFT JOIN latest_workflows t ON t.session_id = e.tgt
    WHERE p_session IS NULL OR e.src = p_session OR e.tgt = p_session
$$;


-- Étapes qui ont sélectionné l'un des écrans donnés (TaskEnrichment.ecrans)
CREATE OR REPLACE FUNCTION screen_step_usages(p_screen_ids text[])
RETURNS TABLE (screen_id text, workflow_id text, procedure_title text, step_id text, step_name text)
LANGUAGE sql STABLE AS $$
    SELECT s, l.workflow_id, l.nom, e.key, _step_name(l.workflow_json, e.key)
    FROM latest_workflows l
    CROSS JOIN LATERAL jsonb_each(l.enrichments_json) e
    CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(e.value -> 'ecrans') = 'array' THEN e.value -> 'ecrans' ELSE '[]'::jsonb END
    ) s
    WHERE left(e.key, 2) <> '__' AND s = ANY (p_screen_ids)
$$;
