-- Blue Protein — schema + RLS + seed
-- Run once in the Blue Protein Supabase project's SQL Editor (dashboard.supabase.com > SQL Editor).
-- This is a separate Supabase project from processMate's own — do not run against that one.

create extension if not exists pgcrypto;

-- ── Admins allowlist ─────────────────────────────────────────────
-- Membership here (matched against the logged-in user's JWT email), not a role flag,
-- controls write access below. Add a second admin later with a single insert.
create table if not exists public.admins (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ── Products ─────────────────────────────────────────────────────
-- One row = one catalog page. Multi-% product families (Blue Humus, Matorg) keep their
-- variants in `variants` jsonb rather than becoming separate rows, matching how the PDF
-- catalog presents them (one page, one table of SKUs).
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  family text not null check (family in ('liquide', 'solide')),
  category text not null,
  tagline text,
  summary text not null,
  description text,
  dosage text,
  conditioning text,
  precautions text,
  advantages text[] not null default '{}',
  composition_summary text,
  variants jsonb not null default '[]'::jsonb,
  organic_certified boolean not null default false,
  badge text,
  image_url text not null default '/product-placeholder.jpg',
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_family_category_idx
  on public.products (family, category, sort_order);

-- ── Contact / prospection leads ─────────────────────────────────
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  company text,
  email text not null,
  message text not null,
  audience text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── updated_at auto-touch ────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ───────────────────────────────────────────
alter table public.products enable row level security;
alter table public.contact_messages enable row level security;
alter table public.admins enable row level security;

-- Public site can read published products
create policy "products_public_read" on public.products
  for select using (published = true);

-- Admins (logged in via Supabase Auth, email present in public.admins) can do everything
create policy "products_admin_all" on public.products
  for all using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  )
  with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- Anyone (including anonymous visitors) can submit the contact form
create policy "contact_messages_public_insert" on public.contact_messages
  for insert with check (true);

-- Only admins can read / mark handled / delete leads
create policy "contact_messages_admin_read" on public.contact_messages
  for select using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "contact_messages_admin_update" on public.contact_messages
  for update using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

create policy "contact_messages_admin_delete" on public.contact_messages
  for delete using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- Admins can see their own allowlist row (needed for the EXISTS checks above to resolve)
create policy "admins_self_read" on public.admins
  for select using (auth.jwt() ->> 'email' = email);

-- ── Seed: the admin account ──────────────────────────────────────
-- Replace with the address you'll actually sign in with if different.
insert into public.admins (email) values ('contact@blueprotein.ma')
  on conflict (email) do nothing;

-- ── Seed: real catalog (Janvier 2025) ────────────────────────────

insert into public.products
  (slug, name, family, category, tagline, summary, description, dosage, conditioning,
   precautions, advantages, composition_summary, variants, organic_certified, badge, sort_order, published)
values

('blue-stimulant', 'Blue Stimulant', 'liquide', 'Biostimulants organiques',
 $$Biostimulant liquide à base de guano d'insectes — pour tous types de cultures$$,
 $$Fertilisant organique à base de guanos d'insectes qui stimule la vie du sol et renforce la résilience des cultures.$$,
 $$Blue Stimulant est un fertilisant organique à base de guanos d'insectes. Il stimule la vie dans les sols, solubilise les nutriments dans le sol et favorise la bonne santé des végétaux et leur résilience face aux changements climatiques. La chitine, naturellement présente dans le frass, renforce la résistance des plantes face aux maladies et aux ravageurs.$$,
 $$Pour toutes les cultures : 50 L/ha par voie radiculaire et 3 L/100 L par voie foliaire. À répéter 3 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac. À mélanger avec de l'eau non chlorée.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 '{}',
 $$Riche en micro-organismes anaérobies présents dans les guanos d'insectes. Contient également en faible quantité des macro-éléments (N, P, K), des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B) et des acides aminés.$$,
 '[]'::jsonb, true, 'Best-seller', 10, true),

('blue-stimulant-gold', 'Blue Stimulant Gold', 'liquide', 'Biostimulants organiques',
 $$Biostimulant liquide très concentré en guano d'insectes — pour tous types de cultures$$,
 $$Version très concentrée de Blue Stimulant, riche en acides aminés, pour une résilience renforcée face aux stress.$$,
 $$Blue Stimulant Gold est un fertilisant organique à base de guanos d'insectes. Très riche en micro-organismes, il stimule la vie dans les sols, solubilise les nutriments dans le sol et favorise la bonne santé des végétaux et leur résilience face aux stress. La chitine, naturellement présente dans le guano d'insectes, renforce la résistance des plantes face aux maladies et aux ravageurs.$$,
 $$Pour toutes les cultures : 5 L/ha par voie radiculaire et 1 L/100 L par voie foliaire. À répéter 3 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac. À mélanger avec de l'eau non chlorée.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 '{}',
 $$Riche en micro-organismes anaérobies. Riche en acides aminés (>0,5 %) : alanine, glycine, histidine, isoleucine, leucine, lysine, méthionine, phénylalanine, proline, sérine, thréonine, taurine, tyrosine, valine. Contient également en faible quantité des macro-éléments (N, P, K) et des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, false, null, 20, true),

('blue-algea', 'Blue Algea', 'liquide', 'Biostimulants organiques',
 $$Fertilisant liquide à base d'algues marines$$,
 $$Extrait d'algues marines riche en acides aminés, pour la germination, l'enracinement et la tolérance au stress.$$,
 $$Blue Algae est un fertilisant à base d'algues marines riche en acides aminés. Grâce à leur teneur en hormones de croissance, les algues sont un atout efficace pour la germination des graines, le bouturage et la transplantation des plants. Blue Algae est un excellent stimulant pour la croissance racinaire et végétale des plantes. Il favorise les microorganismes du sol et permet une meilleure tolérance des plantes à la salinité, la chaleur et la sécheresse.$$,
 $$Pour toutes les cultures : 5 L/ha par voie radiculaire et 1 L/100 L par voie foliaire. À répéter 5 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac. À mélanger avec de l'eau non chlorée.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 '{}',
 $$Riche en acides aminés. Contient également en faible quantité des macro-éléments (N, P, K) et des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, true, null, 30, true),

('blue-fish', 'Blue Fish', 'liquide', 'Biostimulants organiques',
 $$Fertilisant liquide à base de poisson$$,
 $$Hydrolysat de sous-produits de la pêche, préservé à froid, qui nourrit plantes et micro-organismes du sol.$$,
 $$BlueFish est issu de la valorisation à froid de sous-produits de la pêche et de l'aquaculture. Notre technologie permet de préserver la qualité des acides aminés et des nutriments. Blue Fish est un fertilisant liquide aux propriétés biostimulantes qui nourrit les plantes et les micro-organismes du sol. Il améliore la germination des graines et le développement des racines. Les oligo-éléments aident à corriger les carences du sol.$$,
 $$Pour toutes les cultures : 10 L/ha par voie radiculaire. À répéter 3 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac. À mélanger avec de l'eau non chlorée.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 '{}',
 $$N 0,5 % — P2O5 0,2 % — K2O 0,5 % — pH 3 à 4 — acides aminés 1 %. Contient également en faible quantité des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, true, null, 40, true),

('blue-roots', 'Blue Roots', 'liquide', 'Biostimulants organiques',
 $$Fertilisant organique qui favorise le développement des racines$$,
 $$Matière organique, acides aminés et extraits d'algues combinés pour stimuler la croissance racinaire.$$,
 $$Blue Roots est un fertilisant organique qui favorise le développement des racines grâce à sa richesse en matière organique, en acides aminés et en extraits d'algues.$$,
 $$Pour toutes les cultures : 5 à 10 L/ha, à répéter 3 à 5 fois dans le cycle.$$,
 null,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Riche en matière organique : stimule l'activité biologique, améliore l'aération et le développement racinaire$$,
   $$Riche en acides aminés : active la croissance et le métabolisme de la plante, renforce les mécanismes anti-stress$$,
   $$Auxines et cytokinines des extraits d'algues : stimulent la croissance racinaire et l'absorption des nutriments$$,
   $$Stimule l'activité des microorganismes bénéfiques du sol$$,
   $$Améliore la qualité des cultures : teneur en nutriments, saveur, durée de conservation$$
 ]::text[],
 $$Extrait humique 15 %, matière organique 20 %, acides aminés 15 %, extrait d'algues 30 %. Contient également en faible quantité des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, false, null, 50, true),

('blue-fertil-liquide', 'Blue Fertil Liquide', 'liquide', 'Biostimulants organiques',
 $$Biostimulant organique liquide pour tous types de cultures$$,
 $$Restaure l'équilibre microbien du sol pour un environnement favorable à la vie végétale et animale.$$,
 $$BlueFertil Liquide est un biostimulant liquide. Il restaure l'équilibre microbien du sol et fournit ainsi l'environnement indispensable au bon développement de la vie végétale et animale. À appliquer dans les 2 jours suivant la production.$$,
 $$En pulvérisation foliaire ou au sol via le système d'irrigation, à raison de 100 à 500 L/ha. Diluer 1 L de BlueFertil Liquide dans 5 à 20 L d'eau non chlorée.$$,
 $$20 L et vrac.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Récolte plus précoce$$,
   $$Meilleure valeur gustative et nutritionnelle des fruits et légumes$$,
   $$Diminution de l'usage de produits phytosanitaires et fertilisants$$,
   $$Meilleure rétention d'eau, aération et drainage du sol$$,
   $$Meilleure formation d'humus, moins d'érosion et de lessivage$$,
   $$Germination accélérée, enracinement plus dense et plus profond$$,
   $$Meilleure résistance au stress hydrique et aux attaques$$
 ]::text[],
 $$Riche en micro-organismes aérobies présents dans les guanos d'insectes.$$,
 '[]'::jsonb, true, null, 60, true),

