-- Migration: add start_char/end_char columns to clause_boundaries
-- Mirrors remote deployment applied on 2025-11-30 (19:40:21 UTC)
alter table clause_boundaries
add column if not exists start_char integer,
add column if not exists end_char integer;

comment on column clause_boundaries.start_char is
  'Character offset in document_repository.extracted_text where clause begins';
comment on column clause_boundaries.end_char is
  'Character offset in document_repository.extracted_text where clause ends';
