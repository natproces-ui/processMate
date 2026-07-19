-- Admin-editable content sections (cards grids), separate from the products
-- catalog. Lets the admin edit "Pourquoi Blue Protein" / "Notre méthodologie" /
-- "Comment commander" and add brand new sections from the dashboard, without
-- touching code. Run once in the Supabase SQL Editor (after the main schema —
-- this reuses the touch_updated_at() function and admins table from there).

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  title_dar text,
  subtitle text,
  subtitle_dar text,
  show_numbers boolean not null default false,
  sort_order integer not null default 0,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A card with a non-null `detail` becomes clickable on the site (like today's
-- "méthodologie" steps); a card with detail = null just displays as a static
-- info card (like today's "Pourquoi Blue Protein" grid). One shape covers both.
create table if not exists public.section_cards (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  title text not null,
  title_dar text,
  description text,
  description_dar text,
  detail text,
  detail_dar text,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sections_sort_idx on public.sections (sort_order);
create index if not exists section_cards_section_idx on public.section_cards (section_id, sort_order);

drop trigger if exists sections_touch_updated_at on public.sections;
create trigger sections_touch_updated_at
  before update on public.sections
  for each row execute function public.touch_updated_at();

drop trigger if exists section_cards_touch_updated_at on public.section_cards;
create trigger section_cards_touch_updated_at
  before update on public.section_cards
  for each row execute function public.touch_updated_at();

alter table public.sections enable row level security;
alter table public.section_cards enable row level security;

create policy "sections_public_read" on public.sections
  for select using (published = true);

create policy "sections_admin_all" on public.sections
  for all using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  )
  with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- A card is publicly visible only if its parent section is published
create policy "section_cards_public_read" on public.section_cards
  for select using (
    exists (select 1 from public.sections s where s.id = section_id and s.published = true)
  );

create policy "section_cards_admin_all" on public.section_cards
  for all using (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  )
  with check (
    exists (select 1 from public.admins a where a.email = auth.jwt() ->> 'email')
  );

-- ── Seed: migrate the three existing hardcoded sections ──────────────────

with sec as (
  insert into public.sections (slug, title, title_dar, subtitle, subtitle_dar, show_numbers, sort_order, published)
  values (
    'pourquoi',
    'Pourquoi Blue Protein', '3lash Blue Protein',
    $$Une marque pensée pour les professionnels de l'agriculture, du champ à la coopérative.$$,
    $$Marque li khddama l les professionnels dyal la agriculture, mn l7ayt l lcoopérative.$$,
    false, 10, true
  )
  on conflict (slug) do nothing
  returning id
)
insert into public.section_cards (section_id, title, title_dar, description, description_dar, sort_order)
select id, v.title, v.title_dar, v.description, v.description_dar, v.sort_order
from sec, (values
  ($$Testé avant validation$$, $$Mjarreb qbel matban validation$$, $$Chaque formulation est éprouvée en conditions réelles avant sa mise sur le marché.$$, $$Kola formule kat-jarrab fl'ard bnnia9i, qbel matban f sou9.$$, 10),
  ($$Traçabilité complète$$, $$Traçabilité kamla$$, $$Chaque lot est suivi de la production à la livraison, avec fiches techniques disponibles.$$, $$Kola lot mtabba3 mn lproduction 7ta l livraison, m3a fiches techniques.$$, 20),
  ($$Agronomes de terrain$$, $$Agronomes dyal l'ard$$, $$Une équipe locale disponible pour vous accompagner dans le choix des produits.$$, $$Equipe m7alliya mawjouda bach tsa3dek tkhtar les produits.$$, 30),
  ($$Livraison rapide$$, $$Livraison sri3a$$, $$Un réseau logistique au Maroc et en Afrique de l'Ouest, sans intermédiaire.$$, $$Réseau logistique fLmeghrib w Afriqya dyal lwst, bla wassit.$$, 40),
  ($$Prix accessibles$$, $$Taman fdisss$$, $$Une nutrition efficace à prix producteur, pour réduire durablement vos coûts.$$, $$Taghdiya mzyana b taman dyal producteur, bach ynqes taman 3likom 3la tawil.$$, 50),
  ($$Formulations sur mesure$$, $$Formulations 3la ma9as$$, $$Conditionnements et dosages adaptés aux besoins des distributeurs et coopératives.$$, $$Conditionnements w dosages monasibin l distributeurs w coopératives.$$, 60)
) as v(title, title_dar, description, description_dar, sort_order);

with sec as (
  insert into public.sections (slug, title, title_dar, subtitle, subtitle_dar, show_numbers, sort_order, published)
  values (
    'methodologie',
    'Notre méthodologie', 'La méthode dyalna',
    $$Cliquez sur une étape pour voir comment on s'y prend concrètement.$$,
    $$Klik 3la chi étape bach tchouf kifach kandirou fl'wa9i3.$$,
    true, 20, true
  )
  on conflict (slug) do nothing
  returning id
)
insert into public.section_cards (section_id, title, title_dar, description, description_dar, detail, detail_dar, sort_order)
select id, v.title, v.title_dar, v.description, v.description_dar, v.detail, v.detail_dar, v.sort_order
from sec, (values
  ($$Diagnostic terrain$$, $$Diagnostic dyal l'ard$$, $$On part de votre sol, pas d'une fiche produit.$$, $$Kanbdaw men lard dyalek, machi men fiche produit.$$, $$Avant toute recommandation, nous analysons le sol, la culture et les conditions climatiques de votre exploitation, pour identifier ce qui limite réellement le rendement.$$, $$Qbel ma n9oulou chi 7aja, kanhalalou lard, zra3a, w klima dyal l'ard dyalek, bach nchoufou chno rah 7abes rendement bjjihd.$$, 10),
  ($$Formulation adaptée$$, $$Formule monasiba$$, $$Des produits pensés pour le Maroc et l'Afrique, pas importés tels quels.$$, $$Produits mesnou3in l Lmeghrib w Afriqya, machi mjabin men blad okhra.$$, $$Chaque formulation Blue Protein est conçue pour répondre aux besoins précis des cultures et des sols locaux, plutôt qu'adaptée après coup d'un produit pensé pour un autre climat.$$, $$Kola formule dyal Blue Protein mesnou3a bach tjaweb l7ajat dyal zra3a w lard m7alliya, machi produit dyal blad okhra li dartou fih chi ta3dil.$$, 20),
  ($$Test & validation terrain$$, $$Test w validation fl'ard$$, $$Rien n'est commercialisé sans preuve sur le terrain.$$, $$Hta chi produit maykhrojch l sou9 bla dalil fl'ard.$$, $$Chaque produit est testé en conditions réelles, sur des parcelles locales, avant sa mise sur le marché — pas seulement en laboratoire.$$, $$Kola produit kayt-jarreb fwa9i3 7a9i9i, f par9at m7alliya, qbel mayban fsou9 — machi ghi flaboratoire.$$, 30),
  ($$Accompagnement continu$$, $$Mouwakaba mostamirra$$, $$Un suivi agronomique après la vente, pas juste une livraison.$$, $$Suivi agronomique mora lbi3, machi ghi livraison.$$, $$Nos agronomes suivent les résultats dans la durée et ajustent les recommandations selon les cycles de culture et les retours du terrain.$$, $$Agronomes dyalna kaytab3ou nataij 3la tawil w kaybaddlou nasa2i7 3la 7sab dawrat zra3a w rj3 dyal l'ard.$$, 40)
) as v(title, title_dar, description, description_dar, detail, detail_dar, sort_order);

with sec as (
  insert into public.sections (slug, title, title_dar, subtitle, subtitle_dar, show_numbers, sort_order, published)
  values (
    'commander',
    'Comment commander', 'Kifach tcommandi',
    $$Quatre étapes entre votre inscription et la réception de votre commande.$$,
    $$Rba3 étapes bin ma tsajjel w ma toslek commande dyalek.$$,
    true, 30, true
  )
  on conflict (slug) do nothing
  returning id
)
insert into public.section_cards (section_id, title, title_dar, description, description_dar, sort_order)
select id, v.title, v.title_dar, v.description, v.description_dar, v.sort_order
from sec, (values
  ($$Créer un compte$$, $$Dir compte$$, $$Inscription gratuite en 2 minutes, agriculteur ou distributeur.$$, $$Inscription free f 2 minutes, fellah wla distributeur.$$, 10),
  ($$Parcourir le catalogue$$, $$Chouf catalogue$$, $$Filtrez par gamme, catégorie ou objectif agronomique.$$, $$Filtri 3la 7sab gamme, catégorie wla hadaf agronomique.$$, 20),
  ($$Commander en ligne$$, $$Commandi online$$, $$Paiement sécurisé, devis instantané pour les gros volumes.$$, $$Paiement sécurisé, devis fl'wa9t l lkmiyat kbar.$$, 30),
  ($$Livraison & suivi$$, $$Livraison w suivi$$, $$Suivi de commande en temps réel jusqu'à la parcelle.$$, $$Tabe3 commande dyalek fl'wa9t 7a9i9i 7ta l'par9a.$$, 40)
) as v(title, title_dar, description, description_dar, sort_order);