('blue-amino-acid-liquid', 'Blue Amino Acid Liquid', 'liquide', 'Amendements organiques',
 $$Amendement organique liquide à base d'acides aminés$$,
 $$Fiche à compléter — produit listé au catalogue, détails à venir.$$,
 null, null, null, null, '{}', null, '[]'::jsonb, false, null, 70, false),

('blue-humus', 'Blue Humus', 'liquide', 'Amendements organiques',
 $$Fertilisant organique riche en extraits humiques — pour tous types de cultures$$,
 $$Gamme d'engrais liquides riches en acide fulvique (15 à 40 %) pour améliorer structure du sol et rendement.$$,
 $$BLUE HUMUS est une série d'engrais organiques liquides riches en acide fulvique. La gamme couvre 15 %, 20 %, 30 % et 40 % d'acide fulvique. L'acide fulvique permet une meilleure utilisation des nutriments du sol, améliore la structure du sol et favorise la séquestration du carbone.$$,
 $$Pour toutes les cultures : 10 L/ha par voie radiculaire, à répéter 3 à 5 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Améliore la disponibilité, la mobilité et l'absorption des micro et macro-éléments par la plante$$,
   $$Améliore la structure et la fertilité du sol (rétention d'eau, formation d'agrégats)$$,
   $$Stimule le développement racinaire$$,
   $$Améliore le rendement des cultures$$
 ]::text[],
 null,
 '[
   {"name":"Blue Humus 15","Acide fulvique":"15%","Matière organique":"20%","Acides aminés":"1.50%"},
   {"name":"Blue Humus 20","Acide fulvique":"20%","Matière organique":"25%","Acides aminés":"2%"},
   {"name":"Blue Humus 30","Acide fulvique":"30%","Matière organique":"40%","Acides aminés":"3%"},
   {"name":"Blue Humus 40","Acide fulvique":"40%","Matière organique":"50%","Acides aminés":"4%"}
 ]'::jsonb,
 false, null, 80, true),

