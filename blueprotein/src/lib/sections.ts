import { supabase } from './supabase';
import type { Section, SectionCard, SectionCardInput, SectionInput, SectionWithCards } from '@/types/section';

type RawSection = Section & { section_cards: SectionCard[] };

function withCards(rows: RawSection[]): SectionWithCards[] {
  return rows.map((s) => ({ ...s, cards: s.section_cards ?? [] }));
}

export async function getPublishedSections(): Promise<SectionWithCards[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('*, section_cards(*)')
    .eq('published', true)
    .order('sort_order', { ascending: true })
    .order('sort_order', { ascending: true, foreignTable: 'section_cards' });

  if (error) {
    console.error('getPublishedSections', error);
    return [];
  }
  return withCards((data ?? []) as unknown as RawSection[]);
}

export async function getAllSectionsAdmin(): Promise<SectionWithCards[]> {
  const { data, error } = await supabase
    .from('sections')
    .select('*, section_cards(*)')
    .order('sort_order', { ascending: true })
    .order('sort_order', { ascending: true, foreignTable: 'section_cards' });

  if (error) {
    console.error('getAllSectionsAdmin', error);
    return [];
  }
  return withCards((data ?? []) as unknown as RawSection[]);
}

export async function createSection(input: SectionInput) {
  return supabase.from('sections').insert(input).select().single();
}

export async function updateSection(id: string, input: Partial<SectionInput>) {
  return supabase.from('sections').update(input).eq('id', id).select().single();
}

export async function deleteSection(id: string) {
  return supabase.from('sections').delete().eq('id', id);
}

/** Replaces all cards for a section in one go — simpler and safe at this scale (a handful of cards per section) rather than diffing individual row changes. */
export async function replaceSectionCards(sectionId: string, cards: SectionCardInput[]) {
  const del = await supabase.from('section_cards').delete().eq('section_id', sectionId);
  if (del.error) return del;
  if (cards.length === 0) return { error: null };

  const rows = cards.map((c, i) => ({ ...c, section_id: sectionId, sort_order: c.sort_order ?? i * 10 }));
  return supabase.from('section_cards').insert(rows);
}
