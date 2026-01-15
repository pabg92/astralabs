"use client"

import type React from "react"

import { useState, useEffect, useRef, Suspense, useMemo, useCallback } from "react"
import dynamic from "next/dynamic"
import confetti from "canvas-confetti"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ZoomIn,
  ZoomOut,
  Eye,
  StickyNote,
  ThumbsUp,
  ThumbsDown,
  Flag,
  RotateCcw,
  SkipForward,
  MessageCircle,
  X,
  Send,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Shield,
  Info,
  Pencil,
  LayoutGrid,
  AlignLeft,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  GitCompare,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import "@/styles/reconciliation.css"
import type { JSX } from "react/jsx-runtime"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { RedlineEditor } from "@/components/redlines/redline-editor"
import { CommentThread } from "@/components/redlines/comment-thread"
import { SuggestedRedlinesModal } from "@/components/redlines/suggested-redlines-modal"
import { ProcessingThoughts } from "@/components/processing-thoughts"
import type { Database } from "@/types/database"

// Phase 9: Lazy-load PDF viewer to avoid SSR bloat (plan-pdf.md §4)
const PDFViewer = dynamic(
  () => import("@/components/pdf-viewer").then((mod) => ({ default: mod.PDFViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-full bg-slate-50">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600">Loading PDF viewer...</p>
      </div>
    ),
  }
)

type ClauseStatus = "match" | "review" | "issue"

// Phase 11: Redlines and comments types
type ClauseRedline = Database["public"]["Tables"]["clause_redlines"]["Row"] & {
  user_profiles?: {
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
}

type ClauseComment = Database["public"]["Tables"]["clause_comments"]["Row"] & {
  user_profiles?: {
    email: string | null
    first_name: string | null
    last_name: string | null
  } | null
}

interface Clause {
  id: number
  clauseBoundaryId?: string // Database ID for API calls
  text: string
  originalText?: string // Preserved when redline is accepted, for audit trail
  status: ClauseStatus
  summary: string
  confidence: number
  position: { start: number; end: number }
  clauseType: string
  riskAccepted?: boolean // Added risk accepted flag
  // Character positions for inline text view
  startChar?: number | null
  endChar?: number | null
  // Phase 10: Additional fields from API for Task C
  similarityScore?: number | null
  ragParsing?: string | null
  ragRisk?: string | null
  matchedTemplate?: {
    id: string
    clause_id: string
    clause_type: string
    standard_text: string
    usage?: string
  } | null
  ragReason?: string | null
  preAgreedComparisons?: {
    term_category?: string
    term_description?: string
    comparison_result?: {
      matches?: boolean
      deviation_severity?: string
      explanation?: string
      key_differences?: string[]
    }
  }[]
}

interface LibraryClause {
  id: string
  title: string
  category: string
  text: string
  usage: string
}

interface PreAgreedTerm {
  id: string
  clauseType: string
  expectedTerm: string
  notes: string
}

const libraryClausesSample: LibraryClause[] = [
  {
    id: "lib-1",
    title: "Standard Scope of Work",
    category: "Scope of Work",
    text: "The Service Provider shall provide [description of services] in accordance with the specifications set forth in Exhibit A. All services shall be performed in a professional and workmanlike manner consistent with industry standards.",
    usage: "Use for defining contractor responsibilities and service delivery standards.",
  },
  {
    id: "lib-2",
    title: "Payment Terms - Milestone Based",
    category: "Payment Terms",
    text: "Client shall pay Service Provider according to the milestone schedule: [X]% upon contract execution, [Y]% upon completion of Phase 1, and [Z]% upon final delivery. Payment terms are Net 30 days from invoice date.",
    usage: "Standard milestone-based payment structure with net payment terms.",
  },
  {
    id: "lib-3",
    title: "Deliverables Acceptance Procedure",
    category: "Deliverables",
    text: "Client shall have [X] business days to review and accept or reject deliverables. Acceptance shall not be unreasonably withheld. Rejected deliverables must be accompanied by specific written feedback.",
    usage: "Establishes clear acceptance criteria and rejection procedures.",
  },
  {
    id: "lib-4",
    title: "Work Made for Hire - IP Assignment",
    category: "Intellectual Property",
    text: "All work product created under this Agreement shall be considered 'work made for hire' under applicable copyright law. To the extent any work does not qualify as work made for hire, Contractor assigns all rights to Client.",
    usage: "Ensures client ownership of all deliverables and work product.",
  },
  {
    id: "lib-5",
    title: "Mutual Confidentiality Obligation",
    category: "Confidentiality",
    text: "Both parties agree to maintain confidentiality of proprietary information for [X] years following termination. Each party shall use the same degree of care to protect Confidential Information as it uses for its own confidential information.",
    usage: "Balanced mutual confidentiality with reasonable care standard.",
  },
  {
    id: "lib-6",
    title: "Service Warranties",
    category: "Warranties",
    text: "Service Provider warrants that services will be performed in a professional manner and deliverables will be free from material defects for [X] days following acceptance.",
    usage: "Standard service quality warranty with defect-free period.",
  },
  {
    id: "lib-7",
    title: "Liability Cap - Fees Paid",
    category: "Liability",
    text: "Except for breaches of confidentiality or IP provisions, total liability under this Agreement is capped at [X]% of fees paid or payable. This limitation does not apply to gross negligence or willful misconduct.",
    usage: "Limits liability exposure while preserving remedies for serious breaches.",
  },
  {
    id: "lib-8",
    title: "Mutual Indemnification",
    category: "Indemnification",
    text: "Each party shall indemnify the other from claims arising from: (i) breach of this Agreement; (ii) negligence or willful misconduct; or (iii) violation of applicable laws. Contractor shall indemnify Client against any third-party claims alleging that the deliverables infringe intellectual property rights.",
    usage: "Balanced mutual indemnification for breaches and misconduct.",
  },
  {
    id: "lib-9",
    title: "Termination for Convenience",
    category: "Termination",
    text: "Either party may terminate this Agreement with [X] days written notice. Upon termination, Client shall pay for all services performed and expenses incurred through the termination date.",
    usage: "Allows flexible termination with pro-rata payment protection.",
  },
  {
    id: "lib-10",
    title: "Arbitration Clause",
    category: "Dispute Resolution",
    text: "Disputes shall first be subject to good faith negotiation. If unresolved within [X] days, disputes shall be submitted to binding arbitration under [Arbitration Rules] in [Location].",
    usage: "Two-tier dispute resolution: negotiation followed by arbitration.",
  },
]

const contractText = `MASTER SERVICES AGREEMENT

This Master Services Agreement ("Agreement") is entered into as of January 15, 2025, by and between TechCorp Solutions Inc., a Delaware corporation with its principal place of business at 123 Innovation Drive, San Francisco, CA 94105 ("Client") and Professional Services LLC, a Delaware limited liability company with its principal place of business at 456 Commerce Street, New York, NY 10001 ("Contractor").

WHEREAS, Client desires to engage Contractor to provide certain professional services; and WHEREAS, Contractor agrees to provide such services subject to the terms and conditions set forth herein.

NOW, THEREFORE, in consideration of the mutual covenants and agreements contained herein, the parties agree as follows:

1. SCOPE OF WORK

The Contractor shall provide software development, consulting, and technical advisory services as detailed in the Statement of Work attached hereto as Exhibit A. The Contractor shall complete all work within 90 days of contract execution, with milestone deliverables due at 30-day intervals. All work shall be performed in accordance with industry best practices and applicable professional standards.

2. PAYMENT TERMS

Client agrees to pay Contractor a total fee of $250,000 for the services rendered under this Agreement. Payment shall be made in three installments: (i) $83,333 upon execution of this Agreement; (ii) $83,333 upon completion of Phase 1 deliverables; and (iii) $83,334 upon final delivery and acceptance. Payment terms are Net 45 days from invoice date. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.

3. DELIVERABLES AND ACCEPTANCE

The Contractor agrees to deliver all specified work products in accordance with the project timeline and quality standards outlined in Exhibit A. Client shall have 15 business days to review and accept or reject deliverables. Acceptance shall not be unreasonably withheld. Any rejected deliverables must be accompanied by specific written feedback, and Contractor shall have 10 business days to cure any deficiencies.

4. INTELLECTUAL PROPERTY RIGHTS

All work product, including but not limited to software code, documentation, designs, and related materials created by Contractor in the performance of services under this Agreement shall be considered "work made for hire" under U.S. copyright law. To the extent any work product does not qualify as work made for hire, Contractor hereby assigns all right, title, and interest in such work product to Client. Contractor retains ownership of any pre-existing intellectual property and grants Client a perpetual, worldwide, non-exclusive license to use such pre-existing materials as incorporated into the deliverables.

5. CONFIDENTIALITY

Both parties agree to maintain confidentiality of all proprietary information shared during the course of this engagement. "Confidential Information" includes, but is not limited to, trade secrets, business plans, technical data, customer lists, and financial information. Each party shall protect Confidential Information with the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care. This obligation shall survive termination of this Agreement for a period of five years.

6. WARRANTIES AND REPRESENTATIONS

Contractor warrants that: (i) it has the right and authority to enter into this Agreement; (ii) the services will be performed in a professional and workmanlike manner; (iii) the deliverables will be free from material defects for a period of 90 days following acceptance; and (iv) the deliverables will not infringe upon any third-party intellectual property rights. Client warrants that it has the authority to enter into this Agreement and will provide timely feedback and necessary resources for Contractor to perform the services.

7. LIMITATION OF LIABILITY

Except for breaches of confidentiality or intellectual property provisions, neither party shall be liable for any indirect, incidental, consequential, or punitive damages arising out of this Agreement. Contractor's total liability under this Agreement is capped at 50% of the total fees paid or payable under this Agreement. This limitation shall not apply to damages arising from gross negligence or willful misconduct.

8. INDEMNIFICATION

Each party agrees to indemnify, defend, and hold harmless the other party from and against any claims, damages, losses, and expenses (including reasonable attorneys' fees) arising out of: (i) breach of this Agreement; (ii) negligence or willful misconduct; or (iii) violation of applicable laws. Contractor shall indemnify Client against any third-party claims alleging that the deliverables infringe intellectual property rights.

9. TERM AND TERMINATION

This Agreement shall commence on the Effective Date and continue until completion of all services, unless earlier terminated as provided herein. Either party may terminate this Agreement with 30 days written notice. Client may terminate immediately for cause upon written notice if Contractor materially breaches this Agreement and fails to cure within 15 days. Upon termination, Client shall pay Contractor for all services performed and expenses incurred through the termination date.

10. DISPUTE RESOLUTION

Any disputes arising under this Agreement shall first be subject to good faith negotiation between the parties' senior executives. If not resolved within 30 days, the dispute shall be submitted to binding arbitration in accordance with the Commercial Arbitration Rules of the American Arbitration Association. The arbitration shall be conducted in San Francisco, California. The prevailing party shall be entitled to recover reasonable attorneys' fees and costs.

11. GENERAL PROVISIONS

This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles. This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements and understandings. No modification shall be effective unless in writing and signed by both parties. If any provision is found unenforceable, the remaining provisions shall remain in full force and effect. Neither party may assign this Agreement without the prior written consent of the other party.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

TECHCORP SOLUTIONS INC.                    PROFESSIONAL SERVICES LLC

By: _________________________              By: _________________________
Name: Sarah Johnson                        Name: Michael Chen
Title: Chief Executive Officer             Title: Managing Director
Date: January 15, 2025                     Date: January 15, 2025`

const calculateClausePosition = (sectionHeader: string, clauseText: string) => {
  const start = contractText.indexOf(sectionHeader)
  if (start === -1) return { start: 0, end: 0 }

  const clauseStart = contractText.indexOf(clauseText, start)
  if (clauseStart === -1) return { start, end: start + sectionHeader.length }

  const end = clauseStart + clauseText.length
  return { start, end }
}

// Fun loading messages for gamification
const funLoadingMessages = [
  "Summoning the legal gremlins...",
  "Teaching AI to read lawyer...",
  "Counting semicolons in the fine print...",
  "Asking the contract nicely to cooperate...",
  "Translating legalese to human...",
  "Checking for hidden unicorn clauses...",
  "Making sure no one signed in invisible ink...",
  "Waking up the clause fairies...",
  "Convincing the paperwork to behave...",
  "Giving the fine print a magnifying glass...",
  "Brewing a fresh pot of legal tea...",
  "Politely asking the contract to reveal its secrets...",
]

function ReconciliationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dealId = searchParams.get("dealId")
  const resumeAtClauseId = searchParams.get("resumeAt") // Resume at specific clause
  const { toast } = useToast()

  // State for clauses loaded from API
  const [clauses, setClauses] = useState<Clause[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [documentProcessing, setDocumentProcessing] = useState(false) // Document still being processed by worker
  const [processingFailed, setProcessingFailed] = useState<string | null>(null) // Document processing failed with error
  const [isStillProcessing, setIsStillProcessing] = useState(false) // P1 reconciliation still running (show banner, continue polling)
  const [forceRefetchCounter, setForceRefetchCounter] = useState(0) // Trigger refetch when animation completes
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0) // Fun loading message rotation
  const [exportingText, setExportingText] = useState(false)
  const [exportingJSON, setExportingJSON] = useState(false)
  const [hasPdf, setHasPdf] = useState(false) // Phase 9: Track PDF availability

  // Inline text view state
  const [overviewViewMode, setOverviewViewMode] = useState<"cards" | "inline">("cards")
  const [extractedText, setExtractedText] = useState<string | null>(null)
  const [hoveredClauseId, setHoveredClauseId] = useState<number | null>(null)
  const [popoverPosition, setPopoverPosition] = useState<{ x: number; y: number } | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const [selectedClause, setSelectedClause] = useState<Clause | null>(null)
  const [activeFilter, setActiveFilter] = useState<ClauseStatus | "all">("all")
  const [showHighlights, setShowHighlights] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "pdf">("overview") // Changed initial state to "overview"
  const [rightTab, setRightTab] = useState<"review" | "comments" | "library" | "terms">("review")
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(true) // Start collapsed - slide out on demand
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [pdfZoom, setPdfZoom] = useState<"fit" | "page" | 50 | 75 | 100 | 125 | 150 | 200>("fit") // Phase 9: Shared zoom state
  const [clauseStatuses, setClauseStatuses] = useState<Record<number, ClauseStatus>>({})
  const [clauseNotes, setClauseNotes] = useState<Record<number, string>>({})
  const [currentNote, setCurrentNote] = useState<string>("")
  const [noteSaved, setNoteSaved] = useState(false)
  const [showSummary, setShowSummary] = useState(true) // Added toggle for AI summary
  const [riskAcceptedClauses, setRiskAcceptedClauses] = useState<Set<number>>(new Set()) // Track risk accepted clauses

  // State for pre-agreed terms and contract file name
  const [preAgreedTerms, setPreAgreedTerms] = useState<PreAgreedTerm[]>([])
  const [contractFileName, setContractFileName] = useState<string>("")

  const [chatBuddyVisible, setChatBuddyVisible] = useState(true)
  const [infoClauseId, setInfoClauseId] = useState<number | null>(null)
  const [chatBuddyPosition, setChatBuddyPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const chatBuddyRef = useRef<HTMLDivElement>(null)

  const [chatWindowOpen, setChatWindowOpen] = useState(false)
  const [chatWindowPosition, setChatWindowPosition] = useState({ x: 0, y: 0 })
  const [isChatDragging, setIsChatDragging] = useState(false)
  const [chatDragOffset, setChatDragOffset] = useState({ x: 0, y: 0 })

  // Phase 11: Redlines and comments state (mapped by clause_boundary_id)
  const [redlinesByClause, setRedlinesByClause] = useState<Record<string, ClauseRedline[]>>({})
  const [commentsByClause, setCommentsByClause] = useState<Record<string, ClauseComment[]>>({})
  const [redlinesLoading, setRedlinesLoading] = useState(false)
  const [redlinesError, setRedlinesError] = useState<string | null>(null)
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [redlineModalOpen, setRedlineModalOpen] = useState(false)
  const [redlineModalClause, setRedlineModalClause] = useState<Clause | null>(null)

  // Suggested redlines modal state
  const [suggestedRedlinesModalOpen, setSuggestedRedlinesModalOpen] = useState(false)
  const [isAcceptingRedline, setIsAcceptingRedline] = useState(false)
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false)
  const chatWindowRef = useRef<HTMLDivElement>(null)

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()

  // Fun loading message rotation
  useEffect(() => {
    if (loading && !documentProcessing) {
      const interval = setInterval(() => {
        setLoadingMessageIndex(prev => (prev + 1) % funLoadingMessages.length)
      }, 2500)
      return () => clearInterval(interval)
    }
  }, [loading, documentProcessing])

  // Green confetti bursts during loading
  useEffect(() => {
    if (loading && !documentProcessing) {
      // Initial burst
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
      })

      // Periodic bursts
      const confettiInterval = setInterval(() => {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.7 },
          colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
          gravity: 0.8,
          scalar: 0.8,
        })
      }, 4000)

      return () => clearInterval(confettiInterval)
    }
  }, [loading, documentProcessing])

  // Fetch reconciliation data from API with polling for processing documents
  useEffect(() => {
    let pollInterval: NodeJS.Timeout | null = null
    let mounted = true

    const fetchReconciliationData = async (isPolling = false) => {
      // If no dealId, show error
      if (!dealId) {
        setLoadError("No deal ID provided. Please select a deal to review.")
        setLoading(false)
        return
      }

      try {
        if (!isPolling) {
          setLoading(true)
          setLoadError(null)
        }

        const response = await fetch(`/api/reconciliation/${dealId}`)

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`)
        }

        const result = await response.json()

        if (!result.success || !result.data) {
          throw new Error(result.error || "Failed to load reconciliation data")
        }

        const apiData = result.data

        // Map API data to component state
        // Map clause_boundaries to Clause interface
        const apiClauses: Clause[] =
          apiData.document?.clause_boundaries?.map((boundary: any, index: number) => {
            const matchResult = boundary.match_result || {}
            const gptAnalysis = matchResult.gpt_analysis || {}
            const preAgreedComparisons = gptAnalysis.pre_agreed_comparisons || []
            const ragReason =
              preAgreedComparisons.find((comp: any) => comp?.comparison_result?.explanation)?.comparison_result
                ?.explanation || gptAnalysis.reason || null

            // Check if there's a persisted review that overrides the RAG status
            const review = boundary.review

            // GREEN clauses are auto-approved: check all RAG status fields
            const isGreen = matchResult.rag_status === 'green' ||
                           matchResult.rag_parsing === 'green' ||
                           matchResult.rag_risk === 'green'

            let effectiveStatus: ClauseStatus = isGreen ? "match" : mapRAGStatusToClauseStatus(matchResult.rag_status)

            // User review decisions override auto-approval
            if (review?.decision === "approved") {
              effectiveStatus = "match"
            } else if (review?.decision === "rejected" || review?.decision === "flagged") {
              effectiveStatus = "issue"
            }

            return {
              id: index + 1,
              clauseBoundaryId: boundary.id,
              text: boundary.content || "",
              status: effectiveStatus,
              riskAccepted: review?.risk_accepted ?? false,
              summary: ragReason || boundary.library_clause?.standard_text || "No template match",
              confidence: boundary.confidence || 0,
              position: {
                start: boundary.start_page || 0,
                end: boundary.end_page || 0,
              },
              clauseType: boundary.clause_type || "Unknown",
              // Character positions for inline text view
              startChar: boundary.start_char ?? null,
              endChar: boundary.end_char ?? null,
              similarityScore: matchResult.similarity_score || null,
              ragParsing: matchResult.rag_parsing || null,
              ragRisk: matchResult.rag_risk || null,
              matchedTemplate: boundary.library_clause
                ? {
                    id: boundary.library_clause.id,
                    clause_id: boundary.library_clause.clause_id,
                    clause_type: boundary.library_clause.clause_type,
                    standard_text: boundary.library_clause.standard_text,
                    usage: boundary.library_clause.usage,
                  }
                : null,
              ragReason,
              preAgreedComparisons,
            }
          }) || []

        // Check if document is still processing
        const docStatus = apiData.document?.processing_status
        const isProcessing = docStatus === 'pending' || docStatus === 'processing'
        const isFailed = docStatus === 'failed'
        const isCompleted = docStatus === 'completed'
        const hasNoClauses = apiClauses.length === 0

        if (!mounted) return

        // Track if P1 reconciliation is still running (for banner + continued polling)
        setIsStillProcessing(isProcessing)

        // Handle failed processing status
        if (isFailed) {
          const errorMessage = apiData.document?.processing_error || "Contract processing failed. Please try re-uploading the document."
          setProcessingFailed(errorMessage)
          setDocumentProcessing(false)
          setIsStillProcessing(false)
          setLoading(false)
          // Stop polling
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
          return
        }

        // Set clauses and select first one (or resumeAt clause if specified)
        if (apiClauses.length > 0) {
          setClauses(apiClauses)
          // Only set selected clause if none selected (preserve user selection during polling)
          setSelectedClause(prev => {
            if (prev) return prev // Preserve user selection
            // Check for resumeAt param
            if (resumeAtClauseId) {
              const resumeClause = apiClauses.find((c: Clause) => String(c.id) === resumeAtClauseId)
              if (resumeClause) return resumeClause
            }
            return apiClauses[0]
          })

          // Initialize clause statuses and risk-accepted from loaded data
          const initialStatuses: Record<number, ClauseStatus> = {}
          const initialRiskAccepted = new Set<number>()
          apiClauses.forEach((clause: Clause) => {
            initialStatuses[clause.id] = clause.status
            if (clause.riskAccepted) {
              initialRiskAccepted.add(clause.id)
            }
          })
          setClauseStatuses(initialStatuses)
          setRiskAcceptedClauses(initialRiskAccepted)

          // Hide processing animation once clauses are loaded
          setDocumentProcessing(false)

          // Only stop polling when processing is COMPLETED (not just when clauses exist)
          if (isCompleted) {
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
          } else if (isProcessing && !pollInterval && !isPolling) {
            // Continue polling for RAG status updates while still processing
            console.log("Clauses loaded but still processing, continuing poll for RAG updates...")
            pollInterval = setInterval(() => {
              fetchReconciliationData(true)
            }, 3000) // Poll every 3 seconds for faster updates
          }
        } else if (isProcessing || hasNoClauses) {
          // Document is still processing or has no clauses yet
          setDocumentProcessing(true)
          setClauses([])

          // Start polling if not already polling
          if (!pollInterval && !isPolling) {
            console.log("Document still processing, starting poll...")
            pollInterval = setInterval(() => {
              fetchReconciliationData(true)
            }, 5000) // Poll every 5 seconds
          }
        }

        // Set pre-agreed terms
        if (apiData.pre_agreed_terms && apiData.pre_agreed_terms.length > 0) {
          const mappedTerms = apiData.pre_agreed_terms.map((term: any) => ({
            id: term.id,
            clauseType: term.term_category,
            expectedTerm: term.term_description,
            notes: term.expected_value || "",
          }))
          setPreAgreedTerms(mappedTerms)
        }

        // Set contract file name
        if (apiData.document?.original_filename) {
          setContractFileName(apiData.document.original_filename)
        }

        // Phase 9: Check if PDF is available (plan-pdf.md §2)
        if (apiData.document?.has_pdf) {
          setHasPdf(true)
        }

        // Store extracted text for inline view
        if (apiData.document?.extracted_text) {
          setExtractedText(apiData.document.extracted_text)
        }

        // Phase 11: Store tenant_id for redlines/comments
        // tenant_id is at root level of response (spread from deal)
        if (apiData.tenant_id) {
          setTenantId(apiData.tenant_id)
        }

        setLoading(false)
      } catch (error) {
        if (!mounted) return
        console.error("Error loading reconciliation data:", error)
        setLoadError(error instanceof Error ? error.message : "Failed to load data")
        setDocumentProcessing(false)
        setLoading(false)
      }
    }

    fetchReconciliationData()

    // Cleanup polling on unmount
    return () => {
      mounted = false
      if (pollInterval) {
        clearInterval(pollInterval)
      }
    }
  }, [dealId, forceRefetchCounter])

  // Phase 11: Fetch redlines and comments
  useEffect(() => {
    const fetchRedlinesAndComments = async () => {
      if (!dealId) {
        // No dealId, skip fetching
        return
      }

      try {
        setRedlinesLoading(true)
        setRedlinesError(null)

        const response = await fetch(`/api/reconciliation/${dealId}/redlines`)

        if (!response.ok) {
          throw new Error(`Failed to fetch redlines: ${response.statusText}`)
        }

        const result = await response.json()

        if (result.success && result.data) {
          // Group redlines by clause_boundary_id
          const redlinesMap: Record<string, ClauseRedline[]> = {}
          result.data.redlines.forEach((redline: ClauseRedline) => {
            const clauseId = redline.clause_boundary_id
            if (!redlinesMap[clauseId]) {
              redlinesMap[clauseId] = []
            }
            redlinesMap[clauseId].push(redline)
          })
          setRedlinesByClause(redlinesMap)

          // Group comments by clause_boundary_id
          const commentsMap: Record<string, ClauseComment[]> = {}
          result.data.comments.forEach((comment: ClauseComment) => {
            const clauseId = comment.clause_boundary_id
            if (!commentsMap[clauseId]) {
              commentsMap[clauseId] = []
            }
            commentsMap[clauseId].push(comment)
          })
          setCommentsByClause(commentsMap)
        }

        setRedlinesLoading(false)
      } catch (error) {
        console.error("Error fetching redlines and comments:", error)
        setRedlinesError(error instanceof Error ? error.message : "Failed to load redlines")
        setRedlinesLoading(false)
      }
    }

    fetchRedlinesAndComments()
  }, [dealId])

  // Helper function to map RAG status to clause status
  function mapRAGStatusToClauseStatus(ragStatus: string | undefined): ClauseStatus {
    switch (ragStatus) {
      case "green":
        return "match"
      case "amber":
        return "review"
      case "red":
        return "issue"
      default:
        return "review" // Default to review for unknown/blue status
    }
  }

  useEffect(() => {
    if (!selectedClause) return

    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // Set new timeout for auto-save (2 seconds after user stops typing)
    autoSaveTimeoutRef.current = setTimeout(() => {
      if (currentNote !== (clauseNotes[selectedClause.id] || "")) {
        setClauseNotes((prev) => ({
          ...prev,
          [selectedClause.id]: currentNote,
        }))
        setNoteSaved(true)
        setTimeout(() => setNoteSaved(false), 2000)
      }
    }, 2000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [currentNote, selectedClause, clauseNotes])

  // Load chat buddy preferences from localStorage
  useEffect(() => {
    const savedVisible = localStorage.getItem("chatBuddyVisible")
    const savedPosition = localStorage.getItem("chatBuddyPosition")

    if (savedVisible !== null) {
      setChatBuddyVisible(savedVisible === "true")
    }

    if (savedPosition) {
      setChatBuddyPosition(JSON.parse(savedPosition))
    } else {
      // Default position: bottom-right corner
      setChatBuddyPosition({ x: window.innerWidth - 100, y: window.innerHeight - 100 })
    }
  }, [])

  // Save chat buddy preferences to localStorage
  useEffect(() => {
    localStorage.setItem("chatBuddyVisible", chatBuddyVisible.toString())
    localStorage.setItem("chatBuddyPosition", JSON.stringify(chatBuddyPosition))
  }, [chatBuddyVisible, chatBuddyPosition])

  // Phase 11: Handle redline save
  const handleRedlineSave = (redline: ClauseRedline | null, comment?: ClauseComment | null) => {
    // Update local state to reflect the new redline
    if (redline) {
      const clauseId = redline.clause_boundary_id
      setRedlinesByClause((prev) => {
        const existing = prev[clauseId] || []
        const index = existing.findIndex((r) => r.id === redline.id)
        if (index >= 0) {
          const updated = [...existing]
          updated[index] = redline
          return { ...prev, [clauseId]: updated }
        } else {
          return { ...prev, [clauseId]: [...existing, redline] }
        }
      })
    }

    // Flag clause for review when redline saved
    if (redline && redlineModalClause) {
      setClauseStatuses((prev) => ({
        ...prev,
        [redlineModalClause.id]: "issue",
      }))
    }

    if (comment && comment.clause_boundary_id) {
      const clauseId = comment.clause_boundary_id
      setCommentsByClause((prev) => {
        const existing = prev[clauseId] || []
        return { ...prev, [clauseId]: [comment, ...existing] }
      })
      // clear draft if present
      setCommentDrafts((prev) => ({ ...prev, [clauseId]: "" }))
    }

    toast({
      title: "Redline Saved",
      description: "Your suggested change has been saved successfully",
    })

    // Close modal on save if open
    if (redlineModalOpen) {
      setRedlineModalOpen(false)
      setRedlineModalClause(null)
    }
  }

  // Phase 11: Handle redline/comment error
  const handleRedlineError = (error: string) => {
    toast({
      title: "Error",
      description: error,
      variant: "destructive",
    })
  }

  // Handle accepting a redline (marks resolved + approves clause)
  const handleAcceptRedline = async (redlineId: string) => {
    if (!dealId || !selectedClause) return

    setIsAcceptingRedline(true)
    try {
      // 1. Mark redline as resolved
      const response = await fetch(
        `/api/reconciliation/${dealId}/redlines/${redlineId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || "Failed to resolve redline")
      }

      // 2. Update local redline state
      const clauseBoundaryId = selectedClause.clauseBoundaryId
      if (clauseBoundaryId) {
        setRedlinesByClause((prev) => {
          const existing = prev[clauseBoundaryId] || []
          return {
            ...prev,
            [clauseBoundaryId]: existing.map((r) =>
              r.id === redlineId
                ? { ...r, status: "resolved" as const, resolved_at: new Date().toISOString() }
                : r
            ),
          }
        })

        // 2b. Update clause text to show accepted proposed_text
        const acceptedRedline = redlinesByClause[clauseBoundaryId]?.find(r => r.id === redlineId)
        if (acceptedRedline?.proposed_text) {
          setClauses(prev => prev.map(c =>
            c.clauseBoundaryId === clauseBoundaryId
              ? {
                  ...c,
                  originalText: c.originalText || c.text, // Preserve original only if not already set
                  text: acceptedRedline.proposed_text,
                }
              : c
          ))
        }
      }

      // 3. Approve the clause
      setClauseStatuses((prev) => ({
        ...prev,
        [selectedClause.id]: "match",
      }))
      await saveClauseReview(selectedClause, "approved", false)

      // 4. Close modal and show success
      setSuggestedRedlinesModalOpen(false)
      toast({
        title: "Changes Accepted",
        description: "Redline resolved and clause approved",
      })

      // 5. Move to next clause
      setTimeout(() => {
        const currentIndex = filteredClauses.findIndex((c) => c.id === selectedClause.id)
        if (currentIndex < filteredClauses.length - 1) {
          handleClauseSelect(filteredClauses[currentIndex + 1])
        }
      }, 300)
    } catch (error) {
      console.error("Error accepting redline:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to accept changes",
        variant: "destructive",
      })
    } finally {
      setIsAcceptingRedline(false)
    }
  }

  // Generate AI suggestion for a clause
  const handleGenerateSuggestion = async () => {
    if (!dealId || !selectedClause?.clauseBoundaryId) return

    const matchingTerm = findMatchingTerm(selectedClause)

    setIsGeneratingSuggestion(true)
    try {
      const response = await fetch(
        `/api/reconciliation/${dealId}/redlines/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clause_boundary_id: selectedClause.clauseBoundaryId,
            clause_text: selectedClause.text,
            term_description: matchingTerm?.expectedTerm,
            expected_value: matchingTerm?.expectedTerm,
            term_category: matchingTerm?.clauseType,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate suggestion")
      }

      if (data.success && data.data) {
        // Add the generated redline to local state
        const clauseBoundaryId = selectedClause.clauseBoundaryId
        setRedlinesByClause((prev) => {
          const existing = prev[clauseBoundaryId] || []
          return { ...prev, [clauseBoundaryId]: [...existing, data.data] }
        })

        toast({
          title: "Suggestion Generated",
          description: "AI has proposed a redline for this clause",
        })

        // Open the modal to show the suggestion
        setSuggestedRedlinesModalOpen(true)
      }
    } catch (error) {
      console.error("Error generating suggestion:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate suggestion",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingSuggestion(false)
    }
  }

  // State to track which clause is generating (for cards view)
  const [generatingClauseId, setGeneratingClauseId] = useState<string | null>(null)

  // Generate AI suggestion for a specific clause (used in cards view)
  const handleGenerateSuggestionForClause = async (clause: Clause) => {
    console.log("[AI Suggest] Button clicked for clause:", clause.id, clause.clauseType)
    console.log("[AI Suggest] dealId:", dealId, "clauseBoundaryId:", clause.clauseBoundaryId)

    if (!dealId || !clause.clauseBoundaryId) {
      console.warn("[AI Suggest] Early return - missing dealId or clauseBoundaryId")
      return
    }

    const matchingTerm = findMatchingTerm(clause)
    console.log("[AI Suggest] Matching term:", matchingTerm)

    setGeneratingClauseId(clause.id)
    try {
      console.log("[AI Suggest] Making API call to /api/reconciliation/" + dealId + "/redlines/generate")
      const response = await fetch(
        `/api/reconciliation/${dealId}/redlines/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clause_boundary_id: clause.clauseBoundaryId,
            clause_text: clause.text,
            term_description: matchingTerm?.expectedTerm,
            expected_value: matchingTerm?.expectedTerm,
            term_category: matchingTerm?.clauseType,
          }),
        }
      )

      console.log("[AI Suggest] Response status:", response.status)
      const data = await response.json()
      console.log("[AI Suggest] Response data:", data)

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate suggestion")
      }

      if (data.success && data.data) {
        console.log("[AI Suggest] Success! Opening modal...")
        // Add the generated redline to local state
        const clauseBoundaryId = clause.clauseBoundaryId
        setRedlinesByClause((prev) => {
          const existing = prev[clauseBoundaryId] || []
          return { ...prev, [clauseBoundaryId]: [...existing, data.data] }
        })

        toast({
          title: "Suggestion Generated",
          description: "AI has proposed a redline for this clause",
        })

        // Select the clause and open the modal
        handleClauseSelect(clause)
        setSuggestedRedlinesModalOpen(true)
      }
    } catch (error) {
      console.error("Error generating suggestion:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate suggestion",
        variant: "destructive",
      })
    } finally {
      setGeneratingClauseId(null)
    }
  }

  const handleAddComment = async (clauseBoundaryId: string) => {
    if (!dealId) return
    const draft = commentDrafts[clauseBoundaryId]?.trim()
    if (!draft) return

    try {
      const response = await fetch(`/api/reconciliation/${dealId}/redlines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clause_boundary_id: clauseBoundaryId,
          comment_text: draft,
          author_id: null,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Failed to post comment")
      }

      if (data.success && data.data?.comment) {
        const comment: ClauseComment = data.data.comment
        setCommentsByClause((prev) => {
          const existing = prev[clauseBoundaryId] || []
          return { ...prev, [clauseBoundaryId]: [comment, ...existing] }
        })
        setCommentDrafts((prev) => ({ ...prev, [clauseBoundaryId]: "" }))
        toast({
          title: "Comment added",
          description: "Your comment has been posted",
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to post comment"
      handleRedlineError(message)
    }
  }

  // Handle drag start
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!chatBuddyRef.current) return
    setIsDragging(true)
    const rect = chatBuddyRef.current.getBoundingClientRect()
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  // Handle dragging
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return

      const newX = e.clientX - dragOffset.x
      const newY = e.clientY - dragOffset.y

      // Keep within viewport bounds
      const maxX = window.innerWidth - 60
      const maxY = window.innerHeight - 60

      setChatBuddyPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, dragOffset])

  const handleDismissChatBuddy = () => {
    setChatBuddyVisible(false)
  }

  const handleCompleteReview = () => {
    // Note: clauseStatuses are now persisted to database via clause_reviews table
    // Only save notes to localStorage (consider migrating to database comments in future)
    localStorage.setItem("clauseNotes", JSON.stringify(clauseNotes))
    router.push(`/reconciliation/complete?dealId=${dealId}`)
  }

  const selectedClauseKey = selectedClause?.clauseBoundaryId
  const selectedClauseRedlines =
    selectedClauseKey && redlinesByClause[selectedClauseKey] ? redlinesByClause[selectedClauseKey] : []
  const existingRedlineForSelected = selectedClauseRedlines[0] || null
  const selectedClauseComments =
    selectedClauseKey && commentsByClause[selectedClauseKey] ? commentsByClause[selectedClauseKey] : []
  // Allow redline UI when dealId is present; tenant is derived server-side
  const canEditSelectedRedline = Boolean(dealId && selectedClauseKey)

  // Modal state helpers
  const modalClauseKey = redlineModalClause?.clauseBoundaryId
  const modalRedlines = modalClauseKey && redlinesByClause[modalClauseKey] ? redlinesByClause[modalClauseKey] : []
  const modalComments = modalClauseKey && commentsByClause[modalClauseKey] ? commentsByClause[modalClauseKey] : []
  const modalCommentDraft = modalClauseKey ? commentDrafts[modalClauseKey] || "" : ""

  // Export handlers
  const handleExportText = async () => {
    if (!dealId) {
      toast({
        title: "Export Error",
        description: "No deal ID available for export",
        variant: "destructive",
      })
      return
    }

    try {
      setExportingText(true)
      const response = await fetch(`/api/reconciliation/${dealId}/export?format=text`)

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reconciliation-${dealId}-${new Date().toISOString().split('T')[0]}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Export Successful",
        description: "Text report downloaded successfully",
      })
    } catch (error) {
      console.error("Export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export report. Please try again.",
        variant: "destructive",
      })
    } finally {
      setExportingText(false)
    }
  }

  const handleExportJSON = async () => {
    if (!dealId) {
      toast({
        title: "Export Error",
        description: "No deal ID available for export",
        variant: "destructive",
      })
      return
    }

    try {
      setExportingJSON(true)
      const response = await fetch(`/api/reconciliation/${dealId}/export?format=json`)

      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`)
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reconciliation-${dealId}-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast({
        title: "Export Successful",
        description: "JSON data downloaded successfully",
      })
    } catch (error) {
      console.error("Export error:", error)
      toast({
        title: "Export Failed",
        description: "Failed to export JSON. Please try again.",
        variant: "destructive",
      })
    } finally {
      setExportingJSON(false)
    }
  }

  // PDF Zoom handlers (Phase 9: Wire toolbar to PDF viewer)
  const handlePdfZoomIn = () => {
    if (pdfZoom === "fit" || pdfZoom === "page") {
      setPdfZoom(100)
    } else if (pdfZoom < 200) {
      const levels: (number | "fit")[] = [50, 75, 100, 125, 150, 200]
      const currentIndex = levels.indexOf(pdfZoom as number)
      setPdfZoom(levels[currentIndex + 1] as number)
    }
  }

  const handlePdfZoomOut = () => {
    if (pdfZoom === "fit" || pdfZoom === "page") {
      setPdfZoom(50)
    } else if (pdfZoom > 50) {
      const levels: (number | "fit")[] = [50, 75, 100, 125, 150, 200]
      const currentIndex = levels.indexOf(pdfZoom as number)
      setPdfZoom(levels[currentIndex - 1] as number)
    }
  }

  const handlePdfFitToWidth = () => {
    setPdfZoom("fit")
  }

  // Helper function to persist clause review to backend
  const saveClauseReview = async (
    clause: Clause,
    decision: "approved" | "rejected" | "flagged",
    riskAccepted: boolean = false,
    comments?: string
  ) => {
    if (!clause.clauseBoundaryId || !dealId) return

    try {
      const response = await fetch(`/api/reconciliation/${dealId}/clauses/${clause.clauseBoundaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, risk_accepted: riskAccepted, comments }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error("Failed to save clause review:", response.status, errorData)
        // TODO: Show toast notification for user feedback
      }
    } catch (error) {
      console.error("Failed to save clause review:", error)
    }
  }

  const handleReject = (clauseOrEvent?: Clause | React.MouseEvent) => {
    // Check if first arg is a valid Clause object (has id property) or an event/undefined
    const clause = clauseOrEvent && 'id' in clauseOrEvent && typeof (clauseOrEvent as Clause).id === 'number'
      ? (clauseOrEvent as Clause)
      : undefined
    const targetClause = clause || selectedClause
    if (!targetClause) return

    setClauseStatuses((prev) => ({
      ...prev,
      [targetClause.id]: "issue",
    }))

    // Persist to backend
    saveClauseReview(targetClause, "rejected")

    // Automatically move to the next clause if available
    setTimeout(() => {
      const currentIndex = filteredClauses.findIndex((c) => c.id === targetClause.id)
      if (currentIndex < filteredClauses.length - 1) {
        handleClauseSelect(filteredClauses[currentIndex + 1])
      }
    }, 300)
  }

  // Load non-persisted state from localStorage (notes only)
  // Note: clauseStatuses and riskAcceptedClauses are now loaded from database via clause_reviews
  useEffect(() => {
    const savedFileName = localStorage.getItem("contractFileName")
    const savedNotes = localStorage.getItem("clauseNotes")

    if (savedFileName) {
      setContractFileName(savedFileName)
    }

    if (savedNotes) {
      setClauseNotes(JSON.parse(savedNotes))
      // If notes are loaded, set the current note if a clause is selected
      if (selectedClause && JSON.parse(savedNotes)[selectedClause.id]) {
        setCurrentNote(JSON.parse(savedNotes)[selectedClause.id])
      }
    }
  }, [selectedClause]) // Depend on selectedClause to update currentNote when it changes

  const getClauseStatus = useCallback((clause: Clause): ClauseStatus => {
    return clauseStatuses[clause.id] ?? clause.status
  }, [clauseStatuses])

  // Metadata clause types that should not appear in RAG cards or document highlighting (Option C)
  // These are displayed in the Contract Details table instead
  const METADATA_CLAUSE_TYPES = new Set([
    "contract_metadata",  // Preamble: effective date, parties, campaign period
    "talent_details",     // Talent name, social media handles, follower counts
    "brand_details",      // Brand name, campaign name, agency
  ])

  // Filter out metadata clauses from RAG card display
  // These are shown in a separate "Contract Details" summary section
  const ragClauses = clauses.filter((c) => !METADATA_CLAUSE_TYPES.has(c.clauseType))
  const metadataClauses = clauses.filter((c) => METADATA_CLAUSE_TYPES.has(c.clauseType))

  // DEBUG: Log clause filtering (remove after verification)
  // Only log once when clauses change to avoid spam
  useEffect(() => {
    if (clauses.length > 0) {
      console.log('[UI Clause Filtering Debug]', {
        total: clauses.length,
        metadata: {
          count: metadataClauses.length,
          types: metadataClauses.map(c => ({ id: c.id, type: c.clauseType, preview: c.text.slice(0, 50) }))
        },
        substantive: {
          count: ragClauses.length,
          types: [...new Set(ragClauses.map(c => c.clauseType))]
        }
      })
    }
  }, [clauses.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const statusCounts = {
    match: ragClauses.filter((c) => getClauseStatus(c) === "match").length,
    review: ragClauses.filter((c) => getClauseStatus(c) === "review").length,
    issue: ragClauses.filter((c) => getClauseStatus(c) === "issue").length,
  }

  const filteredClauses =
    activeFilter === "all" ? ragClauses : ragClauses.filter((c) => getClauseStatus(c) === activeFilter)

  const clauseHighlights = useMemo(
    () =>
      // Exclude metadata clause types from highlighting (Option C)
      // Metadata is displayed in the Contract Details table, not highlighted in document
      clauses
        .filter((clause) => !METADATA_CLAUSE_TYPES.has(clause.clauseType))
        .map((clause) => {
          // Get latest redline for this clause (if any)
          const clauseRedlines = clause.clauseBoundaryId
            ? redlinesByClause[clause.clauseBoundaryId] || []
            : []
          const latestRedline = clauseRedlines.length > 0
            ? clauseRedlines[clauseRedlines.length - 1]
            : null

          return {
            id: clause.id,
            text: clause.text,
            status: getClauseStatus(clause),
            redline: latestRedline ? {
              id: latestRedline.id,
              proposedText: latestRedline.proposed_text,
              originalText: clause.originalText || clause.text,
              status: latestRedline.status as "pending" | "accepted" | "rejected",
              changeType: latestRedline.change_type as "modify" | "delete" | "insert",
            } : undefined,
          }
        }),
    [clauses, clauseStatuses, riskAcceptedClauses, getClauseStatus, redlinesByClause],
  )

  // Updated getStatusColor to only include 3 categories
  const getStatusColor = (status: ClauseStatus) => {
    switch (status) {
      case "match":
        return "emerald"
      case "review":
        return "amber"
      case "issue":
        return "red"
    }
  }

  // Updated getStatusIcon to only include 3 categories
  const getStatusIcon = (status: ClauseStatus) => {
    switch (status) {
      case "match":
        return <CheckCircle2 className="w-4 h-4" />
      case "review":
        return <AlertTriangle className="w-4 h-4" />
      case "issue":
        return <AlertCircle className="w-4 h-4" />
    }
  }

  // Parse metadata clause content into key-value pairs for display
  const parseMetadataContent = (content: string): Array<{ key: string; value: string }> => {
    const lines = content.split('\n').filter(Boolean)
    return lines.map(line => {
      // Match patterns like "Key: Value", "Key = Value", or "Key Value" (for simple cases)
      const colonMatch = line.match(/^([^:=]+)[=:](.+)$/)
      if (colonMatch) {
        return { key: colonMatch[1].trim(), value: colonMatch[2].trim() }
      }
      // Fallback: treat entire line as a value with empty key
      return { key: '', value: line.trim() }
    }).filter(item => item.value) // Only keep entries with values
  }

  const handleReset = () => {
    setClauseStatuses({})
    setActiveFilter("all")
    // Reset to first clause if available, otherwise trigger reload
    if (clauses.length > 0) {
      setSelectedClause(clauses[0])
    }
    setShowHighlights(true)
    // Removed showNotes reset
    setActiveTab("overview")
    setRightTab("review")
    setClauseNotes({})
    setCurrentNote("")
    setNoteSaved(false)
    setShowSummary(true) // Reset summary visibility
    setRiskAcceptedClauses(new Set()) // Reset risk accepted clauses
    // Reset pre-agreed terms and contract file name
    setPreAgreedTerms([])
    setContractFileName("")
    localStorage.removeItem("preAgreedTerms")
    localStorage.removeItem("contractFileName")
    localStorage.removeItem("clauseStatuses")
    localStorage.removeItem("clauseNotes")
    localStorage.removeItem("riskAcceptedClauses")
    // Reset chat buddy state
    setChatBuddyVisible(true)
    localStorage.removeItem("chatBuddyVisible")
    localStorage.removeItem("chatBuddyPosition")
  }

  const handleSaveNote = () => {
    if (!selectedClause) return

    setClauseNotes((prev) => ({
      ...prev,
      [selectedClause.id]: currentNote,
    }))

    setNoteSaved(true)
    setTimeout(() => setNoteSaved(false), 2000)
  }

  const handleClauseSelect = (clause: Clause) => {
    setSelectedClause(clause)
    setCurrentNote(clauseNotes[clause.id] || "")
    setNoteSaved(false)
    // Save last viewed clause to localStorage for resume functionality
    if (dealId) {
      localStorage.setItem(`contractbuddy-last-clause-${dealId}`, String(clause.id))
    }
  }

  useEffect(() => {
    setInfoClauseId(null)
  }, [selectedClause])

  useEffect(() => {
    if (activeTab !== "overview" || !selectedClause) return
    const highlightEl = document.querySelector<HTMLElement>(`[data-clause-highlight-id='${selectedClause.id}']`)
    if (!highlightEl) return

    highlightEl.scrollIntoView({ behavior: "smooth", block: "center" })
    highlightEl.classList.add("ring-2", "ring-slate-400")

    const timeoutId = window.setTimeout(() => {
      highlightEl.classList.remove("ring-2", "ring-slate-400")
    }, 1200)

    return () => {
      window.clearTimeout(timeoutId)
      highlightEl.classList.remove("ring-2", "ring-slate-400")
    }
  }, [selectedClause, activeTab])

  const renderClauseInsight = (clause: Clause) => {
    const currentStatus = getClauseStatus(clause)
    return (
      <div className="mt-4 rounded-md bg-white/70 border border-slate-200 p-4 text-xs text-slate-700 space-y-3">
        <div>
          <p className="font-semibold text-slate-800 mb-1">Why this clause is {currentStatus}</p>
          <p className="leading-relaxed">
            {clause.ragReason ||
              "No detailed explanation available. Review clause text and comparisons for more context."}
          </p>
        </div>

        {clause.preAgreedComparisons && clause.preAgreedComparisons.length > 0 && (
          <div>
            <p className="font-semibold text-slate-800 mb-1">Pre-agreed term comparison</p>
            <div className="space-y-2">
              {clause.preAgreedComparisons.map((comparison, idx) => (
                <div key={`comparison-${clause.id}-${idx}`} className="border border-slate-100 rounded p-2">
                  <p className="font-medium text-slate-700">{comparison.term_category || "Pre-agreed term"}</p>
                  {comparison.term_description && (
                    <p className="text-slate-600 mb-1">{comparison.term_description}</p>
                  )}
                  {comparison.comparison_result?.explanation && (
                    <p className="text-slate-600">
                      {comparison.comparison_result.deviation_severity
                        ? `[${comparison.comparison_result.deviation_severity}] `
                        : ""}
                      {comparison.comparison_result.explanation}
                    </p>
                  )}
                  {comparison.comparison_result?.key_differences?.length ? (
                    <ul className="list-disc list-inside text-slate-500 mt-1">
                      {comparison.comparison_result.key_differences.map((diff, diffIdx) => (
                        <li key={`diff-${clause.id}-${idx}-${diffIdx}`}>{diff}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {clause.matchedTemplate && (
          <div>
            <p className="font-semibold text-slate-800 mb-1">
              Library context ({clause.matchedTemplate.clause_type})
            </p>
            <p className="text-slate-600 mb-1">{clause.matchedTemplate.standard_text}</p>
            {clause.matchedTemplate.usage && <p className="text-slate-500">Usage: {clause.matchedTemplate.usage}</p>}
          </div>
        )}
      </div>
    )
  }

  // Normalize clause type for comparison (handles "Payment Terms" vs "payment_terms")
  const normalizeClauseType = (s: string): string =>
    s.toLowerCase().replace(/[\s_-]+/g, '_')

  const findMatchingTerm = (clause: Clause): PreAgreedTerm | null => {
    return preAgreedTerms.find((term) => normalizeClauseType(term.clauseType) === normalizeClauseType(clause.clauseType)) || null
  }

  const renderTextWithHighlights = () => {
    // Phase 10 Task A: Use real API data instead of mock data
    // If clauses array is empty or no dealId, fallback to contractText
    const useMockData = !dealId || clauses.length === 0

    if (useMockData) {
      // Fallback to mock data rendering
      if (!showHighlights) return contractText

      let lastIndex = 0
      const parts: JSX.Element[] = []

      // Sort clauses by their start position to render them correctly
      const sortedClauses = [...clauses].sort((a, b) => a.position.start - b.position.start)

      sortedClauses.forEach((clause, idx) => {
        const beforeText = contractText.slice(lastIndex, clause.position.start)
        if (beforeText) {
          parts.push(<span key={`before-${idx}`}>{beforeText}</span>)
        }

        const clauseText = contractText.slice(clause.position.start, clause.position.end)
        const isSelected = selectedClause?.id === clause.id
        const currentStatus = getClauseStatus(clause)
        const isRiskAccepted = riskAcceptedClauses.has(clause.id)

        const backgroundColor = isSelected
          ? "rgba(148, 163, 184, 0.2)" // Selected clause background
          : currentStatus === "match"
            ? isRiskAccepted
              ? "rgba(253, 230, 138, 0.6)"
              : "rgba(200, 250, 204, 0.6)" // Yellowish for risk accepted match, Green for match
            : currentStatus === "review"
              ? "rgba(252, 239, 195, 0.6)" // Amber for review
              : "rgba(248, 196, 196, 0.6)" // Red for issue

        parts.push(
          <span
            key={`clause-${idx}`}
            className={`relative cursor-pointer transition-all duration-200 rounded-md px-1 recon-inline-highlight ${
              isSelected ? "ring-2 ring-slate-400" : "hover:brightness-95"
            }`}
            onClick={() => handleClauseSelect(clause)}
            style={{
              backgroundColor,
            }}
          >
            {clauseText}
          </span>,
        )

        lastIndex = clause.position.end
      })

      const remainingText = contractText.slice(lastIndex)
      if (remainingText) {
        parts.push(<span key="remaining">{remainingText}</span>)
      }

      return parts
    }

    // Use real API data: render each clause as a separate block with RAG coloring
    return (
      <div className="space-y-6 recon-inline-container">
        {clauses.map((clause, idx) => {
          const isSelected = selectedClause?.id === clause.id
          const currentStatus = getClauseStatus(clause)
          const isRiskAccepted = riskAcceptedClauses.has(clause.id)

          // RAG color mapping per Phase 9 spec
          const backgroundColor = isSelected
            ? "rgba(148, 163, 184, 0.15)" // Selected clause background
            : currentStatus === "match"
              ? isRiskAccepted
                ? "rgba(253, 230, 138, 0.4)" // Yellowish for risk accepted match
                : "rgba(200, 250, 204, 0.4)" // Green for match
              : currentStatus === "review"
                ? "rgba(252, 239, 195, 0.4)" // Amber for review
                : "rgba(248, 196, 196, 0.4)" // Red for issue

          const borderColor = currentStatus === "match"
            ? isRiskAccepted
              ? "border-yellow-400"
              : "border-green-400"
            : currentStatus === "review"
              ? "border-amber-400"
              : "border-red-400"

          return (
            <div
              key={`clause-${clause.id}`}
              className={`relative cursor-pointer transition-all duration-200 rounded-lg p-4 border-2 recon-highlight-card ${borderColor} ${
                isSelected ? "ring-2 ring-slate-400 ring-offset-2" : "hover:shadow-md"
              }`}
              onClick={() => handleClauseSelect(clause)}
              style={{ backgroundColor }}
              data-clause-highlight-id={clause.id}
              data-testid="clause-card"
              id={`clause-text-${clause.id}`}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium recon-chip ${
                      currentStatus === "match"
                        ? "bg-green-50 text-green-700 border-green-300"
                        : currentStatus === "review"
                          ? "bg-amber-50 text-amber-700 border-amber-300"
                          : "bg-red-50 text-red-700 border-red-300"
                    }`}
                  >
                    {clause.clauseType}
                  </Badge>
                  {isRiskAccepted && currentStatus === "match" && (
                    <Badge variant="outline" className="text-xs recon-chip bg-orange-50 text-orange-700 border-orange-300">
                      <Shield className="w-3 h-3 mr-1" />
                      Risk Accepted
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Pages {clause.position.start}-{clause.position.end} • {Math.round(clause.confidence * 100)}%
                  </span>
                  {clause.clauseBoundaryId ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleClauseSelect(clause)
                          setRedlineModalClause(clause)
                          setRedlineModalOpen(true)
                        }}
                        disabled={!dealId}
                        title={dealId ? "Suggest a change on this clause" : "Connect a deal to enable redlines"}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Suggest change
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs border-purple-200 text-purple-700 hover:bg-purple-50"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleGenerateSuggestionForClause(clause)
                        }}
                        disabled={!dealId || generatingClauseId === clause.id}
                        title="Generate AI suggestion for this clause"
                      >
                        {generatingClauseId === clause.id ? (
                          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3 mr-1" />
                        )}
                        {generatingClauseId === clause.id ? "Generating..." : "AI Suggest"}
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="h-7 text-xs" disabled title="No clause ID available">
                      <Pencil className="w-3 h-3 mr-1" />
                      Suggest change
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-slate-500 hover:text-slate-700"
                    onClick={(e) => {
                      e.stopPropagation()
                      setInfoClauseId(infoClauseId === clause.id ? null : clause.id)
                    }}
                    aria-label="View clause details"
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{clause.text}</p>

              {infoClauseId === clause.id && renderClauseInsight(clause)}

            </div>
          )
        })}
      </div>
    )
  }

  // Calculate page boundaries based on character positions
  // Since PDF page numbers may be NULL, we estimate pages based on character count
  // Typical page has ~3500 characters
  const CHARS_PER_PAGE = 3500

  const calculatePageBoundaries = () => {
    if (!extractedText) return []

    const textLength = extractedText.length
    const estimatedPages = Math.max(1, Math.ceil(textLength / CHARS_PER_PAGE))

    const boundaries: { page: number; startChar: number; endChar: number }[] = []

    for (let i = 0; i < estimatedPages; i++) {
      const startChar = i * CHARS_PER_PAGE
      const endChar = Math.min((i + 1) * CHARS_PER_PAGE, textLength)
      boundaries.push({ page: i + 1, startChar, endChar })
    }

    return boundaries
  }

  // ============ TEXT SEGMENTATION HELPERS ============

  // Segment interface for continuous text rendering
  // Supports multiple clauses per segment for overlapping clause handling
  interface Segment {
    id: string | number
    start: number
    end: number
    type: 'clause' | 'plain'
    clauses: Clause[] // Multiple clauses can cover same text (overlaps)
    text: string
  }

  // Build text segments from clauses - handles overlapping clauses with stacked highlights
  // Algorithm: Find all boundary points, then determine which clauses are active in each segment
  function buildTextSegments(clauseList: Clause[], fullText: string): Segment[] {
    // Filter clauses with valid character positions
    const validClauses = clauseList
      .filter((c) => c.startChar != null && c.endChar != null && c.startChar < c.endChar)

    if (validClauses.length === 0) {
      // No valid clauses - return entire text as plain
      return [{
        id: 'full-text',
        start: 0,
        end: fullText.length,
        type: 'plain',
        clauses: [],
        text: fullText
      }]
    }

    // Collect all boundary points (clause starts and ends)
    const boundaries = new Set<number>([0, fullText.length])
    for (const clause of validClauses) {
      boundaries.add(clause.startChar!)
      boundaries.add(clause.endChar!)
    }

    // Sort boundaries
    const sortedBoundaries = Array.from(boundaries).sort((a, b) => a - b)

    // Build segments between each pair of boundaries
    const segments: Segment[] = []

    for (let i = 0; i < sortedBoundaries.length - 1; i++) {
      const segStart = sortedBoundaries[i]
      const segEnd = sortedBoundaries[i + 1]

      if (segStart >= segEnd) continue

      // Find all clauses that cover this segment
      const activeClauses = validClauses.filter((clause) => {
        const clauseStart = clause.startChar!
        const clauseEnd = clause.endChar!
        // Clause is active if it spans this segment (starts before/at segStart and ends after segStart)
        return clauseStart <= segStart && clauseEnd > segStart
      })

      segments.push({
        id: activeClauses.length > 0 ? `seg-${segStart}-${activeClauses.map(c => c.id).join('-')}` : `plain-${segStart}`,
        start: segStart,
        end: segEnd,
        type: activeClauses.length > 0 ? 'clause' : 'plain',
        clauses: activeClauses,
        text: fullText.slice(segStart, segEnd)
      })
    }

    return segments
  }

  // Slice segments for a specific page - handles segments that cross page boundaries
  function sliceSegmentsForPage(
    segments: Segment[],
    pageStart: number,
    pageEnd: number
  ): Segment[] {
    const result: Segment[] = []

    for (const segment of segments) {
      // Skip segments entirely outside this page
      if (segment.end <= pageStart || segment.start >= pageEnd) {
        continue
      }

      // Segment overlaps with page - slice if needed
      const sliceStart = Math.max(segment.start, pageStart)
      const sliceEnd = Math.min(segment.end, pageEnd)

      // Calculate offsets into the segment's text
      const textStart = sliceStart - segment.start
      const textEnd = sliceEnd - segment.start

      result.push({
        ...segment,
        id: segment.start === sliceStart ? segment.id : `${segment.id}-slice-${pageStart}`,
        start: sliceStart,
        end: sliceEnd,
        text: segment.text.slice(textStart, textEnd)
      })
    }

    return result
  }

  // ============ END TEXT SEGMENTATION HELPERS ============

  // Memoize segments for performance - only recalculate when clauses or extractedText change
  // Exclude metadata clause types from highlighting (Option C) - they appear as plain text
  const allSegments = useMemo(() => {
    if (!extractedText) return []
    const highlightableClauses = clauses.filter((c) => !METADATA_CLAUSE_TYPES.has(c.clauseType))
    return buildTextSegments(highlightableClauses, extractedText)
  }, [clauses, extractedText])

  // Handle mouse enter on clause spans - calculate position for fixed popover
  const handleClauseMouseEnter = (e: React.MouseEvent, clause: Clause) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setPopoverPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    })
    setHoveredClauseId(clause.id)
  }

  // Handle mouse leave on clause spans
  const handleClauseMouseLeave = () => {
    setPopoverPosition(null)
    setHoveredClauseId(null)
  }

  // Render inline text view with continuous text and highlighted clause spans
  const renderInlineTextView = () => {
    if (!extractedText) {
      return (
        <div className="text-center py-12 text-slate-500" data-testid="inline-text-container">
          <p>Full document text not available for inline view.</p>
          <p className="text-sm mt-2">Try switching to card view.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => setOverviewViewMode("cards")}
          >
            Switch to Cards View
          </Button>
        </div>
      )
    }

    // Check if any segments have clauses
    const hasClauseSegments = allSegments.some(s => s.type === 'clause')
    if (!hasClauseSegments) {
      return (
        <div className="text-center py-8" data-testid="inline-text-container">
          <p className="text-slate-500 mb-4">
            Character positions not available for this document.
          </p>
          <Button variant="outline" onClick={() => setOverviewViewMode("cards")}>
            Switch to Cards View
          </Button>
        </div>
      )
    }

    // Calculate page boundaries
    const pageBoundaries = calculatePageBoundaries()
    const numPages = pageBoundaries.length

    // Update total pages if changed
    if (numPages !== totalPages) {
      setTotalPages(Math.max(1, numPages))
    }

    // Get current page data
    const currentPageData = pageBoundaries[currentPage - 1]

    if (!currentPageData) {
      return (
        <div className="text-center py-8" data-testid="inline-text-container">
          <p className="text-slate-500 mb-4">No content for this page.</p>
        </div>
      )
    }

    const pageStartChar = currentPageData.startChar
    const pageEndChar = currentPageData.endChar

    // Slice segments for current page
    const pageSegments = sliceSegmentsForPage(allSegments, pageStartChar, pageEndChar)

    // Count clause segments on this page
    const clauseCount = pageSegments.filter(s => s.type === 'clause').length

    // Helper to get colors based on clause status - muted, professional palette
    const getBackgroundColor = (clause: Clause) => {
      const isSelected = selectedClause?.id === clause.id
      const isRiskAccepted = riskAcceptedClauses.has(clause.id)

      // Neutral grey for contract_metadata clauses (preamble/header info)
      if (clause.clauseType === "contract_metadata") {
        return isSelected ? "rgba(59, 130, 246, 0.18)" : "rgba(148, 163, 184, 0.25)"
      }

      const status = getClauseStatus(clause)

      // Soft blue for selection
      if (isSelected) return "rgba(59, 130, 246, 0.18)"
      if (status === "match") {
        return isRiskAccepted ? "rgba(250, 240, 200, 0.4)" : "rgba(220, 245, 225, 0.35)"
      }
      if (status === "review") return "rgba(252, 246, 228, 0.4)"
      return "rgba(255, 238, 238, 0.35)"
    }

    // Muted underline colors for professional appearance
    const getUnderlineColor = (clause: Clause) => {
      const isSelected = selectedClause?.id === clause.id
      const isRiskAccepted = riskAcceptedClauses.has(clause.id)

      // Neutral slate for contract_metadata clauses
      if (clause.clauseType === "contract_metadata") {
        return isSelected ? "#3b82f6" : "#94a3b8"
      }

      const status = getClauseStatus(clause)

      if (isSelected) return "#3b82f6"
      if (status === "match") return isRiskAccepted ? "#d4a21a" : "#5b9a67"
      if (status === "review") return "#c9960a"
      return "#c45050"
    }

    // Find the currently hovered clause for the popover
    const hoveredClause = hoveredClauseId
      ? clauses.find(c => c.id === hoveredClauseId)
      : null

    // Helper to get CSS class for clause status
    const getClauseHighlightClass = (clause: Clause) => {
      const isSelected = selectedClause?.id === clause.id
      const status = getClauseStatus(clause)
      let className = 'clause-highlight'
      if (status === 'match') className += ' clause-highlight--green'
      else if (status === 'review') className += ' clause-highlight--amber'
      else className += ' clause-highlight--red'
      if (isSelected) className += ' clause-highlight--selected'
      return className
    }

    // Helper to get CSS class for segments with multiple clauses (stacked highlights)
    const getStackedHighlightClass = (clauses: Clause[]) => {
      if (clauses.length === 0) return ''

      // Determine if any clause is selected
      const isSelected = clauses.some(c => selectedClause?.id === c.id)

      // Get the "worst" status (RED > AMBER > GREEN)
      const statuses = clauses.map(c => getClauseStatus(c))
      let worstStatus: 'issue' | 'review' | 'match' = 'match'
      for (const status of statuses) {
        if (status === 'issue') {
          worstStatus = 'issue'
          break
        } else if (status === 'review') {
          worstStatus = 'review'
        }
      }

      let className = 'clause-highlight'
      if (worstStatus === 'match') className += ' clause-highlight--green'
      else if (worstStatus === 'review') className += ' clause-highlight--amber'
      else className += ' clause-highlight--red'

      // Add stacked modifier for multiple clauses
      if (clauses.length > 1) {
        className += ' clause-highlight--stacked'
      }

      if (isSelected) className += ' clause-highlight--selected'
      return className
    }

    return (
      <div data-testid="inline-text-container" className="doc-viewer">
        {/* Pagination Controls */}
        <div className="doc-pagination">
          <button
            className="doc-pagination__btn"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            data-testid="page-nav-prev"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>

          <span className="doc-pagination__info" data-testid="page-indicator">
            Page {currentPage} of {totalPages}
          </span>

          <button
            className="doc-pagination__btn"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            data-testid="page-nav-next"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Document Content - Continuous Text with Highlighted Clauses */}
        <div className="doc-viewer__paper">
          <div className="doc-viewer__content" style={{ whiteSpace: 'pre-wrap' }}>
            {pageSegments.map((segment) => {
              if (segment.type === 'plain') {
                return (
                  <span key={segment.id} data-testid="plain-text-segment">
                    {segment.text}
                  </span>
                )
              }

              // Use first clause as primary (for click/hover), but apply stacked styling
              const primaryClause = segment.clauses[0]
              const clauseCount = segment.clauses.length

              return (
                <span
                  key={segment.id}
                  className={getStackedHighlightClass(segment.clauses)}
                  onClick={() => handleClauseSelect(primaryClause)}
                  onMouseEnter={(e) => handleClauseMouseEnter(e, primaryClause)}
                  onMouseLeave={handleClauseMouseLeave}
                  data-testid={`clause-highlight-${primaryClause.id}`}
                  data-clause-id={primaryClause.id}
                  data-clause-count={clauseCount}
                  title={clauseCount > 1 ? `${clauseCount} overlapping clauses: ${segment.clauses.map(c => c.clauseType).join(', ')}` : undefined}
                >
                  {segment.text}
                  {clauseCount > 1 && (
                    <span className="clause-overlap-badge">{clauseCount}</span>
                  )}
                </span>
              )
            })}

            {pageSegments.length === 0 && (
              <div className="text-center py-8" style={{ color: 'var(--doc-text-muted)' }}>
                <p>No content on this page.</p>
              </div>
            )}
          </div>
        </div>

        {/* Hover Actions Popover */}
        {hoveredClause && popoverPosition && (
          <div
            className="clause-popover"
            style={{ left: popoverPosition.x, top: popoverPosition.y }}
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setHoveredClauseId(hoveredClause.id)}
            onMouseLeave={handleClauseMouseLeave}
            data-testid="clause-hover-actions"
          >
            <button
              className="clause-popover__btn clause-popover__btn--approve"
              onClick={(e) => {
                e.stopPropagation()
                handleClauseSelect(hoveredClause)
                handleApprove(hoveredClause)
              }}
              title="Approve clause"
              data-testid="hover-approve-btn"
            >
              <ThumbsUp className="w-4 h-4" />
            </button>
            <button
              className="clause-popover__btn clause-popover__btn--reject"
              onClick={(e) => {
                e.stopPropagation()
                handleClauseSelect(hoveredClause)
                handleReject(hoveredClause)
              }}
              title="Flag for review"
              data-testid="hover-reject-btn"
            >
              <ThumbsDown className="w-4 h-4" />
            </button>
            <div className="clause-popover__divider" />
            <span className="clause-popover__type">
              {hoveredClause.clauseType}
            </span>
          </div>
        )}
      </div>
    )
  }

  const handleApprove = (clauseOrEvent?: Clause | React.MouseEvent) => {
    // Check if first arg is a valid Clause object (has id property) or an event/undefined
    const clause = clauseOrEvent && 'id' in clauseOrEvent && typeof (clauseOrEvent as Clause).id === 'number'
      ? (clauseOrEvent as Clause)
      : undefined
    const targetClause = clause || selectedClause
    if (!targetClause) return

    const isRiskAccepted = riskAcceptedClauses.has(targetClause.id)

    setClauseStatuses((prev) => ({
      ...prev,
      [targetClause.id]: "match",
    }))

    // Persist to backend
    saveClauseReview(targetClause, "approved", isRiskAccepted)

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#34d399", "#6ee7b7"],
    })

    // Automatically move to the next clause if available
    setTimeout(() => {
      const currentIndex = filteredClauses.findIndex((c) => c.id === targetClause.id)
      if (currentIndex < filteredClauses.length - 1) {
        handleClauseSelect(filteredClauses[currentIndex + 1])
      } else {
        // If it's the last clause, maybe show a confirmation or move to completion
        // For now, let's just log it
        console.log("Last clause approved.")
      }
    }, 500)
  }

  // Auto-scroll to selected clause in inline view with page navigation
  useEffect(() => {
    if (overviewViewMode === "inline" && selectedClause && activeTab === "overview") {
      // First, navigate to the correct page if needed
      const clausePage = selectedClause.position?.start || 1

      // Calculate which index this page is in our boundaries
      const pageBoundaries = calculatePageBoundaries()
      const pageIndex = pageBoundaries.findIndex((p) => p.page === clausePage)

      if (pageIndex !== -1 && pageIndex + 1 !== currentPage) {
        // Navigate to the page containing this clause
        setCurrentPage(pageIndex + 1)

        // Wait for page to render then scroll
        setTimeout(() => {
          const element = document.querySelector(`[data-clause-id="${selectedClause.id}"]`)
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }, 100)
      } else {
        // Already on correct page, just scroll
        const element = document.querySelector(`[data-clause-id="${selectedClause.id}"]`)
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }
    }
  }, [selectedClause?.id, overviewViewMode, activeTab])

  useEffect(() => {
    const savedChatPosition = localStorage.getItem("chatWindowPosition")
    if (savedChatPosition) {
      setChatWindowPosition(JSON.parse(savedChatPosition))
    } else {
      // Default position: center-right of screen
      setChatWindowPosition({
        x: window.innerWidth - 420,
        y: window.innerHeight / 2 - 300,
      })
    }
  }, [])

  useEffect(() => {
    if (chatWindowOpen) {
      localStorage.setItem("chatWindowPosition", JSON.stringify(chatWindowPosition))
    }
  }, [chatWindowPosition, chatWindowOpen])

  const handleChatMouseDown = (e: React.MouseEvent) => {
    if (!chatWindowRef.current) return
    setIsChatDragging(true)
    const rect = chatWindowRef.current.getBoundingClientRect()
    setChatDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  useEffect(() => {
    const handleChatMouseMove = (e: MouseEvent) => {
      if (!isChatDragging) return

      const newX = e.clientX - chatDragOffset.x
      const newY = e.clientY - chatDragOffset.y

      // Keep within viewport bounds
      const maxX = window.innerWidth - 400
      const maxY = window.innerHeight - 600

      setChatWindowPosition({
        x: Math.max(0, Math.min(newX, maxX)),
        y: Math.max(0, Math.min(newY, maxY)),
      })
    }

    const handleChatMouseUp = () => {
      setIsChatDragging(false)
    }

    if (isChatDragging) {
      document.addEventListener("mousemove", handleChatMouseMove)
      document.addEventListener("mouseup", handleChatMouseUp)
    }

    return () => {
      document.removeEventListener("mousemove", handleChatMouseMove)
      document.removeEventListener("mouseup", handleChatMouseUp)
    }
  }, [isChatDragging, chatDragOffset])

  const handleToggleChatWindow = () => {
    setChatWindowOpen(!chatWindowOpen)
  }

  // Show loading state with fun messages and confetti
  if (loading && !documentProcessing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-6 p-8 max-w-md">
          {/* Animated icon */}
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center animate-pulse">
              <FileText className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full animate-bounce flex items-center justify-center">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Fun rotating message */}
          <div className="text-center">
            <p className="text-lg font-medium text-slate-700 transition-all duration-300">
              {funLoadingMessages[loadingMessageIndex]}
            </p>
            <p className="text-sm text-slate-500 mt-2">
              Hang tight, good things are loading...
            </p>
          </div>

          {/* Progress dots */}
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-emerald-500 animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>

          {/* Tagline */}
          <p className="text-xs text-slate-400 italic mt-4">
            Smart Contract Reviews. For People With Better Things To Do.
          </p>
        </div>
      </div>
    )
  }

  // Show processing state with animated thoughts
  if (documentProcessing) {
    return (
      <div className="min-h-screen bg-slate-50">
        <ProcessingThoughts
          isActuallyProcessing={true}
          onComplete={() => {
            // Animation finished - trigger an immediate refetch to check if processing is done
            setForceRefetchCounter(prev => prev + 1)
          }}
        />
      </div>
    )
  }

  // Show processing failed state
  if (processingFailed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <AlertCircle className="w-16 h-16 text-red-500" />
          <h2 className="text-xl font-semibold text-slate-800">Contract Processing Failed</h2>
          <p className="text-slate-600">{processingFailed}</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push('/deals')}>
              Back to Deals
            </Button>
            <Button onClick={() => router.push(`/deals/new?dealId=${dealId}`)}>
              Re-upload Contract
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Show error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <AlertCircle className="w-16 h-16 text-red-500" />
          <h2 className="text-xl font-semibold text-slate-800">Failed to Load Contract</h2>
          <p className="text-slate-600">{loadError}</p>
          <Button onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  // Show empty state if no clauses and not processing
  if (clauses.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-md text-center p-8">
          <FileText className="w-16 h-16 text-slate-400" />
          <h2 className="text-xl font-semibold text-slate-800">No Contract Data</h2>
          <p className="text-slate-600">
            This deal doesn&apos;t have any contract clauses yet. Upload a contract document to begin reconciliation.
          </p>
          <Button onClick={() => router.push(`/deals/new?dealId=${dealId}`)}>
            Upload Contract
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Dialog
        open={redlineModalOpen}
        onOpenChange={(open) => {
          setRedlineModalOpen(open)
          if (!open) {
            setRedlineModalClause(null)
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base">Suggest change</DialogTitle>
          </DialogHeader>

          {redlineModalClause ? (
            <div className="space-y-3">
              {/* Compact clause preview */}
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5 max-h-32 overflow-y-auto">
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {redlineModalClause.clauseType}
                  </Badge>
                  <span className="text-[10px] text-slate-400">
                    p.{redlineModalClause.position.start}
                  </span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed line-clamp-4">
                  {redlineModalClause.text}
                </p>
              </div>

              {/* Redline editor - primary action */}
              {dealId && tenantId ? (
                <RedlineEditor
                  clauseBoundaryId={modalClauseKey!}
                  dealId={dealId}
                  tenantId={tenantId}
                  existingRedline={modalRedlines[0] || null}
                  onSave={handleRedlineSave}
                  onError={handleRedlineError}
                />
              ) : (
                <div className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-500 text-center">
                  Loading deal data...
                </div>
              )}

              {/* Existing redlines - collapsed */}
              {modalRedlines && modalRedlines.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                    {modalRedlines.length} existing redline{modalRedlines.length > 1 ? 's' : ''}
                  </summary>
                  <div className="mt-2 space-y-1.5">
                    {modalRedlines.map((redline) => (
                      <div key={redline.id} className="bg-slate-50 rounded p-2 border border-slate-200">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[10px]">{redline.change_type}</Badge>
                          <Badge className={redline.status === "resolved" ? "bg-emerald-100 text-emerald-700 text-[10px]" : "bg-amber-100 text-amber-700 text-[10px]"}>
                            {redline.status}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-600 line-clamp-2">{redline.proposed_text}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {/* Comment section - collapsed */}
              <details className="text-xs border-t pt-3">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                  Add comment {modalComments.length > 0 && `(${modalComments.length})`}
                </summary>
                <div className="mt-2 space-y-2">
                  {modalComments.length > 0 && <CommentThread comments={modalComments} />}
                  <textarea
                    className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    rows={2}
                    value={modalCommentDraft}
                    onChange={(e) => {
                      if (!modalClauseKey) return
                      setCommentDrafts((prev) => ({ ...prev, [modalClauseKey]: e.target.value }))
                    }}
                    placeholder="Leave a comment..."
                    disabled={!modalClauseKey || !dealId}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => modalClauseKey && handleAddComment(modalClauseKey)}
                    disabled={!modalClauseKey || !dealId || !modalCommentDraft.trim()}
                  >
                    <Send className="w-3 h-3 mr-1.5" />
                    Post
                  </Button>
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a clause to propose changes.</p>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRedlineModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main Layout - Flex container for drawer + content */}
      <div className="flex h-screen overflow-hidden">
        {/* Left Drawer - Progress & Filters (pushes content) */}
        <div className={`left-drawer ${leftPanelCollapsed ? 'left-drawer--collapsed' : 'left-drawer--expanded'}`}>
        <div className="left-drawer__panel">
          <div className="left-drawer__header">
            <h2 className="left-drawer__title">Progress</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push(`/reconciliation/complete?dealId=${dealId}`)}
                className="text-slate-500 hover:text-slate-700 disabled:opacity-50"
                title={isStillProcessing ? "Please wait for P1 reconciliation to complete" : "Skip to completion page"}
                disabled={isStillProcessing}
              >
                <SkipForward className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                title="Reset all settings"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <button
                onClick={() => setLeftPanelCollapsed(true)}
                className="left-drawer__close"
                title="Close panel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="left-drawer__content">

              {contractFileName && (
                <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-700 mb-1">Contract File</p>
                  <p className="text-xs text-blue-600">{contractFileName}</p>
                </div>
              )}

              {preAgreedTerms.length > 0 && (
                <div className="mb-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <p className="text-xs font-medium text-emerald-700 mb-1">Pre-Agreed Terms</p>
                  <p className="text-xs text-emerald-600">{preAgreedTerms.length} terms loaded</p>
                </div>
              )}

              {/* Stepper */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-medium">
                      ✓
                    </div>
                    <span className="text-sm font-medium text-slate-700">Summary</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-emerald-500 mx-2" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                      2
                    </div>
                    <span className="text-sm font-medium text-slate-700">Review</span>
                  </div>
                  <div className="flex-1 h-0.5 bg-slate-200 mx-2" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-medium">
                      3
                    </div>
                    <span className="text-xs text-slate-500">Resolution</span>
                  </div>
                </div>
              </div>

              {/* Progress Bar with real-time animation */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Overall Completion</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {Math.round((statusCounts.match / clauses.length) * 100)}%
                  </span>
                </div>
                <Progress
                  value={(statusCounts.match / clauses.length) * 100}
                  className="h-2 transition-all duration-500 ease-out"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {statusCounts.match} of {clauses.length} clauses approved
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50 border border-emerald-100 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm font-medium text-emerald-900">Approved</span>
                  </div>
                  <span className="text-lg font-semibold text-emerald-700 transition-all duration-300">
                    {statusCounts.match}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50 border border-amber-100 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-900">Needs Review</span>
                  </div>
                  <span className="text-lg font-semibold text-amber-700 transition-all duration-300">
                    {statusCounts.review}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-red-50 border border-red-100 transition-all duration-300">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm font-medium text-red-900">Issue</span>
                  </div>
                  <span className="text-lg font-semibold text-red-700 transition-all duration-300">
                    {statusCounts.issue}
                  </span>
                </div>
              </div>

            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-700 mb-3">Filter by Status</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={activeFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter("all")}
                  className="rounded-full"
                >
                  All
                </Button>
                <Button
                  variant={activeFilter === "review" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter("review")}
                  className="rounded-full bg-amber-500 hover:bg-amber-600 border-amber-500"
                  style={activeFilter === "review" ? {} : { backgroundColor: "transparent", color: "#f59e0b" }}
                >
                  Amber
                </Button>
                <Button
                  variant={activeFilter === "issue" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveFilter("issue")}
                  className="rounded-full bg-red-500 hover:bg-red-600 border-red-500"
                  style={activeFilter === "issue" ? {} : { backgroundColor: "transparent", color: "#ef4444" }}
                >
                  Red
                </Button>
              </div>
            </div>

            <div className="mt-6 space-y-2">
              <Button
                variant="outline"
                className="w-full rounded-lg bg-transparent hover:bg-slate-50"
                onClick={handleExportText}
                disabled={exportingText || !dealId}
              >
                {exportingText ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Text Report
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-lg bg-transparent hover:bg-slate-50"
                onClick={handleExportJSON}
                disabled={exportingJSON || !dealId}
              >
                {exportingJSON ? (
                  <>
                    <div className="w-4 h-4 mr-2 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4 mr-2" />
                    Download JSON Export
                  </>
                )}
              </Button>
            </div>

            <div className="mt-6">
              <Button
                onClick={handleCompleteReview}
                className="w-full bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isStillProcessing}
                title={isStillProcessing ? "Please wait for P1 reconciliation to complete" : ""}
              >
                {isStillProcessing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  "Complete Review →"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

        {/* Main Content Area with Resizable Panels */}
        <ResizablePanelGroup direction="horizontal" className="flex-1 h-full">
        {/* Center Panel - Document Viewer */}
        <ResizablePanel defaultSize={rightPanelCollapsed ? 97 : 70} minSize={40} className="recon-panel recon-panel--center flex flex-col">
          {/* Toolbar */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                {/* Progress Drawer Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
                  className={`drawer-toggle mr-2 ${!leftPanelCollapsed ? 'drawer-toggle--active' : ''}`}
                  title={leftPanelCollapsed ? "Show progress panel" : "Hide progress panel"}
                >
                  {leftPanelCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </Button>

                <Button
                  variant={activeTab === "overview" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("overview")}
                  className="rounded-lg recon-tab"
                >
                  Overview
                </Button>
                <Button
                  variant={activeTab === "pdf" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("pdf")}
                  className="rounded-lg recon-tab"
                >
                  PDF
                </Button>

                {/* Cards/Inline toggle for Overview tab */}
                {activeTab === "overview" && (
                  <div className="flex items-center gap-1 ml-2 border-l border-slate-200 pl-2">
                    <Button
                      variant={overviewViewMode === "cards" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setOverviewViewMode("cards")}
                      className="rounded-lg text-xs recon-tab"
                      data-testid="view-toggle-cards"
                    >
                      <LayoutGrid className="w-3 h-3 mr-1" />
                      Cards
                    </Button>
                    <Button
                      variant={overviewViewMode === "inline" ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setOverviewViewMode("inline")}
                      className="rounded-lg text-xs recon-tab"
                      disabled={!extractedText}
                      title={!extractedText ? "Full document text not available" : "View as continuous document"}
                      data-testid="view-toggle-inline"
                    >
                      <AlignLeft className="w-3 h-3 mr-1" />
                      Inline
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showHighlights ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowHighlights(!showHighlights)}
                  className="rounded-lg recon-tab"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Highlights
                </Button>
                {/* Removed showNotes toggle */}
                {!chatWindowOpen && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToggleChatWindow}
                    className="rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-500 hover:from-blue-600 hover:to-blue-700 hover:border-blue-600"
                  >
                    <MessageCircle className="w-4 h-4 mr-1" />
                    Chat
                  </Button>
                )}
                <div className="w-px h-6 bg-slate-200 mx-1" />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg bg-transparent"
                  onClick={handlePdfZoomOut}
                  disabled={activeTab !== "pdf" || !hasPdf || pdfZoom === 50}
                >
                  <ZoomOut className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg bg-transparent"
                  onClick={handlePdfZoomIn}
                  disabled={activeTab !== "pdf" || !hasPdf || pdfZoom === 200}
                >
                  <ZoomIn className="w-4 h-4" />
                </Button>
                {activeTab === "pdf" && hasPdf && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActiveTab("overview")}
                    className="rounded-lg bg-transparent"
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    View Text Only
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-0.5 bg-emerald-500 rounded" />
                <span className="text-slate-600">Approved</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-0.5 bg-amber-500 rounded" />
                <span className="text-slate-600">Review</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-8 h-0.5 bg-red-500 rounded" />
                <span className="text-slate-600">Issue</span>
              </div>
            </div>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-y-auto p-8">
            {/* Overview tab */}
            <div className={activeTab === "overview" ? "block" : "hidden"}>
              <div className="w-full">
                {/* Contract Details (Metadata) Section */}
                {metadataClauses.length > 0 && (
                  <Card className="p-4 shadow-sm rounded-2xl border-slate-200 mb-6 bg-slate-50">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-slate-400 rounded-full" />
                      <h3 className="text-sm font-semibold text-slate-700">Contract Details</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {metadataClauses.flatMap((clause) =>
                            parseMetadataContent(clause.text).map((item, idx) => (
                              <tr key={`${clause.id}-${idx}`} className="border-b border-slate-200 last:border-0">
                                {item.key ? (
                                  <>
                                    <td className="py-2 pr-4 text-slate-500 font-medium whitespace-nowrap w-1/3">
                                      {item.key}
                                    </td>
                                    <td className="py-2 text-slate-800">
                                      {item.value}
                                    </td>
                                  </>
                                ) : (
                                  <td colSpan={2} className="py-2 text-slate-800">
                                    {item.value}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}

                {/* P1 Reconciliation In Progress Banner */}
                {isStillProcessing && clauses.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3 shadow-sm">
                    <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        P1 Reconciliation in progress...
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Results updating automatically. Clause statuses may change.
                      </p>
                    </div>
                  </div>
                )}
                <Card className="p-4 shadow-sm rounded-2xl border-slate-200">
                  <div className="prose prose-slate max-w-none">
                    <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-serif">
                      {overviewViewMode === "inline"
                        ? renderInlineTextView()
                        : renderTextWithHighlights()
                      }
                    </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* PDF tab (kept mounted so zoom/page state persists) */}
            <div className={activeTab === "pdf" ? "block h-full" : "hidden"}>
              {hasPdf && dealId ? (
                <div className="h-full">
                  <PDFViewer
                    dealId={dealId}
                    zoomLevel={pdfZoom}
                    onZoomChange={setPdfZoom}
                    hideToolbarZoom={true}
                    highlightClauses={clauseHighlights}
                    selectedClauseId={selectedClause?.id ?? null}
                    onClauseClick={(clauseId) => {
                      const clause = clauses.find(c => c.id === clauseId)
                      if (clause) handleClauseSelect(clause)
                    }}
                    onClauseAction={(clauseId, action) => {
                      const clause = clauses.find(c => c.id === clauseId)
                      if (!clause) return

                      // Get existing redlines for this clause
                      const clauseRedlines = clause.clauseBoundaryId
                        ? redlinesByClause[clause.clauseBoundaryId] || []
                        : []
                      const hasRedlines = clauseRedlines.length > 0

                      if (action === 'approve') {
                        handleApprove(clause)
                      } else if (action === 'reject') {
                        handleReject(clause)
                      } else if (action === 'comment') {
                        // AI Suggest: Generate suggestion if no redlines, or view existing
                        handleClauseSelect(clause)
                        if (hasRedlines) {
                          // View existing redlines in diff modal
                          setSuggestedRedlinesModalOpen(true)
                        } else {
                          // Generate AI suggestion
                          handleGenerateSuggestionForClause(clause)
                        }
                      } else if (action === 'edit-redline') {
                        // Open manual editor for editing existing redline
                        handleClauseSelect(clause)
                        setRedlineModalClause(clause)
                        setRedlineModalOpen(true)
                      } else if (action === 'accept-redline') {
                        // Accept the latest redline for this clause
                        const clauseRedlines = clause.clauseBoundaryId
                          ? redlinesByClause[clause.clauseBoundaryId] || []
                          : []
                        const latestRedline = clauseRedlines[clauseRedlines.length - 1]
                        if (latestRedline) {
                          handleClauseSelect(clause)
                          handleAcceptRedline(latestRedline.id)
                        }
                      } else if (action === 'remove-redline') {
                        // Remove the latest redline (mark as rejected)
                        const clauseRedlines = clause.clauseBoundaryId
                          ? redlinesByClause[clause.clauseBoundaryId] || []
                          : []
                        const latestRedline = clauseRedlines[clauseRedlines.length - 1]
                        if (latestRedline && clause.clauseBoundaryId) {
                          // Update local state to remove the redline
                          setRedlinesByClause((prev) => {
                            const existing = prev[clause.clauseBoundaryId!] || []
                            return {
                              ...prev,
                              [clause.clauseBoundaryId!]: existing.filter(r => r.id !== latestRedline.id),
                            }
                          })
                          toast({
                            title: "Redline Removed",
                            description: "The suggested change has been removed.",
                          })
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="max-w-3xl mx-auto h-full flex items-center justify-center">
                  <Card className="p-12 shadow-sm rounded-2xl border-slate-200 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">No PDF Available</h3>
                    <p className="text-sm text-slate-500 mb-4">The original contract document is not available for viewing.</p>
                    <p className="text-xs text-slate-400">
                      Please use the text overview or contact support if you need access to the original document.
                    </p>
                  </Card>
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Clause Review */}
        <ResizablePanel
          defaultSize={rightPanelCollapsed ? 3 : 24}
          minSize={3}
          maxSize={40}
          collapsible={true}
          collapsedSize={3}
          onCollapse={() => setRightPanelCollapsed(true)}
          onExpand={() => setRightPanelCollapsed(false)}
          className={`recon-panel recon-panel--right ${rightPanelCollapsed ? 'recon-panel--collapsed' : ''}`}
        >
          {/* Collapse Toggle */}
          <button
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            className="recon-panel__toggle recon-panel__toggle--right"
            title={rightPanelCollapsed ? 'Expand panel' : 'Collapse panel'}
          >
            {rightPanelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
          </button>

          {/* Collapsed State Label */}
          {rightPanelCollapsed && (
            <div className="flex items-center justify-center h-full">
              <span className="collapsed-label">Review</span>
            </div>
          )}

          {/* Panel Content */}
          <div className={`flex flex-col h-full ${rightPanelCollapsed ? 'hidden' : ''}`}>
            {/* Tabs */}
            <div className="review-panel__header">
              <button
                className={`review-panel__tab ${rightTab === "review" ? "review-panel__tab--active" : ""}`}
                onClick={() => setRightTab("review")}
              >
                Review
              </button>
              <button
                className={`review-panel__tab ${rightTab === "terms" ? "review-panel__tab--active" : ""}`}
                onClick={() => setRightTab("terms")}
              >
                Terms
              </button>
              <button
                className={`review-panel__tab ${rightTab === "comments" ? "review-panel__tab--active" : ""}`}
                onClick={() => setRightTab("comments")}
              >
                Comments
              </button>
              <button
                className={`review-panel__tab ${rightTab === "library" ? "review-panel__tab--active" : ""}`}
                onClick={() => setRightTab("library")}
              >
                Library
              </button>
            </div>

            <div className="recon-panel__content">
            {rightTab === "review" && selectedClause && (
              <div className="space-y-6">
                {/* Current Clause */}
                <Card className="p-5 shadow-sm rounded-2xl border-slate-200">
                  {(() => {
                    const currentStatus = getClauseStatus(selectedClause)
                    const isRiskAccepted = riskAcceptedClauses.has(selectedClause.id)

                    return (
                      <>
                        <div className="flex items-start justify-between mb-3 gap-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                className={`rounded-full px-3 py-1 ${
                                  currentStatus === "match"
                                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                    : currentStatus === "review"
                                      ? "bg-amber-100 text-amber-700 border-amber-200"
                                      : "bg-red-100 text-red-700 border-red-200"
                                }`}
                              >
                                {getStatusIcon(currentStatus)}
                                <span className="ml-1.5 capitalize">{currentStatus}</span>
                              </Badge>
                              {isRiskAccepted && currentStatus === "match" && (
                                <Badge className="rounded-full px-3 py-1 bg-orange-100 text-orange-700 border-orange-200">
                                  <Shield className="w-3 h-3 mr-1" />
                                  Risk Accepted
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>
                                Pages {selectedClause.position.start}-{selectedClause.position.end}
                              </span>
                              {selectedClause.similarityScore !== null && selectedClause.similarityScore !== undefined && (
                                <>
                                  <span>•</span>
                                  <span className="font-medium text-blue-600">{(selectedClause.similarityScore * 100).toFixed(0)}% library match</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full text-slate-500 hover:text-slate-700"
                            onClick={() =>
                              setInfoClauseId(infoClauseId === selectedClause.id ? null : selectedClause.id)
                            }
                            aria-label="View clause details"
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="mb-3">
                          <Badge variant="outline" className="text-xs font-medium text-slate-600">
                            {selectedClause.clauseType}
                          </Badge>
                        </div>
                      </>
                    )
                  })()}

                  <p className="text-sm text-slate-700 mb-4 leading-relaxed">"{selectedClause.text}"</p>

                  {infoClauseId === selectedClause.id && renderClauseInsight(selectedClause)}

                  <div className="bg-slate-50 rounded-xl border border-slate-200 mb-4">
                    <button
                      onClick={() => setShowSummary(!showSummary)}
                      className="w-full flex items-center justify-between p-4 hover:bg-slate-100 transition-colors rounded-xl"
                    >
                      <h4 className="text-xs font-semibold text-slate-700">Plain English Summary</h4>
                      {showSummary ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </button>
                    {showSummary && (
                      <div className="px-4 pb-4">
                        <p className="text-sm text-slate-600 leading-relaxed">{selectedClause.summary}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons - Moved to top for better UX */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      size="sm"
                      className="flex-1 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-all duration-200"
                      onClick={handleApprove}
                    >
                      <ThumbsUp className="w-4 h-4 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-lg bg-transparent hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all duration-200"
                      onClick={handleReject}
                    >
                      <ThumbsDown className="w-4 h-4 mr-1" />
                      Reject
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1 rounded-lg bg-transparent">
                      <Flag className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Phase 10 Task C: Display matched template and RAG assessment data - Now collapsible */}
                  {selectedClause.matchedTemplate && (
                    <Collapsible defaultOpen={false} className="mb-4">
                      <div className="bg-blue-50 rounded-xl border border-blue-200">
                        <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-blue-100/50 transition-colors rounded-xl">
                          <div className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-blue-600" />
                            <h4 className="text-xs font-semibold text-blue-900">📚 Library Match Details</h4>
                          </div>
                          <ChevronDown className="w-4 h-4 text-blue-600 transition-transform data-[state=open]:rotate-180" />
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-4 pb-4">
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-medium text-blue-700 mb-1">Library Clause:</p>
                              <p className="text-xs text-blue-600">{selectedClause.matchedTemplate.clause_id} - {selectedClause.matchedTemplate.clause_type}</p>
                            </div>
                            {selectedClause.similarityScore !== null && selectedClause.similarityScore !== undefined && (
                              <div>
                                <p className="text-xs font-medium text-blue-700 mb-1">Similarity Score:</p>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-blue-100 rounded-full h-2">
                                    <div
                                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                      style={{ width: `${selectedClause.similarityScore * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-semibold text-blue-700">
                                    {(selectedClause.similarityScore * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="text-xs font-medium text-blue-700 mb-1">Standard Text:</p>
                              <p className="text-xs text-blue-600 leading-relaxed">{selectedClause.matchedTemplate.standard_text}</p>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  )}

                  <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <StickyNote className="w-4 h-4 text-amber-600" />
                        <h4 className="text-xs font-semibold text-amber-900">Notes</h4>
                      </div>
                      {noteSaved && (
                        <span className="text-xs text-emerald-600 font-medium animate-in fade-in duration-200">
                          ✓ Auto-saved
                        </span>
                      )}
                    </div>
                    <textarea
                      value={currentNote}
                      onChange={(e) => setCurrentNote(e.target.value)}
                      placeholder="Add notes for this clause... (auto-saves)"
                      className="w-full h-24 p-2 text-sm border border-amber-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                    <p className="text-xs text-amber-600 mt-1">Notes auto-save after 2 seconds of inactivity</p>
                  </div>

                  {(() => {
                    const matchingTerm = findMatchingTerm(selectedClause)
                    if (matchingTerm) {
                      return (
                        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                            <h4 className="text-xs font-semibold text-blue-900">Pre-Agreed Term Match</h4>
                          </div>
                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-medium text-blue-700 mb-1">Expected:</p>
                              <p className="text-xs text-blue-600 leading-relaxed">{matchingTerm.expectedTerm}</p>
                            </div>
                            {matchingTerm.notes && (
                              <div>
                                <p className="text-xs font-medium text-blue-700 mb-1">Notes:</p>
                                <p className="text-xs text-blue-600 leading-relaxed">{matchingTerm.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                </Card>

                {/* Phase 11: Redline Editor - Comments removed, now collapsible */}
                {selectedClause.clauseBoundaryId && (
                  <Collapsible defaultOpen={false}>
                    <div className="rounded-2xl border border-slate-200 shadow-sm">
                      <CollapsibleTrigger className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors rounded-t-2xl">
                        <div className="flex items-center gap-2">
                          <Pencil className="w-4 h-4 text-slate-600" />
                          <h3 className="font-semibold text-sm text-slate-700">📝 Suggest Redline</h3>
                        </div>
                        <ChevronDown className="w-4 h-4 text-slate-600 transition-transform data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-5 pb-5">
                        {/* View Suggested Redlines + Generate Suggestion buttons */}
                        {selectedClauseRedlines && selectedClauseRedlines.length > 0 ? (
                          <div className="mb-4">
                            <Button
                              variant="outline"
                              className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => setSuggestedRedlinesModalOpen(true)}
                            >
                              <GitCompare className="w-4 h-4 mr-2" />
                              View Suggested Redlines ({selectedClauseRedlines.length})
                            </Button>
                          </div>
                        ) : (
                          <div className="mb-4">
                            <Button
                              variant="outline"
                              className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                              onClick={handleGenerateSuggestion}
                              disabled={isGeneratingSuggestion}
                            >
                              {isGeneratingSuggestion ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-4 h-4 mr-2" />
                                  Generate AI Suggestion
                                </>
                              )}
                            </Button>
                            <p className="text-xs text-slate-500 mt-2 text-center">
                              {findMatchingTerm(selectedClause)
                                ? "AI will suggest changes based on the pre-agreed term"
                                : "AI will suggest improvements for this clause"}
                            </p>
                          </div>
                        )}

                        <p className="text-xs text-slate-500 mb-4">
                          Propose modifications to this clause and optionally add a comment explaining your reasoning.
                        </p>
                        <RedlineEditor
                          clauseBoundaryId={selectedClause.clauseBoundaryId}
                          dealId={dealId}
                          tenantId={tenantId}
                          existingRedline={existingRedlineForSelected}
                          onSave={handleRedlineSave}
                          onError={handleRedlineError}
                        />
                        {selectedClauseRedlines && selectedClauseRedlines.length > 0 && (
                            <div className="mt-4 pt-4 border-t">
                              <h4 className="text-xs font-semibold text-slate-700 mb-3">
                                Existing Redlines ({selectedClauseRedlines.length})
                              </h4>
                              <div className="space-y-2">
                                {selectedClauseRedlines.map((redline) => (
                                  <div key={redline.id} className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                                    <div className="flex items-center justify-between mb-2">
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {redline.change_type}
                                      </Badge>
                                      <Badge
                                        className={
                                          redline.status === "resolved"
                                            ? "bg-emerald-100 text-emerald-700"
                                            : "bg-amber-100 text-amber-700"
                                        }
                                      >
                                        {redline.status}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                      {redline.proposed_text}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                )}

                {/* Upcoming Clauses Queue */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Up & Coming</h3>
                  <div className="space-y-2">
                    {filteredClauses
                      .filter((c) => c.id !== selectedClause.id)
                      .slice(0, 5)
                      .map((clause) => {
                        const currentStatus = getClauseStatus(clause)
                        const hasNotes = !!clauseNotes[clause.id]
                        const isRiskAccepted = riskAcceptedClauses.has(clause.id)
                        return (
                          <Card
                            key={clause.id}
                            className={`p-3 shadow-sm rounded-xl border-2 cursor-pointer hover:border-slate-300 transition-colors ${
                              isRiskAccepted && currentStatus === "match" ? "border-orange-200 bg-orange-50" : ""
                            }`}
                            onClick={() => handleClauseSelect(clause)}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-1 h-12 rounded-full ${
                                  currentStatus === "match"
                                    ? "bg-emerald-500"
                                    : currentStatus === "review"
                                      ? "bg-amber-500"
                                      : "bg-red-500"
                                }`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getStatusIcon(currentStatus)}
                                  <span className="text-xs font-medium text-slate-500">{clause.clauseType}</span>
                                  {hasNotes && <StickyNote className="w-3 h-3 text-amber-500" />}
                                </div>
                                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{clause.text}</p>
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                  </div>
                </div>
              </div>
            )}

            {rightTab === "terms" && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Pre-Agreed Terms</h3>
                  <p className="text-xs text-slate-500">Terms entered during setup for reconciliation comparison</p>
                </div>

                {preAgreedTerms.length === 0 ? (
                  <Card className="p-6 shadow-sm rounded-xl border-slate-200 text-center">
                    <Info className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 mb-1">No pre-agreed terms loaded</p>
                    <p className="text-xs text-slate-400">Terms entered in the setup page will appear here</p>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {preAgreedTerms.map((term) => {
                      const matchingClause = clauses.find(
                        (c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType),
                      )
                      const currentStatus = matchingClause ? getClauseStatus(matchingClause) : "issue" // Default to issue if no matching clause
                      const isReconciled = currentStatus === "match"
                      const isRiskAccepted = riskAcceptedClauses.has(matchingClause?.id ?? -1)

                      return (
                        <Card
                          key={term.id}
                          className={`p-4 shadow-sm rounded-xl border-2 transition-all duration-500 ease-out ${
                            isReconciled
                              ? isRiskAccepted
                                ? "border-orange-300 bg-orange-50 scale-[1.02]"
                                : "border-emerald-200 bg-emerald-50 scale-[1.02]"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <Badge
                              variant="outline"
                              className={`text-xs transition-all duration-300 ${
                                isReconciled
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {term.clauseType}
                            </Badge>
                            {(isReconciled || isRiskAccepted) && (
                              <div className="flex items-center gap-1 animate-in fade-in slide-in-from-right duration-500">
                                {isRiskAccepted ? (
                                  <>
                                    <Shield className="w-3 h-3 text-orange-600" />
                                    <span className="text-xs font-medium text-orange-600">Risk Accepted</span>
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span className="text-xs font-medium text-emerald-600">Reconciled</span>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <div>
                              <p className="text-xs font-medium text-slate-700 mb-1">Expected Term:</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{term.expectedTerm}</p>
                            </div>

                            {term.notes && (
                              <div>
                                <p className="text-xs font-medium text-slate-700 mb-1">Notes:</p>
                                <p className="text-xs text-slate-500 leading-relaxed">{term.notes}</p>
                              </div>
                            )}

                            {matchingClause && (
                              <div className="mt-3 pt-3 border-t border-slate-200">
                                <p className="text-xs font-medium text-slate-700 mb-1">Contract Clause:</p>
                                <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">
                                  {matchingClause.text}
                                </p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="mt-2 text-xs h-7"
                                  onClick={() => handleClauseSelect(matchingClause)}
                                >
                                  View Full Clause →
                                </Button>
                              </div>
                            )}

                            {!matchingClause && (
                              <div className="mt-3 p-2 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-xs text-red-700">
                                  <AlertCircle className="w-3 h-3 inline mr-1" />
                                  No matching clause found in contract
                                </p>
                              </div>
                            )}
                          </div>
                        </Card>
                      )
                    })}
                  </div>
                )}

                {preAgreedTerms.length > 0 && (
                  <Card className="p-4 shadow-sm rounded-xl border-slate-200 bg-slate-50 mt-4">
                    <h4 className="text-xs font-semibold text-slate-700 mb-3">Reconciliation Summary</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Total Terms</span>
                        <span className="text-xs font-semibold text-slate-900">{preAgreedTerms.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Reconciled</span>
                        <span className="text-xs font-semibold text-emerald-600 transition-all duration-300">
                          {
                            preAgreedTerms.filter((term) => {
                              const matchingClause = clauses.find(
                                (c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType),
                              )
                              return (
                                matchingClause &&
                                getClauseStatus(matchingClause) === "match" &&
                                !riskAcceptedClauses.has(matchingClause.id)
                              )
                            }).length
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Risk Accepted</span>
                        <span className="text-xs font-semibold text-orange-600 transition-all duration-300">
                          {
                            preAgreedTerms.filter((term) => {
                              const matchingClause = clauses.find(
                                (c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType),
                              )
                              return (
                                matchingClause &&
                                getClauseStatus(matchingClause) === "match" &&
                                riskAcceptedClauses.has(matchingClause.id)
                              )
                            }).length
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Pending Review</span>
                        <span className="text-xs font-semibold text-amber-600 transition-all duration-300">
                          {
                            preAgreedTerms.filter((term) => {
                              const matchingClause = clauses.find(
                                (c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType),
                              )
                              return matchingClause && getClauseStatus(matchingClause) === "review"
                            }).length
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Issue</span>
                        <span className="text-xs font-semibold text-red-600">
                          {
                            preAgreedTerms.filter((term) => {
                              const matchingClause = clauses.find(
                                (c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType),
                              )
                              return matchingClause && getClauseStatus(matchingClause) === "issue"
                            }).length
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-600">Not Found</span>
                        <span className="text-xs font-semibold text-red-600">
                          {
                            preAgreedTerms.filter(
                              (term) =>
                                !clauses.find((c) => normalizeClauseType(c.clauseType) === normalizeClauseType(term.clauseType)),
                            ).length
                          }
                        </span>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {rightTab === "comments" && (
              <div className="text-center py-12">
                <p className="text-sm text-slate-500">No comments yet</p>
              </div>
            )}

            {rightTab === "library" && (
              <div className="space-y-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-1">Legal Clause Library</h3>
                  <p className="text-xs text-slate-500">Sample clauses for reference and comparison</p>
                </div>
                {libraryClausesSample.map((libClause) => (
                  <Card key={libClause.id} className="p-4 shadow-sm rounded-xl border-slate-200">
                    <div className="mb-2">
                      <h4 className="text-sm font-semibold text-slate-800 mb-1">{libClause.title}</h4>
                      <Badge variant="outline" className="text-xs">
                        {libClause.category}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-600 mb-3 leading-relaxed">{libClause.text}</p>
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-blue-700">
                        <strong>Usage:</strong> {libClause.usage}
                      </p>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            </div>
          </div>
        </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {chatBuddyVisible && (
        <div
          ref={chatBuddyRef}
          className={`fixed w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group z-50 ${
            isDragging ? "cursor-grabbing scale-110" : "cursor-grab"
          }`}
          style={{
            left: `${chatBuddyPosition.x}px`,
            top: `${chatBuddyPosition.y}px`,
          }}
          onMouseDown={handleMouseDown}
          onClick={(e) => {
            if (!isDragging) {
              e.stopPropagation()
              handleToggleChatWindow()
            }
          }}
          title="Chat with your contract - Click to open, drag to move"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />

          {/* Close button */}
          <button
            className="absolute -top-2 -right-2 w-5 h-5 bg-slate-700 hover:bg-slate-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              handleDismissChatBuddy()
            }}
            title="Dismiss chat buddy"
          >
            ×
          </button>

          {/* Tooltip */}
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-slate-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none">
            Chat with Contract
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-900" />
          </div>
        </div>
      )}

      {chatWindowOpen && (
        <div
          ref={chatWindowRef}
          className="fixed w-[400px] h-[600px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col z-50 animate-in fade-in slide-in-from-bottom-4 duration-300"
          style={{
            left: `${chatWindowPosition.x}px`,
            top: `${chatWindowPosition.y}px`,
          }}
        >
          {/* Header */}
          <div
            className={`flex items-center justify-between p-4 border-b border-slate-200 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-2xl ${
              isChatDragging ? "cursor-grabbing" : "cursor-grab"
            }`}
            onMouseDown={handleChatMouseDown}
          >
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              <div>
                <h3 className="text-sm font-semibold">Contract Assistant</h3>
                <p className="text-xs opacity-90">
                  {selectedClause ? selectedClause.clauseType : "Master Services Agreement"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="w-7 h-7 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors"
                onClick={() => setChatWindowOpen(false)}
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
              <button
                className="w-7 h-7 hover:bg-white/20 rounded-lg flex items-center justify-center transition-colors"
                onClick={() => setChatWindowOpen(false)}
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* AI Welcome Message */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Hi! I'm your Contract Assistant. I can help you analyze and understand the clauses in your Master
                    Services Agreement.
                  </p>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-1">Just now</p>
              </div>
            </div>

            {/* AI Capabilities Message */}
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="bg-slate-100 rounded-2xl rounded-tl-sm p-3">
                  <p className="text-sm text-slate-700 leading-relaxed mb-2">I can help you with:</p>
                  <ul className="text-sm text-slate-600 space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>Explaining specific clauses in plain language</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>Comparing clauses with your pre-agreed terms</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>Identifying potential risks or concerns</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>Suggesting improvements or alternatives</span>
                    </li>
                  </ul>
                </div>
                <p className="text-xs text-slate-400 mt-1 ml-1">Just now</p>
              </div>
            </div>

            {/* Current Clause Context */}
            {selectedClause && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1">
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl rounded-tl-sm p-3">
                    <p className="text-xs font-semibold text-blue-900 mb-1">Currently viewing:</p>
                    <p className="text-sm text-blue-700 font-medium mb-2">{selectedClause.clauseType}</p>
                    <p className="text-xs text-blue-600 leading-relaxed">
                      Ask me anything about this clause, or type "explain" to get a detailed breakdown.
                    </p>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 ml-1">Just now</p>
                </div>
              </div>
            )}

            {/* Placeholder for future messages */}
            <div className="text-center py-4">
              <p className="text-xs text-slate-400 italic">Start typing to chat with your contract...</p>
            </div>
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  placeholder="Ask about this contract..."
                  className="w-full p-3 text-sm border border-slate-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                  rows={2}
                  disabled
                />
              </div>
              <Button
                size="sm"
                className="h-10 w-10 bg-blue-500 hover:bg-blue-600 rounded-xl flex-shrink-0"
                disabled
                title="Coming soon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-400 mt-2 text-center">
              <Info className="w-3 h-3 inline mr-1" />
              Chat functionality coming soon
            </p>
          </div>
        </div>
      )}

      {/* Chat buddy icon removed - now using toolbar button instead */}

      {/* Suggested Redlines Modal - Always rendered, visibility controlled by open prop */}
      <SuggestedRedlinesModal
        open={suggestedRedlinesModalOpen && !!selectedClause && (selectedClauseRedlines?.length || 0) > 0}
        onOpenChange={setSuggestedRedlinesModalOpen}
        clauseType={selectedClause?.clauseType || ""}
        originalText={selectedClause?.originalText || selectedClause?.text || ""}
        redlines={selectedClauseRedlines || []}
        onAcceptChanges={handleAcceptRedline}
        isAccepting={isAcceptingRedline}
      />
    </div>
  )
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <ReconciliationContent />
    </Suspense>
  )
}
