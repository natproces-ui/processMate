-- Adds a couple of real photos to existing "Pourquoi Blue Protein" cards, which were
-- text/icon-only until now. Run once in the Supabase SQL Editor.

update public.section_cards
set image_url = '/plante1.png'
where title = 'Testé avant validation';

update public.section_cards
set image_url = '/plante2.png'
where title = 'Agronomes de terrain';
