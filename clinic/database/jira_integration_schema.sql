-- ─── Intégration Jira (générique, multi-entités) ────────────────────────────
-- Un seul mécanisme de liaison réutilisé par plusieurs origines : impacts
-- réglementaires, tâches de campagne, signalements outil/écran. entity_type +
-- entity_id identifient l'objet ProcessMate lié (pas de FK — ces entités
-- vivent dans des tables différentes selon le type, même convention que
-- campaign_procedures.assigned_to dans campaigns_schema.sql).

CREATE TABLE IF NOT EXISTS jira_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    TEXT NOT NULL
                   CHECK (entity_type IN ('regulatory_impact', 'campaign_procedure', 'tool_issue')),
  entity_id      TEXT NOT NULL,
  jira_issue_key TEXT NOT NULL,        -- ex. "PROC-123"
  jira_issue_url TEXT NOT NULL,
  jira_status    TEXT,                 -- dernier statut connu (rafraîchi via /sync)
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_jira_links_entity ON jira_links(entity_type, entity_id);

-- RLS — toutes les opérations autorisées pour les utilisateurs authentifiés
ALTER TABLE jira_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_authenticated" ON jira_links
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

-- ─── Migration : flux tâches → Jira (création automatique + métadonnées) ────
-- Ajoutée après la mise en prod initiale de jira_links — sûre à ré-exécuter.
-- 'regulatory_impact' retiré : jamais exploité (Analyse IA couvre déjà ce
-- besoin, cf. ArtifactDetail.tsx) ; 'procedure_task' ajouté pour le suivi des
-- tâches (clinic/routers/orchestration_tasks_router.py), désormais créé
-- automatiquement — pas d'action manuelle comme pour les deux autres types.

ALTER TABLE jira_links DROP CONSTRAINT IF EXISTS jira_links_entity_type_check;
ALTER TABLE jira_links ADD CONSTRAINT jira_links_entity_type_check
  CHECK (entity_type IN ('procedure_task', 'campaign_procedure', 'tool_issue'));

-- Métadonnées envoyées à Jira à la création, gardées en écho côté ProcessMate
-- pour affichage sans rappeler l'API Jira (flux aller uniquement, pas de sync
-- retour pour l'instant — jira_status reste le seul champ resynchronisable).
ALTER TABLE jira_links ADD COLUMN IF NOT EXISTS jira_priority TEXT;
ALTER TABLE jira_links ADD COLUMN IF NOT EXISTS jira_due_date DATE;
ALTER TABLE jira_links ADD COLUMN IF NOT EXISTS jira_labels TEXT[];
ALTER TABLE jira_links ADD COLUMN IF NOT EXISTS jira_assignee_email TEXT;

NOTIFY pgrst, 'reload schema';
