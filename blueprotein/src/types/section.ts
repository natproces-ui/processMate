export type SectionType = 'clickable_cards' | 'static_cards' | 'icon_list' | 'rich_text';

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
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SectionCardInput = Omit<SectionCard, 'id' | 'section_id' | 'created_at' | 'updated_at'>;

export interface Section {
  id: string;
  slug: string;
  type: SectionType;
  title: string;
  title_dar: string | null;
  subtitle: string | null;
  subtitle_dar: string | null;
  body: string | null;
  body_dar: string | null;
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
