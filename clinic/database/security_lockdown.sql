-- ─── Verrouillage des accès directs à la base (sécurité) ─────────────────────
-- Contexte : la clé publique Supabase (« anon ») est dans le frontend et l'inscription
-- est libre. Toute politique RLS permissive (ex. « allow_all_authenticated » des
-- campagnes) laisse donc n'importe quel inscrit lire et modifier la table directement
-- par l'API REST de Supabase, sans passer par le backend.
--
-- Architecture : le frontend ne lit AUCUNE table métier directement ; tout passe par
-- le backend clinic (clé de service, qui contourne la RLS) et ses contrôles
-- (manager/access_control.py). On peut donc tout fermer aux rôles anon/authenticated.
-- Seule exception : user_profiles, lecture de SA ligne (repli de AuthContext).
--
-- À appliquer APRÈS le déploiement du frontend qui passe par /api/me.
-- Idempotent. Vérifications après application : voir la fin du fichier.

-- 1. RLS activée partout, et toutes les politiques existantes retirées
--    (sans politique, anon/authenticated n'ont plus aucun accès ; service_role passe).
DO $$
DECLARE t record; p record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t.tablename);
    END LOOP;
  END LOOP;
END $$;

-- 2. user_profiles : chacun lit sa propre ligne, personne n'écrit directement
--    (les modifications passent par PATCH /api/me et, pour les rôles, par un admin).
CREATE POLICY user_profiles_read_own ON public.user_profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

-- 3. Défense en profondeur : rôle et statut ne changent jamais par le client, et un
--    profil créé par l'inscription libre n'est pas membre de l'organisation.
--    - session_user = supabase_auth_admin : insertion faite par le déclencheur
--      d'inscription (auth.users) ;
--    - auth.role() anon/authenticated : écriture par l'API REST avec la clé publique.
--    Les écritures du backend (service_role) et de l'éditeur SQL (postgres) passent.
CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE from_client boolean :=
  session_user = 'supabase_auth_admin' OR coalesce(auth.role(), '') IN ('anon', 'authenticated');
BEGIN
  IF NOT from_client THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.global_role := 'viewer';
    NEW.status := 'invited';
  ELSE
    NEW.global_role := OLD.global_role;
    NEW.status := OLD.status;
    NEW.id := OLD.id;
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS protect_profile_privileges ON public.user_profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE INSERT OR UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();

-- 4. Stockage : le bucket des fichiers reste privé (lecture par le backend seulement).
UPDATE storage.buckets SET public = false WHERE id = 'processmate-files';

-- ─── Vérifications ───────────────────────────────────────────────────────────
-- a) Aucune politique hors user_profiles :
--    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public';
-- b) Inscrire un compte de test depuis l'accueil, puis :
--    SELECT email, global_role, status FROM user_profiles ORDER BY created_at DESC LIMIT 1;
--    → viewer / invited. Un admin l'active depuis « Administration › Utilisateurs ».
-- c) Revoir les comptes actifs : seuls les membres réels de l'organisation doivent
--    avoir status = 'active'.
--    SELECT email, global_role, status FROM user_profiles ORDER BY status, email;
