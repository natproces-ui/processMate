-- Adds section "types" (clickable_cards / static_cards / icon_list / rich_text),
-- rich-text body fields for the standalone text-block type, and a curated
-- icon option on cards (alternative to an uploaded photo). Run once, after
-- create_sections.sql.

alter table public.sections
  add column if not exists type text not null default 'static_cards',
  add column if not exists body text,
  add column if not exists body_dar text;

alter table public.sections
  add constraint sections_type_check check (type in ('clickable_cards', 'static_cards', 'icon_list', 'rich_text'));

alter table public.section_cards
  add column if not exists icon text;

-- Backfill the three existing sections with their real type.
update public.sections set type = 'static_cards' where slug = 'pourquoi';
update public.sections set type = 'clickable_cards' where slug = 'methodologie';
update public.sections set type = 'static_cards' where slug = 'commander';
