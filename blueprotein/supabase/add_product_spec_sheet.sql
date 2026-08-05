-- Optional downloadable technical data sheet (PDF) per product, uploaded from the admin
-- dashboard. Reuses the existing "images" Storage bucket (already public-read /
-- admin-write) rather than creating a dedicated bucket — the bucket has no MIME-type
-- restriction, so PDFs upload the same way photos do. Run once in the Supabase SQL Editor.

alter table public.products
  add column if not exists spec_sheet_url text;
