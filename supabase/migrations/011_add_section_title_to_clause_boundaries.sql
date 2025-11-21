-- Migration: 011_add_section_title_to_clause_boundaries.sql
-- Adds section_title column so clause extraction can persist heading metadata

alter table clause_boundaries
  add column if not exists section_title text;

comment on column clause_boundaries.section_title is 'Original contract heading detected for this clause (used for 1:1 validation).';

create index if not exists idx_clause_boundaries_section_title
  on clause_boundaries (section_title);
