-- ─── Compteurs du mode invité (lot 1 de la refonte du chat) ─────────────────
-- Utilisé par clinic/manager/guest_limits.py (drapeau GUEST_LIMITS_ENABLED).
-- Une ligne par jour (UTC) et par clé : « dev:<id appareil> » ou « ip:<empreinte de l'IP> ».
-- Aucune IP en clair. Seul le backend (clé service) lit et écrit : RLS activée sans
-- politique, donc aucun accès depuis le navigateur.
-- Sans cette table, le backend compte en mémoire (par instance).

CREATE TABLE IF NOT EXISTS guest_usage (
  day          DATE NOT NULL,
  key          TEXT NOT NULL,
  turns        INTEGER NOT NULL DEFAULT 0,
  generations  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, key)
);

ALTER TABLE guest_usage ENABLE ROW LEVEL SECURITY;

-- Ménage : les compteurs de plus de 30 jours ne servent plus.
-- À lancer périodiquement (ou via pg_cron) :
-- DELETE FROM guest_usage WHERE day < CURRENT_DATE - 30;
