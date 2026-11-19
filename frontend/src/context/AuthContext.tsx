'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';
import { API_CONFIG } from '@/lib/api-config';
import { installApiAuth } from '@/lib/apiAuth';
import { setAccessToken } from '@/lib/authHeaders';

// Jeton ajouté à tous les appels au backend, avant le moindre rendu
installApiAuth();

// ─── Types ────────────────────────────────────────────────────

export type UserProfile = {
  id: string;
  email: string;
  full_name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  global_role: 'admin' | 'validator' | 'process_owner' | 'contributor' | 'viewer';
  status: string | null;
};

export type ProfileUpdates = Partial<Pick<UserProfile,
  'full_name' | 'display_name' | 'avatar_url' | 'phone' | 'job_title' | 'department'
>>;

/** Accès décidé par le backend (GET /api/me) — mêmes règles que manager/access_control.py */
export type OrgRole = 'admin' | 'pilote' | 'contributeur' | 'lecteur';

export type Access = {
  /** membre actif de l'organisation : référentiel, campagnes, orchestration */
  member: boolean;
  /** rôle dans l'organisation (vocabulaire d'organisation, quel que soit le mode) */
  role: OrgRole | null;
  /** active, invited, suspended, organisation_suspendue, indisponible */
  status: string | null;
  /** administrateur de l'organisation */
  is_admin: boolean;
  can_manage_campaigns: boolean;
  read_only: boolean;
  /** super-admin processMate (console des organisations) */
  is_platform_admin: boolean;
  /** organisations activées côté backend (ORGANISATIONS_ENABLED) */
  organisations_mode: boolean;
  organisation: { id: string; nom: string | null; statut: string | null } | null;
  /** compte libre : invitations d'organisations en attente de sa réponse */
  invitations: { id: string; organisation: string | null; role: OrgRole }[];
};

/** Droits impossibles à vérifier (backend injoignable) : aucun accès, mais pas « en attente » */
const NO_ACCESS: Access = {
  member: false, role: null, status: 'indisponible', is_admin: false, can_manage_campaigns: false,
  read_only: false, is_platform_admin: false, organisations_mode: false, organisation: null, invitations: [],
};

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  /** null tant que /api/me n'a pas répondu */
  access: Access | null;
  refreshAccess: () => Promise<void>;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, jobTitle?: string, department?: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: ProfileUpdates) => Promise<{ error: string | null }>;
};

// ─── Context ──────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

// ─── Provider ─────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);

  /** Profil + droits via le backend ; true si la réponse a été exploitée. */
  const fetchMe = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 6_000);
      const res = await fetch(API_CONFIG.getFullUrl('/api/me'), { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return false;
      const me = await res.json();
      setAccess({
        member: !!me.member, role: me.role ?? null, status: me.status ?? null, is_admin: !!me.is_admin,
        can_manage_campaigns: !!me.can_manage_campaigns, read_only: !!me.read_only,
        is_platform_admin: !!me.is_platform_admin, organisations_mode: !!me.organisations_mode,
        organisation: me.organisation ?? null,
        invitations: Array.isArray(me.invitations) ? me.invitations : [],
      });
      if (me.profile) setProfile(me.profile as UserProfile);
      return true;
    } catch {
      return false;
    }
  };

  const fetchProfile = async (userId: string, email?: string): Promise<void> => {
    if (await fetchMe()) return;
    // Backend injoignable : lecture directe de sa propre ligne (droits inconnus → aucun)
    setAccess(NO_ACCESS);
    const withTimeout = (p: Promise<{ data: any }>): Promise<{ data: any }> =>
      Promise.race([p, new Promise<{ data: null }>(r => setTimeout(() => r({ data: null }), 5_000))]);
    try {
      const { data: byId } = await withTimeout(
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
      );

      if (byId) {
        setProfile(byId as UserProfile);
        return;
      }

      // No profile by ID — try email fallback (pre-created profile with different ID)
      if (email) {
        const { data: byEmail } = await withTimeout(
          supabase.from('user_profiles').select('*').eq('email', email).maybeSingle(),
        );
        if (byEmail) {
          setProfile({ ...byEmail, id: userId } as UserProfile);
          return;
        }
      }
    } catch {
      // profile unavailable — continue unauthenticated
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Safety net: if getSession never resolves (Supabase unreachable), unblock the app
    const fallback = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 8_000);

    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled) return;
        clearTimeout(fallback);
        setAccessToken(session?.access_token ?? null);
        setSession(session);
        setUser(session?.user ?? null);
        try {
          if (session?.user) await fetchProfile(session.user.id, session.user.email ?? undefined);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    // Rappel SYNCHRONE : tout appel Supabase (ou au backend) fait ici attendrait le verrou de
    // session tenu pendant ce rappel → blocage. Le travail asynchrone est donc reporté.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setSession(session);
      setUser(session?.user ?? null);
      setTimeout(() => {
        void (async () => {
          try {
            if (session?.user) await fetchProfile(session.user.id, session.user.email ?? undefined);
            else { setProfile(null); setAccess(null); }
          } finally {
            setLoading(false);
          }
        })();
      }, 0);
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
    // Abonnement unique à la session ; fetchProfile n'utilise que des setters (stables)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string, jobTitle?: string, department?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          job_title: jobTitle || null,
          department: department || null,
        },
      },
    });

    // Profile creation is handled server-side by a PostgreSQL trigger on auth.users

    if (!error && data.user && !data.user.email_confirmed_at) {
      return { error: null, needsConfirmation: true };
    }

    return { error: error?.message ?? null, needsConfirmation: false };
  };

  const updateProfile = async (updates: ProfileUpdates) => {
    if (!user) return { error: 'Non authentifié' };
    try {
      const res = await fetch(API_CONFIG.getFullUrl('/api/me'), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
      });
      if (res.ok) {
        setProfile(prev => prev ? { ...prev, ...updates } : prev);
        return { error: null };
      }
      if (res.status !== 404) {
        const err = await res.json().catch(() => ({}));
        return { error: err.detail ?? `Erreur ${res.status}` };
      }
    } catch { /* backend injoignable : écriture directe ci-dessous */ }
    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);
    if (!error) setProfile(prev => prev ? { ...prev, ...updates } : prev);
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setAccessToken(null);
    setProfile(null);
    setAccess(null);
  };

  const refreshAccess = async () => { if (user) await fetchMe(); };

  return (
    <AuthContext.Provider value={{ user, session, profile, access, refreshAccess, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
