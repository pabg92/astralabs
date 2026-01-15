"use client"

import { useState, useEffect, useCallback } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Maximize2, ThumbsUp, ThumbsDown, MessageSquare } from "lucide-react"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Configure PDF.js worker for pdfjs-dist 3.x (using legacy build for stability)
// Version 3.11.174 uses .js worker files instead of .mjs
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

type PdfHighlightStatus = "match" | "review" | "issue" | "metadata"

interface HighlightClause {
  id: number
  text: string
  status: PdfHighlightStatus
}

type ClauseAction = "approve" | "reject" | "comment"

interface PDFViewerProps {
  dealId: string
  onError?: (error: Error) => void
  zoomLevel?: "fit" | "page" | 50 | 75 | 100 | 125 | 150 | 200
  onZoomChange?: (zoom: "fit" | "page" | 50 | 75 | 100 | 125 | 150 | 200) => void
  hideToolbarZoom?: boolean // Hide zoom controls when parent toolbar manages zoom
  highlightClauses?: HighlightClause[]
  selectedClauseId?: number | null
  onClauseClick?: (clauseId: number) => void // Called when user clicks a highlighted clause
  onClauseAction?: (clauseId: number, action: ClauseAction) => void // Called when user approves/rejects
}

type ZoomLevel = "fit" | "page" | 50 | 75 | 100 | 125 | 150 | 200

const sanitizeText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .toLowerCase()