('matorg', 'Matorg', 'liquide', 'Amendements organiques',
 $$Fertilisant organique riche en matière organique$$,
 $$Gamme d'engrais liquides riches en matière organique végétale et animale (20 à 60 %).$$,
 $$MATORG est une série d'engrais organiques liquides riches en matière organique végétale et animale. La gamme couvre 20 %, 30 %, 40 %, 50 % et 60 % de matière organique, un élément important pour améliorer la fertilité du sol et stimuler la croissance des plantes.$$,
 $$Pour toutes les cultures : 10 L/ha par voie radiculaire, 3 à 5 fois dans le cycle.$$,
 $$1/2 L, 1 L, 5 L, 10 L, 20 L, vrac. À mélanger avec de l'eau non chlorée.$$,
 $$Bien agiter avant emploi. Ne pas ingérer, porter des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Amélioration de la croissance de la plante$$,
   $$Meilleure absorption des nutriments minéraux par la plante$$,
   $$Qualité nutritive de la plante améliorée$$
 ]::text[],
 $$Chaque variante contient également des traces de NPK, d'oligo-éléments et d'acides aminés.$$,
 '[
   {"name":"Matorg 20","Matière organique":"20%"},
   {"name":"Matorg 30","Matière organique":"30%"},
   {"name":"Matorg 40","Matière organique":"40%"},
   {"name":"Matorg 50","Matière organique":"50%"},
   {"name":"Matorg 60","Matière organique":"60%"}
 ]'::jsonb,
 false, null, 90, true),

('blue-frass-bsf', 'Blue Frass BSF', 'solide', 'Amendements organiques',
 $$Fertilisant organique à base de guano de larves d'Hermetia Illucens (BSF)$$,
 $$Fertilisant à très haute valeur agronomique, azote directement assimilable via les acides aminés.$$,
 $$BlueFrass BSF est un fertilisant à très haute valeur agronomique. Directement assimilable par les plantes du fait de la biodisponibilité de l'azote dans les acides aminés.$$,
 $$Pour toutes les cultures : 150 kg/ha comme engrais de fond. Une poignée au pied d'un arbre, quelques grammes au pied d'une plante.$$,
 $$1 KG, 5 KG, vrac.$$,
 $$Ne pas ingérer, porter un masque, des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Facilite l'enracinement des plantes$$,
   $$Stimule la croissance des végétaux$$,
   $$Améliore la rétention d'eau et la résistance à la sécheresse$$,
   $$Décuple les propriétés organoleptiques des fruits et légumes$$,
   $$Renforce le système immunitaire des plantes contre nuisibles et pathogènes$$
 ]::text[],
 $$N > 2 %, P2O5 > 2 %, K2O > 1,5 %, matière organique > 65 %, acides aminés > 20 %, acide humique > 3 %, acide fulvique > 37 %, extrait humique total > 40 %. Contient également en faible quantité des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, true, null, 100, true),

