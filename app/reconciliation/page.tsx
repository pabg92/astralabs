"use client"

import type React from "react"

import { useState, useEffect, useRef, Suspense, useMemo } from "react"
import dynamic from "next/dynamic"
import confetti from "canvas-confetti"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
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
} from "lucide-react"
import type { JSX } from "react/jsx-runtime"
import { useRouter, useSearchParams } from "next/navigation"
import { useToast } from "@/hooks/use-toast"

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

interface Clause {
  id: number
  clauseBoundaryId?: string // Database ID for API calls
  text: string
  status: ClauseStatus
  summary: string
  confidence: number
  position: { start: number; end: number }
  clauseType: string
  riskAccepted?: boolean // Added risk accepted flag
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

const mockClauses: Clause[] = [
  {
    id: 1,
    text: "The Contractor shall provide software development, consulting, and technical advisory services as detailed in the Statement of Work attached hereto as Exhibit A. The Contractor shall complete all work within 90 days of contract execution, with milestone deliverables due at 30-day intervals. All work shall be performed in accordance with industry best practices and applicable professional standards.",
    status: "review",
    summary: "Defines Contractor responsibilities, deliverables, and 90-day timeline. Industry standard.",
    confidence: 96,
    position: calculateClausePosition("1. SCOPE OF WORK", "applicable professional standards."),
    clauseType: "Scope of Work",
  },
  {
    id: 2,
    text: "Client agrees to pay Contractor a total fee of $250,000 for the services rendered under this Agreement. Payment shall be made in three installments: (i) $83,333 upon execution of this Agreement; (ii) $83,333 upon completion of Phase 1 deliverables; and (iii) $83,334 upon final delivery and acceptance. Payment terms are Net 45 days from invoice date. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by law, whichever is less.",
    status: "review",
    summary: "Three-installment payment schedule with Net 45 terms and standard late payment clause.",
    confidence: 93,
    position: calculateClausePosition("2. PAYMENT TERMS", "whichever is less."),
    clauseType: "Payment Terms",
  },
  {
    id: 3,
    text: "The Contractor agrees to deliver all specified work products in accordance with the project timeline and quality standards outlined in Exhibit A. Client shall have 15 business days to review and accept or reject deliverables. Acceptance shall not be unreasonably withheld. Any rejected deliverables must be accompanied by specific written feedback, and Contractor shall have 10 business days to cure any deficiencies.",
    status: "review",
    summary: "Acceptance and rejection terms reasonable but may need clearer objective acceptance criteria.",
    confidence: 81,
    position: calculateClausePosition("3. DELIVERABLES AND ACCEPTANCE", "cure any deficiencies."),
    clauseType: "Deliverables",
  },
  {
    id: 4,
    text: 'All work product, including but not limited to software code, documentation, designs, and related materials created by Contractor in the performance of services under this Agreement shall be considered "work made for hire" under U.S. copyright law. To the extent any work product does not qualify as work made for hire, Contractor hereby assigns all right, title, and interest in such work product to Client. Contractor retains ownership of any pre-existing intellectual property and grants Client a perpetual, worldwide, non-exclusive license to use such pre-existing materials as incorporated into the deliverables.',
    status: "review",
    summary: "Client owns work product; Contractor retains pre-existing IP under perpetual license.",
    confidence: 95,
    position: calculateClausePosition("4. INTELLECTUAL PROPERTY RIGHTS", "incorporated into the deliverables."),
    clauseType: "Intellectual Property",
  },
  {
    id: 5,
    text: 'Both parties agree to maintain confidentiality of all proprietary information shared during the course of this engagement. "Confidential Information" includes, but is not limited to, trade secrets, business plans, technical data, customer lists, and financial information. Each party shall protect Confidential Information with the same degree of care it uses to protect its own confidential information, but in no event less than reasonable care. This obligation shall survive termination of this Agreement for a period of five years.',
    status: "review",
    summary: "Five-year confidentiality obligation; mutual protection and reasonable care standard.",
    confidence: 97,
    position: calculateClausePosition("5. CONFIDENTIALITY", "for a period of five years."),
    clauseType: "Confidentiality",
  },
  {
    id: 6,
    text: "Contractor warrants that: (i) it has the right and authority to enter into this Agreement; (ii) the services will be performed in a professional and workmanlike manner; (iii) the deliverables will be free from material defects for a period of 90 days following acceptance; and (iv) the deliverables will not infringe upon any third-party intellectual property rights. Client warrants that it has the authority to enter into this Agreement and will provide timely feedback and necessary resources for Contractor to perform the services.",
    status: "review",
    summary: "Good coverage but 90-day warranty window may be too short; consider expansion to 180 days.",
    confidence: 79,
    position: calculateClausePosition("6. WARRANTIES AND REPRESENTATIONS", "Contractor to perform the services."),
    clauseType: "Warranties",
  },
  {
    id: 7,
    text: "Except for breaches of confidentiality or intellectual property provisions, neither party shall be liable for any indirect, incidental, consequential, or punitive damages arising out of this Agreement. Contractor's total liability under this Agreement is capped at 50% of the total fees paid or payable under this Agreement. This limitation shall not apply to damages arising from gross negligence or willful misconduct.",
    status: "issue",
    summary: "Liability cap (50%) may be too low for project value; review and renegotiate upward.",
    confidence: 68,
    position: calculateClausePosition("7. LIMITATION OF LIABILITY", "gross negligence or willful misconduct."),
    clauseType: "Liability Cap",
  },
  {
    id: 8,
    text: "Each party agrees to indemnify, defend, and hold harmless the other party from and against any claims, damages, losses, and expenses (including reasonable attorneys' fees) arising out of: (i) breach of this Agreement; (ii) negligence or willful misconduct; or (iii) violation of applicable laws. Contractor shall indemnify Client against any third-party claims alleging that the deliverables infringe intellectual property rights.",
    status: "issue",
    summary: "Mutual indemnification with IP indemnity from Contractor; balanced and standard.",
    confidence: 95,
    position: calculateClausePosition("8. INDEMNIFICATION", "infringe intellectual property rights."),
    clauseType: "Indemnification",
  },
  {
    id: 9,
    text: "This Agreement shall commence on the Effective Date and continue until completion of all services, unless earlier terminated as provided herein. Either party may terminate this Agreement with 30 days written notice. Client may terminate immediately for cause upon written notice if Contractor materially breaches this Agreement and fails to cure within 15 days. Upon termination, Client shall pay Contractor for all services performed and expenses incurred through the termination date.",
    status: "issue",
    summary: "30-day notice termination with cure window; includes pro-rata payment clause.",
    confidence: 92,
    position: calculateClausePosition("9. TERM AND TERMINATION", "through the termination date."),
    clauseType: "Termination",
  },
  {
    id: 10,
    text: "Any disputes arising under this Agreement shall first be subject to good faith negotiation between the parties' senior executives. If not resolved within 30 days, the dispute shall be submitted to binding arbitration in accordance with the Commercial Arbitration Rules of the American Arbitration Association. The arbitration shall be conducted in San Francisco, California. The prevailing party shall be entitled to recover reasonable attorneys' fees and costs.",
    status: "review", // Changed from "improve" to "review" as per new types
    summary: "Arbitration clause in San Francisco; consider mediation or flexible venue options.",
    confidence: 83,
    position: calculateClausePosition("10. DISPUTE RESOLUTION", "reasonable attorneys' fees and costs."),
    clauseType: "Dispute Resolution",
  },
  {
    id: 11,
    text: "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of laws principles. This Agreement constitutes the entire agreement between the parties and supersedes all prior agreements and understandings. No modification shall be effective unless in writing and signed by both parties. If any provision is found unenforceable, the remaining provisions shall remain in full force and effect. Neither party may assign this Agreement without the prior written consent of the other party.",
    status: "review", // Changed from "info" to "review" as per new types
    summary: "Standard boilerplate (Delaware law, entire agreement, assignment, severability).",
    confidence: 99,
    position: calculateClausePosition("11. GENERAL PROVISIONS", "written consent of the other party."),
    clauseType: "General Provisions",
  },
]

const preAgreedTermsSample: PreAgreedTerm[] = [
  {
    id: "pat-1",
    clauseType: "Scope of Work",
    expectedTerm:
      "Contractor to provide software development, consulting, and technical advisory services as detailed in Exhibit A. Work to be completed within 90 days, with milestone deliverables due at 30-day intervals. All work performed in accordance with industry best practices and applicable professional standards.",
    notes: "Ensure specific deliverables and timelines are detailed in Exhibit A.",
  },
  {
    id: "pat-2",
    clauseType: "Payment Terms",
    expectedTerm:
      "Total fee of $250,000, payable in three installments: upon execution, completion of Phase 1, and upon final delivery and acceptance. Payment terms are Net 45 days from invoice date. Late payments accrue interest at 1.5% per month.",
    notes: "Confirm specific amounts for each installment and the final acceptance criteria.",
  },
  {
    id: "pat-3",
    clauseType: "Deliverables",
    expectedTerm:
      "Client has 15 business days to review and accept/reject deliverables, providing specific written feedback for rejections. Contractor has 10 business days to cure deficiencies.",
    notes: "Consider objective criteria for acceptance to avoid disputes.",
  },
  {
    id: "pat-4",
    clauseType: "Intellectual Property",
    expectedTerm:
      "All work product created by Contractor is considered 'work made for hire' and owned by Client. Contractor retains ownership of pre-existing IP and grants Client a perpetual, non-exclusive license.",
    notes: "Clarify what constitutes 'pre-existing intellectual property'.",
  },
  {
    id: "pat-5",
    clauseType: "Confidentiality",
    expectedTerm:
      "Mutual confidentiality obligation for proprietary information for five years post-termination, with both parties using reasonable care to protect information.",
    notes: "Define 'proprietary information' broadly.",
  },
]

function ReconciliationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dealId = searchParams.get("dealId")
  const { toast } = useToast()

