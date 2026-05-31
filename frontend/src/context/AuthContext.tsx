'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

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

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
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
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string): Promise<void> => {
    try {
      const { data } = await Promise.race([
        supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle(),
        new Promise<{ data: null }>((resolve) =>
          setTimeout(() => resolve({ data: null }), 5_000)
        ),
      ]);
      if (data) setProfile(data as UserProfile);
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
        setSession(session);
        setUser(session?.user ?? null);
        try {
          if (session?.user) await fetchProfile(session.user.id);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      try {
        if (session?.user) await fetchProfile(session.user.id);
        else setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
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
    const { error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id);
    if (!error) setProfile(prev => prev ? { ...prev, ...updates } : prev);
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut, updateProfile }}>
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
