-- ─── TABLE specifications ──────────────────────────────────────────────────────
-- Stocke les SFD générés depuis les procédures ProcessMate.
-- Créé pour la fonctionnalité "Spécifications" dans l'orchestration.

CREATE TABLE IF NOT EXISTS specifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type      TEXT NOT NULL CHECK (scope_type IN ('theme', 'category', 'subcategory', 'procedures')),
    scope_id        UUID,                        -- ID du nœud taxonomy (NULL si scope_type = 'procedures')
    scope_name      TEXT NOT NULL,               -- Nom affiché du scope
    procedure_ids   TEXT[] NOT NULL DEFAULT '{}',-- IDs des workflows consommés
    title           TEXT NOT NULL,
    sfd_json        JSONB NOT NULL,              -- SFDDocument complet (validé Pydantic)
    style           TEXT NOT NULL DEFAULT 'corporate_blue',
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'validated', 'archived')),
    version         INTEGER NOT NULL DEFAULT 1,
    chat_history    JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_by    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour filtrer par scope
CREATE INDEX IF NOT EXISTS idx_specifications_scope
    ON specifications (scope_type, scope_id);

-- Index pour filtrer par statut
CREATE INDEX IF NOT EXISTS idx_specifications_status
    ON specifications (status);

-- Index temporel (liste ordonnée)
CREATE INDEX IF NOT EXISTS idx_specifications_created_at
    ON specifications (created_at DESC);

-- Trigger updated_at (si la fonction existe déjà depuis campaigns ou taxonomy)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'set_specifications_updated_at'
    ) THEN
        CREATE TRIGGER set_specifications_updated_at
        BEFORE UPDATE ON specifications
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
EXCEPTION WHEN undefined_function THEN
    -- La fonction update_updated_at_column() n'existe pas encore, skip
    NULL;
END;
$$;
