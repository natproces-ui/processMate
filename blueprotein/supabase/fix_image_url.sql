-- One-off fix: the initial schema seeded image_url with a path that was only
-- correct back when this app lived nested under frontend/src/app/blueprotein.
-- Now that it's a standalone app, the placeholder is served at the site root.
-- Run this once in the Supabase SQL Editor.

alter table public.products alter column image_url set default '/product-placeholder.jpg';

update public.products
set image_url = '/product-placeholder.jpg'
where image_url = '/blueprotein/product-placeholder.jpg';
