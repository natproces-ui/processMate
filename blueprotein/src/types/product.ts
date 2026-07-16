export type ProductFamily = 'liquide' | 'solide';

export interface ProductVariant {
  name: string;
  [metric: string]: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  family: ProductFamily;
  category: string;
  tagline: string | null;
  summary: string;
  description: string | null;
  name_dar: string | null;
  tagline_dar: string | null;
  summary_dar: string | null;
  description_dar: string | null;
  dosage: string | null;
  conditioning: string | null;
  precautions: string | null;
  advantages: string[];
  composition_summary: string | null;
  variants: ProductVariant[];
  organic_certified: boolean;
  badge: string | null;
  image_url: string;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export type ProductInput = Omit<Product, 'id' | 'created_at' | 'updated_at'>;

export interface ContactMessage {
  id: string;
  name: string;
  company: string | null;
  email: string;
  message: string;
  audience: string | null;
  handled: boolean;
  created_at: string;
}