  // State for clauses loaded from API or fallback to mock
  const [clauses, setClauses] = useState<Clause[]>(mockClauses)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [exportingText, setExportingText] = useState(false)
  const [exportingJSON, setExportingJSON] = useState(false)
  const [hasPdf, setHasPdf] = useState(false) // Phase 9: Track PDF availability

  const [selectedClause, setSelectedClause] = useState<Clause | null>(null)
  const [activeFilter, setActiveFilter] = useState<ClauseStatus | "all">("all")
  const [showHighlights, setShowHighlights] = useState(true)
  const [activeTab, setActiveTab] = useState<"overview" | "pdf">("overview") // Changed initial state to "overview"
  const [rightTab, setRightTab] = useState<"review" | "comments" | "library" | "terms">("review")
  const [pdfZoom, setPdfZoom] = useState<"fit" | "page" | 50 | 75 | 100 | 125 | 150 | 200>("fit") // Phase 9: Shared zoom state
  const [clauseStatuses, setClauseStatuses] = useState<Record<number, ClauseStatus>>({})
  const [clauseNotes, setClauseNotes] = useState<Record<number, string>>({})
  const [currentNote, setCurrentNote] = useState<string>("")
  const [noteSaved, setNoteSaved] = useState(false)
  const [showSummary, setShowSummary] = useState(true) // Added toggle for AI summary
  const [riskAcceptedClauses, setRiskAcceptedClauses] = useState<Set<number>>(new Set()) // Track risk accepted clauses

