import { supabase } from './supabase';
import type { Testimonial, TestimonialInput } from '@/types/testimonial';

export async function getPublishedTestimonials(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .eq('published', true)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getPublishedTestimonials', error);
    return [];
  }
  return data as Testimonial[];
}

export async function getAllTestimonialsAdmin(): Promise<Testimonial[]> {
  const { data, error } = await supabase
    .from('testimonials')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('getAllTestimonialsAdmin', error);
    return [];
  }
  return data as Testimonial[];
}

export async function createTestimonial(input: TestimonialInput) {
  return supabase.from('testimonials').insert(input).select().single();
}

export async function updateTestimonial(id: string, input: Partial<TestimonialInput>) {
  return supabase.from('testimonials').update(input).eq('id', id).select().single();
}

export async function deleteTestimonial(id: string) {
  return supabase.from('testimonials').delete().eq('id', id);
}
