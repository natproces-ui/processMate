import { supabase } from './supabase';

export async function getCurrentAdminEmail(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const { data, error } = await supabase
    .from('admins')
    .select('email')
    .eq('email', email)
    .maybeSingle();

  if (error || !data) return null;
  return email;
}

export async function signOut() {
  await supabase.auth.signOut();
}
