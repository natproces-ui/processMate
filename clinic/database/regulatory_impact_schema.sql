-- Supabase schema for ProcessMate regulatory impact analysis.
-- Run this once in Supabase SQL editor before using the backend routes.

create table if not exists public.regulatory_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  source_type text not null default 'text'
    check (source_type in ('text', 'pdf', 'mixed')),
  law_text text not null default '',
  source_filename text,
  source_mime text,
  source_storage_path text,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'analyzing', 'analyzed', 'archived')),
  created_by text not null default 'Utilisateur',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.regulatory_impacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.regulatory_campaigns(id) on delete cascade,
  procedure_id uuid,
  procedure_nom text not null default '',
  procedure_ref text not null default '',
  category text not null default 'Non classe',
  theme text not null,
  regulatory_change text not null default '',
  business_impact text not null default '',
  si_impact text not null default '',
  impacted_systems text[] not null default '{}',
  recommended_actions jsonb not null default '[]'::jsonb,
  external_dependency text,
  criticality text not null default 'medium'
    check (criticality in ('low', 'medium', 'high', 'critical')),
  confidence numeric not null default 0
    check (confidence >= 0 and confidence <= 1),
  law_reference text not null default '',
  procedure_section text not null default '',
  rationale text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'to_review', 'validated', 'rejected', 'converted')),
  source text not null default 'ia',
  reviewer_comment text,
  reviews jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_regulatory_impacts_campaign
  on public.regulatory_impacts(campaign_id);

create index if not exists idx_regulatory_impacts_procedure
  on public.regulatory_impacts(procedure_id);

create index if not exists idx_regulatory_impacts_status
  on public.regulatory_impacts(status);

create index if not exists idx_regulatory_campaigns_status
  on public.regulatory_campaigns(status);
