export type TestimonialType = 'text' | 'photo' | 'video';

export interface Testimonial {
  id: string;
  type: TestimonialType;
  name: string;
  role: string | null;
  quote: string | null;
  photo_url: string | null;
  video_url: string | null;
  rating: number | null;
  sort_order: number;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export type TestimonialInput = Omit<Testimonial, 'id' | 'created_at' | 'updated_at'>;