('blue-frass-molitor', 'Blue Frass Molitor', 'solide', 'Amendements organiques',
 $$Fertilisant organique à base de guano de ténébrion Molitor$$,
 $$Fertilisant à très haute valeur agronomique, azote directement assimilable via les acides aminés.$$,
 $$BlueFrass Molitor est un fertilisant à très haute valeur agronomique. Directement assimilable par les plantes du fait de la biodisponibilité de l'azote dans les acides aminés.$$,
 $$Pour toutes les cultures : 150 kg/ha comme engrais de fond. Une poignée au pied d'un arbre, quelques grammes au pied d'une plante.$$,
 $$1 KG, 5 KG, vrac.$$,
 $$Ne pas ingérer, porter un masque, des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Facilite l'enracinement des plantes$$,
   $$Stimule la croissance des végétaux$$,
   $$Améliore la rétention d'eau et la résistance à la sécheresse$$,
   $$Décuple les propriétés organoleptiques des fruits et légumes$$,
   $$Renforce le système immunitaire des plantes contre nuisibles et pathogènes$$
 ]::text[],
 $$N > 3,5 %, P2O5 > 1,5 %, K2O > 1,5 %, matière organique > 70 %, acides aminés > 20 %, acide humique > 3 %, acide fulvique > 37 %, extrait humique total > 40 %. Contient également en faible quantité des oligo-éléments (Mg, Cu, Fe, Mn, Zn, B).$$,
 '[]'::jsonb, true, null, 110, true),

('blue-grass-booster', 'Blue Grass Booster', 'solide', 'Amendements organiques',
 $$Fertilisant organique pour les gazons de sport et d'ornement$$,
 $$Azote directement assimilable, pensé pour la germination et la résistance des gazons.$$,
 $$BlueGrass Booster est un fertilisant à très haute valeur agronomique. Directement assimilable par les plantes du fait de la biodisponibilité de l'azote dans les acides aminés.$$,
 $$Entretien gazon : 30 g/m² comme engrais de fond. Nouveau gazon : 50 g/m².$$,
 null,
 $$Ne pas ingérer, porter un masque, des gants et des lunettes de sécurité.$$,
 ARRAY[
   $$Aide à la germination des graines$$,
   $$Facilite l'enracinement des plantes$$,
   $$Stimule la croissance des végétaux$$,
   $$Améliore la rétention d'eau et la résistance à la sécheresse$$,
   $$Renforce le système immunitaire des plantes$$
 ]::text[],
 $$N > 3 %, P2O5 > 5 %, K2O > 4 %, MgO > 0,5 %, CaO > 4 %, acides aminés > 15 %, acide fulvique > 15 %, acide humique total > 40 %. Traces de Mg, Cu, Fe, Mn, Zn, B.$$,
 '[]'::jsonb, false, null, 120, true),

('blue-fertil-solide', 'Blue Fertil Solide', 'solide', 'Amendements organiques',
 $$Fertilisant et amendement organique solide$$,
 $$Fertilisant naturel et durable qui recrée la vie du sol, pour tous types de plantations.$$,
 $$BlueFertil Solide est un fertilisant naturel, biologique et durable. Il nourrit le sol en y recréant la vie. La bonne concentration et la grande diversité des éléments nutritifs dans BlueFertil Solide permettent d'atteindre d'excellents rendements avec des applications modestes. BlueFertil Solide convient à tous types de plantations, en extérieur et en intérieur.$$,
 $$Pour toutes les cultures : au début du cycle, comme fertilisant de fond, 500 kg/ha.$$,
 $$1,5 KG, 5 KG, 25 KG, vrac.$$,
 $$Ne pas ingérer, porter un masque, des gants et des lunettes de sécurité.$$,
 '{}',
 $$Matière organique > 30 %, N > 1 %, P2O5 > 1 %, K2O > 1 %, MgO > 0,8 %, CaO > 3 %, Fe > 0,5 %, pH neutre. Contient également en faible quantité des oligo-éléments (Cu, Mn, Zn, B).$$,
 '[]'::jsonb, true, null, 130, true)

on conflict (slug) do nothing;
