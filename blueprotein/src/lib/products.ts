import { supabase } from './supabase';
import type { ContactMessage, Product, ProductInput } from '@/types/product';

export async function getPublishedProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('published', true)
    .order('family', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getPublishedProducts', error);
    return [];
  }
  return data as Product[];
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();

  if (error) {
    console.error('getProductBySlug', error);
    return null;
  }
  return data as Product | null;
}

// ── Admin (requires an authenticated session whose email is in public.admins) ──

export async function getAllProductsAdmin(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('family', { ascending: true })
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getAllProductsAdmin', error);
    return [];
  }
  return data as Product[];
}

export async function createProduct(input: ProductInput) {
  return supabase.from('products').insert(input).select().single();
}

export async function updateProduct(id: string, input: Partial<ProductInput>) {
  return supabase.from('products').update(input).eq('id', id).select().single();
}

export async function deleteProduct(id: string) {
  return supabase.from('products').delete().eq('id', id);
}

export async function getContactMessagesAdmin(): Promise<ContactMessage[]> {
  const { data, error } = await supabase
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getContactMessagesAdmin', error);
    return [];
  }
  return data as ContactMessage[];
}

export async function markMessageHandled(id: string, handled: boolean) {
  return supabase.from('contact_messages').update({ handled }).eq('id', id);
}

export async function deleteContactMessage(id: string) {
  return supabase.from('contact_messages').delete().eq('id', id);
}
