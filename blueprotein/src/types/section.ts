export interface SectionCard {
  id: string;
  section_id: string;
  title: string;
  title_dar: string | null;
  description: string | null;
  description_dar: string | null;
  detail: string | null;
  detail_dar: string | null;
  image_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SectionCardInput = Omit<SectionCard, 'id' | 'section_id' | 'created_at' | 'updated_at'>;

export interface Section {
  id: string;
  slug: string;
  title: string;
  title_dar: string | null;
  subtitle: string | null;
  subtitle_dar: string | null;
  show_numbers: boolean;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export type SectionInput = Omit<Section, 'id' | 'created_at' | 'updated_at'>;

export interface SectionWithCards extends Section {
  cards: SectionCard[];
}
