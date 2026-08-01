-- Admin-editable customer testimonials — text, photo, or video. Video is a
-- pasted YouTube/Vimeo link (embedded as an iframe), not an uploaded file:
-- avoids Supabase Storage bandwidth/size costs and gets adaptive streaming
-- for free. Run once in the Supabase SQL Editor.
--
-- Quotes are intentionally single-language (no _dar column): a testimonial
-- is a direct quote from a real person — translating it into a dialect they
-- didn't actually speak would misrepresent them. The admin enters it in
-- whichever language the person actually said it in.

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'text' check (type in ('text', 'photo', 'video')),
  name text not null,
  role text,
  quote text,
  photo_url text,
  video_url text,
  rating integer check (rating between 1 and 5),
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists testimonials_sort_idx on public.testimonials (sort_order);

drop trigger if exists testimonials_touch_updated_at on public.testimonials;
create trigger testimonials_touch_updated_at
  before update on public.testimonials
  for each row execute function public.touch_updated_at();

alter table public.testimonials enable row level security;

create policy "testimonials_public_read" on public.testimonials
  for select using (published = true);

create policy "testimonials_admin_all" on public.testimonials
  for all using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  )
  with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- Seed: migrate the three testimonials that were hardcoded on the site.
insert into public.testimonials (type, name, role, quote, rating, sort_order, published)
values
  ('text', 'Youssef El Amrani', 'Maraîcher, Souss-Massa, Maroc', $$Avec les produits Blue Protein, la structure de nos terres s'est nettement améliorée. Et le coût de nutrition a baissé par rapport à nos anciens engrais.$$, 5, 10, true),
  ('text', 'Moussa Traoré', 'Exploitant, 40 ha — céréales, Burkina Faso', $$Depuis qu'on est passés à Blue Stimulant, la reprise de végétation est nettement plus rapide. Et je commande tout depuis mon téléphone.$$, 5, 20, true),
  ('text', 'Fatou Cissé', 'Coopérative agricole, 12 membres, Burkina Faso', $$Le support agronomique nous a aidés à choisir les bons dosages. Les livraisons sont toujours dans les délais annoncés.$$, 5, 30, true);