  // State for pre-agreed terms and contract file name
  const [preAgreedTerms, setPreAgreedTerms] = useState<PreAgreedTerm[]>(preAgreedTermsSample)
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
  const chatWindowRef = useRef<HTMLDivElement>(null)

  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()

  // Fetch reconciliation data from API
  useEffect(() => {
    const fetchReconciliationData = async () => {
      // If no dealId, use mock data
      if (!dealId) {
        console.log("No dealId provided, using mock data")
        setClauses(mockClauses)
        setSelectedClause(mockClauses[0])
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setLoadError(null)

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
            let effectiveStatus = mapRAGStatusToClauseStatus(matchResult.rag_status)
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

        // Set clauses and select first one
        if (apiClauses.length > 0) {
          setClauses(apiClauses)
          setSelectedClause(apiClauses[0])

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
        } else {
          // No clauses found, fallback to mock
          console.warn("No clauses found in API response, using mock data")
          setClauses(mockClauses)
          setSelectedClause(mockClauses[0])
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

        setLoading(false)
      } catch (error) {
        console.error("Error loading reconciliation data:", error)
        setLoadError(error instanceof Error ? error.message : "Failed to load data")

        // Fallback to mock data on error
        setClauses(mockClauses)
        setSelectedClause(mockClauses[0])
        setLoading(false)
      }
    }

    fetchReconciliationData()
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
    // Save current state to localStorage before navigating
    localStorage.setItem("clauseStatuses", JSON.stringify(clauseStatuses))
    localStorage.setItem("clauseNotes", JSON.stringify(clauseNotes)) // Also save notes
    router.push("/reconciliation/complete")
  }

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
      await fetch(`/api/reconciliation/${dealId}/clauses/${clause.clauseBoundaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, risk_accepted: riskAccepted, comments }),
      })
    } catch (error) {
      console.error("Failed to save clause review:", error)
    }
  }

  const handleReject = () => {
    if (!selectedClause) return

    setClauseStatuses((prev) => ({
      ...prev,
      [selectedClause.id]: "issue",
    }))

    // Persist to backend
    saveClauseReview(selectedClause, "rejected")

    // Automatically move to the next clause if available
    setTimeout(() => {
      const currentIndex = filteredClauses.findIndex((c) => c.id === selectedClause?.id)
      if (currentIndex < filteredClauses.length - 1) {
        handleClauseSelect(filteredClauses[currentIndex + 1])
      }
    }, 300)
  }

  useEffect(() => {
    const savedTerms = localStorage.getItem("preAgreedTerms")
    const savedFileName = localStorage.getItem("contractFileName")
    const savedStatuses = localStorage.getItem("clauseStatuses")
    const savedNotes = localStorage.getItem("clauseNotes")
    const savedRiskAccepted = localStorage.getItem("riskAcceptedClauses")

    if (savedTerms) {
      setPreAgreedTerms(JSON.parse(savedTerms))
    } else {
      // If no saved terms, load sample terms
      setPreAgreedTerms(preAgreedTermsSample)
      localStorage.setItem("preAgreedTerms", JSON.stringify(preAgreedTermsSample))
    }

    if (savedFileName) {
      setContractFileName(savedFileName)
    }

    if (savedStatuses) {
      setClauseStatuses(JSON.parse(savedStatuses))
    }

    if (savedNotes) {
      setClauseNotes(JSON.parse(savedNotes))
      // If notes are loaded, set the current note if a clause is selected
      if (selectedClause && JSON.parse(savedNotes)[selectedClause.id]) {
        setCurrentNote(JSON.parse(savedNotes)[selectedClause.id])
      }
    }

    if (savedRiskAccepted) {
      setRiskAcceptedClauses(new Set(JSON.parse(savedRiskAccepted)))
    }
  }, [selectedClause]) // Depend on selectedClause to update currentNote when it changes

  const getClauseStatus = (clause: Clause): ClauseStatus => {
    return clauseStatuses[clause.id] ?? clause.status
  }

  const statusCounts = {
    match: clauses.filter((c) => getClauseStatus(c) === "match").length,
    review: clauses.filter((c) => getClauseStatus(c) === "review").length,
    issue: clauses.filter((c) => getClauseStatus(c) === "issue").length,
  }

  const filteredClauses =
    activeFilter === "all" ? clauses : clauses.filter((c) => getClauseStatus(c) === activeFilter)

  const clauseHighlights = useMemo(
    () =>
      clauses.map((clause) => ({
        id: clause.id,
        text: clause.text,
        status: getClauseStatus(clause),
      })),
    [clauses, clauseStatuses, riskAcceptedClauses],
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

  const handleReset = () => {
    setClauseStatuses({})
    setActiveFilter("all")
    setClauses(mockClauses)
    setSelectedClause(mockClauses[0])
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

  const findMatchingTerm = (clause: Clause): PreAgreedTerm | null => {
    return preAgreedTerms.find((term) => term.clauseType.toLowerCase() === clause.clauseType.toLowerCase()) || null
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
      const sortedClauses = [...mockClauses].sort((a, b) => a.position.start - b.position.start)

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
            className={`relative cursor-pointer transition-all duration-200 rounded-md px-1 ${
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
      <div className="space-y-6">
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
              className={`relative cursor-pointer transition-all duration-200 rounded-lg p-4 border-2 ${borderColor} ${
                isSelected ? "ring-2 ring-slate-400 ring-offset-2" : "hover:shadow-md"
              }`}
              onClick={() => handleClauseSelect(clause)}
              style={{ backgroundColor }}
              data-clause-highlight-id={clause.id}
              id={`clause-text-${clause.id}`}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-xs font-medium ${
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
                    <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-300">
                      <Shield className="w-3 h-3 mr-1" />
                      Risk Accepted
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    Pages {clause.position.start}-{clause.position.end} • {Math.round(clause.confidence * 100)}%
                  </span>
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

  const handleApprove = () => {
    if (!selectedClause) return

    const isRiskAccepted = riskAcceptedClauses.has(selectedClause.id)

    setClauseStatuses((prev) => ({
      ...prev,
      [selectedClause.id]: "match",
    }))

    // Persist to backend
    saveClauseReview(selectedClause, "approved", isRiskAccepted)

    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#10b981", "#34d399", "#6ee7b7"],
    })

    // Automatically move to the next clause if available
    setTimeout(() => {
      const currentIndex = filteredClauses.findIndex((c) => c.id === selectedClause?.id)
      if (currentIndex < filteredClauses.length - 1) {
        handleClauseSelect(filteredClauses[currentIndex + 1])
      } else {
        // If it's the last clause, maybe show a confirmation or move to completion
        // For now, let's just log it
        console.log("Last clause approved.")
      }
    }, 500)
  }

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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex h-screen">
        {/* Left Column - Progress & Filters */}
        <div className="w-[28%] border-r border-slate-200 bg-white p-6 overflow-y-auto">
          <div className="sticky top-0">
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Contract Review Progress</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/reconciliation/complete")}
                    className="text-slate-500 hover:text-slate-700"
                    title="Skip to completion page"
                  >
                    <SkipForward className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    className="rounded-lg bg-transparent"
                    title="Reset all settings"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                </div>
              </div>

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
                    {Math.round((statusCounts.match / mockClauses.length) * 100)}%
                  </span>
                </div>
                <Progress
                  value={(statusCounts.match / mockClauses.length) * 100}
                  className="h-2 transition-all duration-500 ease-out"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {statusCounts.match} of {mockClauses.length} clauses approved
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
            </Card>

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
              <Button onClick={handleCompleteReview} className="w-full bg-blue-500 hover:bg-blue-600 rounded-lg">
                Complete Review →
              </Button>
            </div>
          </div>
        </div>

        {/* Center Column - PDF Viewer */}
        <div className="w-[44%] flex flex-col bg-white">
          {/* Toolbar */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <Button
                  variant={activeTab === "overview" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setActiveTab("overview")}
                  className="rounded-lg"
                >
                  Overview
                </Button>
                <Button
                  variant={activeTab === "pdf" ? "default" : "ghost"} // Changed to "pdf"
                  size="sm"
                  onClick={() => setActiveTab("pdf")}
                  className="rounded-lg"
                >
                  PDF
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={showHighlights ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowHighlights(!showHighlights)}
                  className="rounded-lg"
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
              <div className="max-w-3xl mx-auto">
                <Card className="p-8 shadow-sm rounded-2xl border-slate-200">
                  <div className="prose prose-slate max-w-none">
                    <div className="text-slate-800 leading-relaxed whitespace-pre-wrap font-serif">
                      {renderTextWithHighlights()}
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
        </div>

        {/* Right Column - Clause Review */}
        <div className="w-[28%] border-l border-slate-200 bg-white flex flex-col">
          {/* Tabs */}
          <div className="border-b border-slate-200 p-4">
            <div className="flex items-center gap-1">
              <Button
                variant={rightTab === "review" ? "default" : "ghost"}
                size="sm"
                onClick={() => setRightTab("review")}
                className="rounded-lg flex-1"
              >
                Review
              </Button>
              <Button
                variant={rightTab === "terms" ? "default" : "ghost"}
                size="sm"
                onClick={() => setRightTab("terms")}
                className="rounded-lg flex-1"
              >
                Terms
              </Button>
              <Button
                variant={rightTab === "comments" ? "default" : "ghost"}
                size="sm"
                onClick={() => setRightTab("comments")}
                className="rounded-lg flex-1"
              >
                Comments
              </Button>
              <Button
                variant={rightTab === "library" ? "default" : "ghost"}
                size="sm"
                onClick={() => setRightTab("library")}
                className="rounded-lg flex-1"
              >
                Library
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
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
                              <span>•</span>
                              <span>{selectedClause.confidence}% confidence</span>
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

                  {/* Phase 10 Task C: Display matched template and RAG assessment data */}
                  {selectedClause.matchedTemplate && (
                    <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Info className="w-4 h-4 text-blue-600" />
                        <h4 className="text-xs font-semibold text-blue-900">Template Match</h4>
                      </div>
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
                    </div>
                  )}

                  {/* Phase 10 Task C: Display RAG parsing and risk assessment */}
                  {(selectedClause.ragParsing || selectedClause.ragRisk) && (
                    <div className="bg-purple-50 rounded-xl border border-purple-200 p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="w-4 h-4 text-purple-600" />
                        <h4 className="text-xs font-semibold text-purple-900">RAG Assessment</h4>
                      </div>
                      <div className="space-y-2">
                        {selectedClause.ragParsing && (
                          <div>
                            <p className="text-xs font-medium text-purple-700 mb-1">Parsing Status:</p>
                            <p className="text-xs text-purple-600">{selectedClause.ragParsing}</p>
                          </div>
                        )}
                        {selectedClause.ragRisk && (
                          <div>
                            <p className="text-xs font-medium text-purple-700 mb-1">Risk Analysis:</p>
                            <p className="text-xs text-purple-600 leading-relaxed">{selectedClause.ragRisk}</p>
                          </div>
                        )}
                      </div>
                    </div>
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

                  <div className="flex gap-2">
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
                </Card>

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
                      const matchingClause = mockClauses.find(
                        (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
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
                              const matchingClause = mockClauses.find(
                                (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
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
                              const matchingClause = mockClauses.find(
                                (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
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
                              const matchingClause = mockClauses.find(
                                (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
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
                              const matchingClause = mockClauses.find(
                                (c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase(),
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
                                !mockClauses.find((c) => c.clauseType.toLowerCase() === term.clauseType.toLowerCase()),
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
