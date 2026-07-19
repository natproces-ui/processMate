import { supabase } from './supabase';

/** Uploads a product image to the public `images` bucket and returns its public URL, or null on failure. */
export async function uploadProductImage(file: File): Promise<string | null> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from('images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('uploadProductImage', error);
    return null;
  }

  const { data } = supabase.storage.from('images').getPublicUrl(path);
  return data.publicUrl;
}
