-- Adds optional Darija (Moroccan Arabic, Arabizi/Latin script) translations
-- for the marketing-facing product fields. Deliberately NOT added to dosage,
-- conditioning, precautions, advantages, or composition — a mistranslation
-- there carries real agronomic risk, so those stay French-only for now.
-- Run once in the Supabase SQL Editor.

alter table public.products
  add column if not exists name_dar text,
  add column if not exists tagline_dar text,
  add column if not exists summary_dar text,
  add column if not exists description_dar text;
