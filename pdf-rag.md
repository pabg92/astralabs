# PDF & RAG Integration Notes

## Purpose
Scratchpad for decisions, experiments, and quick references while wiring the PDF viewer and clause-to-text linking inside the reconciliation experience.

## Current State (2025-11-25)
- Viewer stack pinned to `react-pdf@7.7.3` + `pdfjs-dist@3.11.174` using CDN worker (`pdf.worker.min.js`).
- Next devtool forced to `source-map` to avoid eval issues with pdf.js (`next.config.mjs`).
- PDF tab stays mounted so zoom/signed URL state persist between Overview/PDF tabs.
- Overview panel now renders real clauses as paragraph blocks with `data-clause-id` hooks; selecting a clause scrolls/highlights the corresponding paragraph.

## Changelog
- **2025-11-25**: Added this file; documented viewer pin + linking plan.

## TODO Ideas
- Investigate grabbing raw contract text from storage/edge function so highlights match exact PDF text instead of clause snippets.
- Consider IntersectionObserver to sync highlighting while scrolling the PDF.
- **2025-11-25 (Later)**: Added clause-aware highlighting on the PDF view by downgrading to react-pdf 7.x/pdfjs 3.x, injecting DOM highlights per clause, and keeping the viewer mounted between tabs. Overview tab linking + PDF overlay now mirror RAG colors.
- **2025-11-26**: PDF highlights now applied via text-layer span search (span text ⊂ clause text). Also removed forced Overview tab switch so PDF stays visible. Awaited route params per Next 15 change.
