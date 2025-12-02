-- Migration: add_extracted_text column to document_repository
-- Mirrors remote deployment applied on 2025-11-30 (19:40:10 UTC)
alter table document_repository
add column if not exists extracted_text text;

comment on column document_repository.extracted_text is
  'Full OCR/extracted text from PDF/DOCX. Stored exactly as extracted (no normalization).';