export function PDFViewer({
  dealId,
  onError,
  zoomLevel: externalZoom,
  onZoomChange,
  hideToolbarZoom = false,
  highlightClauses,
  selectedClauseId = null,
  onClauseClick,
  onClauseAction,
}: PDFViewerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string>("contract.pdf")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [numPages, setNumPages] = useState<number>(0)
  const [pageNumber, setPageNumber] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)
  const [documentReady, setDocumentReady] = useState(false)

  // Popover state for clause actions
  const [popoverClauseId, setPopoverClauseId] = useState<number | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null)

  // Use external zoom if provided, otherwise use internal state
  const [internalZoom, setInternalZoom] = useState<ZoomLevel>("fit")
  const zoomLevel = externalZoom ?? internalZoom
  const setZoomLevel = onZoomChange ?? setInternalZoom

  // Get clause info for popover
  const popoverClause = popoverClauseId != null
    ? highlightClauses?.find(c => c.id === popoverClauseId)
    : null

  // Handle click on highlighted clause span
  const handleClauseSpanClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    const clauseId = target.dataset?.clauseId
    if (!clauseId) return

    const id = parseInt(clauseId, 10)
    if (isNaN(id)) return

    // Calculate popover position relative to viewport
    const rect = target.getBoundingClientRect()
    setPopoverPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setPopoverClauseId(id)

    // Notify parent of clause selection
    onClauseClick?.(id)

    e.stopPropagation()
  }, [onClauseClick])

  // Close popover when clicking outside
  const handleDocumentClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement
    // Don't close if clicking on the popover itself
    if (target.closest('.pdf-clause-popover')) return
    // Don't close if clicking on a highlighted clause
    if (target.dataset?.clauseId) return
    setPopoverClauseId(null)
    setPopoverPosition(null)
  }, [])

  // Handle clause action (approve/reject/comment)
  const handleAction = useCallback((action: ClauseAction) => {
    if (popoverClauseId != null) {
      onClauseAction?.(popoverClauseId, action)
      // Close popover after action (except comment which might need to stay open)
      if (action !== 'comment') {
        setPopoverClauseId(null)
        setPopoverPosition(null)
      }
    }
  }, [popoverClauseId, onClauseAction])

  // Fetch signed URL on mount
  useEffect(() => {
    const fetchSignedUrl = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/reconciliation/${dealId}/pdf`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to fetch PDF (${response.status})`)
        }

        const data = await response.json()
        setSignedUrl(data.url)
        setFileName(data.filename || "contract.pdf")
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        console.error("PDF fetch error:", error)
        setError(error.message)
        onError?.(error)
      } finally {
        setLoading(false)
      }
    }

    if (dealId) {
      fetchSignedUrl()
    }
  }, [dealId, onError])

  // Measure container width for fit mode
  useEffect(() => {
    const measureWidth = () => {
      const container = document.getElementById("pdf-container")
      if (container) {
        setContainerWidth(container.clientWidth - 40) // Account for padding
      }
    }

    measureWidth()
    window.addEventListener("resize", measureWidth)
    return () => window.removeEventListener("resize", measureWidth)
  }, [])

  useEffect(() => {
    setDocumentReady(false)
  }, [dealId])

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages)
    setPageNumber(1)
    setLoading(false)
    setDocumentReady(true)
  }

  function onDocumentLoadError(error: Error) {
    console.error("PDF load error:", error)
    setError(`Failed to load PDF: ${error.message}`)
    setLoading(false)
    onError?.(error)
  }

  const calculateWidth = (): number => {
    if (zoomLevel === "fit") return containerWidth
    if (zoomLevel === "page") return containerWidth * 0.95
    // Percentage zoom: base width is ~600px at 100%
    return (600 * (zoomLevel as number)) / 100
  }

  const handleZoomIn = () => {
    if (zoomLevel === "fit" || zoomLevel === "page") {
      setZoomLevel(100 as ZoomLevel)
    } else if (zoomLevel < 200) {
      const levels: (number | "fit")[] = [50, 75, 100, 125, 150, 200]
      const currentIndex = levels.indexOf(zoomLevel as number)
      setZoomLevel(levels[currentIndex + 1] as ZoomLevel)
    }
  }

  const handleZoomOut = () => {
    if (zoomLevel === "fit" || zoomLevel === "page") {
      setZoomLevel(50 as ZoomLevel)
    } else if (zoomLevel > 50) {
      const levels: (number | "fit")[] = [50, 75, 100, 125, 150, 200]
      const currentIndex = levels.indexOf(zoomLevel as number)
      setZoomLevel(levels[currentIndex - 1] as ZoomLevel)
    }
  }

  const handlePrevPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1))
  }

  const handleNextPage = () => {
    setPageNumber((prev) => Math.min(numPages, prev + 1))
  }

  const handleFitToWidth = () => {
    setZoomLevel("fit")
  }

  useEffect(() => {
    if (typeof document === "undefined") return
    if (document.getElementById("pdf-highlight-styles")) return
    const style = document.createElement("style")
    style.id = "pdf-highlight-styles"
    style.innerHTML = `
      .pdf-highlight {
        transition: background-color 0.25s ease, box-shadow 0.25s ease;
      }
      .pdf-highlight-match {
        background-color: rgba(200, 250, 204, 0.65);
      }
      .pdf-highlight-review {
        background-color: rgba(252, 239, 195, 0.65);
      }
      .pdf-highlight-issue {
        background-color: rgba(248, 196, 196, 0.65);
      }
      .pdf-highlight-metadata {
        background-color: rgba(148, 163, 184, 0.35);
      }
      .pdf-highlight-active {
        box-shadow: 0 0 0 2px rgba(148, 163, 184, 0.8);
      }
      .pdf-highlight[data-clause-id] {
        cursor: pointer;
      }
      .pdf-highlight[data-clause-id]:hover {
        filter: brightness(0.95);
      }
      .pdf-clause-popover {
        position: fixed;
        z-index: 1000;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 8px;
        display: flex;
        align-items: center;
        gap: 4px;
        transform: translate(-50%, -100%);
      }
      .pdf-clause-popover__btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: background-color 0.15s;
      }
      .pdf-clause-popover__btn--approve {
        background: #dcfce7;
        color: #16a34a;
      }
      .pdf-clause-popover__btn--approve:hover {
        background: #bbf7d0;
      }
      .pdf-clause-popover__btn--reject {
        background: #fee2e2;
        color: #dc2626;
      }
      .pdf-clause-popover__btn--reject:hover {
        background: #fecaca;
      }
      .pdf-clause-popover__btn--comment {
        background: #f1f5f9;
        color: #64748b;
      }
      .pdf-clause-popover__btn--comment:hover {
        background: #e2e8f0;
      }
      .pdf-clause-popover__divider {
        width: 1px;
        height: 20px;
        background: #e2e8f0;
        margin: 0 4px;
      }
      .pdf-clause-popover__status {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: capitalize;
      }
      .pdf-clause-popover__status--match {
        background: #dcfce7;
        color: #16a34a;
      }
      .pdf-clause-popover__status--review {
        background: #fef3c7;
        color: #d97706;
      }
      .pdf-clause-popover__status--issue {
        background: #fee2e2;
        color: #dc2626;
      }
    `
    document.head.appendChild(style)
  }, [])

  useEffect(() => {
    if (!documentReady) return

    const highlightPdf = () => {
      const spans = Array.from(document.querySelectorAll<HTMLElement>(".react-pdf__Page__textContent span"))

      spans.forEach((span) => {
        span.classList.remove(
          "pdf-highlight",
          "pdf-highlight-match",
          "pdf-highlight-review",
          "pdf-highlight-issue",
          "pdf-highlight-metadata",
          "pdf-highlight-active"
        )
        delete span.dataset.clauseId
      })

      if (!highlightClauses || highlightClauses.length === 0) return

      const sanitizedSpans = spans.map((span) => ({
        span,
        text: sanitizeText(span.textContent || ""),
      }))

      highlightClauses.forEach((clause) => {
        const clauseText = sanitizeText(clause.text)
        if (!clauseText) return
        const matchedSpans = sanitizedSpans.filter(({ text }) => text.length >= 6 && clauseText.includes(text))
        if (matchedSpans.length === 0) return

        matchedSpans.forEach(({ span }) => {
          span.classList.add("pdf-highlight", `pdf-highlight-${clause.status}`)
          span.dataset.clauseId = String(clause.id)
        })
      })

      if (selectedClauseId != null) {
        const activeSpan = spans.find((span) => span.dataset.clauseId === String(selectedClauseId))
        if (activeSpan) {
          activeSpan.classList.add("pdf-highlight-active")
          activeSpan.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }
    }

    const timeout = window.setTimeout(highlightPdf, 350)
    return () => window.clearTimeout(timeout)
  }, [documentReady, highlightClauses, selectedClauseId, pageNumber])

  // Keyboard shortcuts (plan-pdf.md §3)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handlePrevPage()
      if (e.key === "ArrowRight") handleNextPage()
      if (e.key === "+" || e.key === "=") handleZoomIn()
      if (e.key === "-" || e.key === "_") handleZoomOut()
      if (e.key === "Escape") {
        setPopoverClauseId(null)
        setPopoverPosition(null)
      }
    }

    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [pageNumber, numPages, zoomLevel])

  // Attach click handlers to highlighted clause spans
  useEffect(() => {
    if (!documentReady) return

    const container = document.getElementById("pdf-container")
    if (!container) return

    // Use event delegation on the container
    container.addEventListener("click", handleClauseSpanClick as EventListener)
    document.addEventListener("click", handleDocumentClick as EventListener)

    return () => {
      container.removeEventListener("click", handleClauseSpanClick as EventListener)
      document.removeEventListener("click", handleDocumentClick as EventListener)
    }
  }, [documentReady, handleClauseSpanClick, handleDocumentClick])

  // Close popover when page changes
  useEffect(() => {
    setPopoverClauseId(null)
    setPopoverPosition(null)
  }, [pageNumber])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600">Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50 p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
          <h3 className="text-red-800 font-semibold mb-2">Failed to Load PDF</h3>
          <p className="text-red-700 text-sm mb-4">{error}</p>
          <p className="text-slate-600 text-sm">
            The document viewer is unavailable. Please use the text export instead.
          </p>
        </div>
      </div>
    )
  }

  if (!signedUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50">
        <p className="text-slate-600">No PDF available</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={pageNumber <= 1}
            className="h-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-slate-600 px-2">
            Page {pageNumber} of {numPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={pageNumber >= numPages}
            className="h-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {!hideToolbarZoom && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoomLevel === 50}
              className="h-8"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-slate-600 min-w-[60px] text-center">
              {typeof zoomLevel === "number" ? `${zoomLevel}%` : "Fit"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoomLevel === 200}
              className="h-8"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitToWidth}
              className="h-8"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        <div className="text-sm text-slate-500 truncate max-w-xs" title={fileName}>
          {fileName}
        </div>
      </div>

      {/* PDF Content */}
      <div
        id="pdf-container"
        className="flex-1 overflow-auto p-4"
      >
        <div className="flex justify-center">
          <Document
            file={signedUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center py-16">
                <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={calculateWidth()}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              className="shadow-lg"
            />
          </Document>
        </div>
      </div>

      {/* Clause Action Popover */}
      {popoverClause && popoverPosition && (
        <div
          className="pdf-clause-popover"
          style={{ left: popoverPosition.x, top: popoverPosition.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="pdf-clause-popover__btn pdf-clause-popover__btn--approve"
            onClick={() => handleAction('approve')}
            title="Approve clause"
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            className="pdf-clause-popover__btn pdf-clause-popover__btn--reject"
            onClick={() => handleAction('reject')}
            title="Flag for review"
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
          <button
            className="pdf-clause-popover__btn pdf-clause-popover__btn--comment"
            onClick={() => handleAction('comment')}
            title="Add comment"
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <div className="pdf-clause-popover__divider" />
          <span className={`pdf-clause-popover__status pdf-clause-popover__status--${popoverClause.status}`}>
            {popoverClause.status === 'match' ? 'approved' : popoverClause.status}
          </span>
        </div>
      )}
    </div>
  )
}
