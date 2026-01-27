"use client"

import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Database,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
  Zap,
  AlertTriangle,
  ArrowRight,
  Copy,
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import type {
  LCL,
  LCSTXWithConcept,
  MatchingResult,
  RiskLevel,
  RAGStatus,
  PATContext,
  MatchExplanation,
} from "@/lib/sandbox-v2/types"
import { MatchFlipCard, OtherMatchExplanationPopover } from "@/components/sandbox/match-flip-card"
import { V2_THRESHOLDS } from "@/lib/sandbox-v2/thresholds"

// ============================================================================
// HELPERS
// ============================================================================

const getRiskBadge = (risk: RiskLevel) => {
  const styles: Record<RiskLevel, string> = {
    low: "bg-green-500 hover:bg-green-600",
    medium: "bg-yellow-500 hover:bg-yellow-600",
    high: "bg-orange-500 hover:bg-orange-600",
  }
  const icons: Record<RiskLevel, React.ReactNode> = {
    low: <ShieldCheck className="h-3 w-3 mr-1" />,
    medium: <Shield className="h-3 w-3 mr-1" />,
    high: <ShieldAlert className="h-3 w-3 mr-1" />,
  }
  return (
    <Badge className={`${styles[risk]} flex items-center`}>
      {icons[risk]}
      {risk}
    </Badge>
  )
}

const getRAGBadge = (status: RAGStatus) => {
  const styles: Record<RAGStatus, string> = {
    GREEN: "bg-green-500",
    AMBER: "bg-amber-500",
    RED: "bg-red-500",
  }
  return <Badge className={styles[status]}>{status}</Badge>
}

const generateVariantCode = (conceptCode: string, existingVariants: LCSTXWithConcept[]): string => {
  const conceptVariants = existingVariants.filter(
    v => v.lcl?.concept_code === conceptCode
  )
  const existingNumbers = conceptVariants
    .map(v => {
      const match = v.variant_code.match(/-(\d{3})$/)
      return match ? parseInt(match[1], 10) : 0
    })
    .filter(n => !isNaN(n))
  const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1
  return `${conceptCode}-${String(nextNumber).padStart(3, "0")}`
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function SandboxWorkbench() {
  // Data state
  const [concepts, setConcepts] = useState<LCL[]>([])
  const [variants, setVariants] = useState<LCSTXWithConcept[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterRisk, setFilterRisk] = useState<string>("all")

  // Match state
  const [inputText, setInputText] = useState("")
  const [matchResult, setMatchResult] = useState<MatchingResult | null>(null)
  const [matching, setMatching] = useState(false)
  const [matchError, setMatchError] = useState<string | null>(null)

  // PAT context state
  const [patEnabled, setPatEnabled] = useState(false)
  const [patContext, setPatContext] = useState<PATContext>({
    term_category: "",
    expected_value: "",
    is_mandatory: true,
  })

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [selectedVariant, setSelectedVariant] = useState<LCSTXWithConcept | null>(null)

  // Form state
  const [formConceptId, setFormConceptId] = useState<string>("")
  const [formCreateNewType, setFormCreateNewType] = useState(false)
  const [formNewTypeCode, setFormNewTypeCode] = useState("")
  const [formNewTypeCategory, setFormNewTypeCategory] = useState("")
  const [formNewTypeName, setFormNewTypeName] = useState("")
  const [formVariantCode, setFormVariantCode] = useState("")
  const [formRiskLevel, setFormRiskLevel] = useState<RiskLevel>("medium")
  const [formCanonicalText, setFormCanonicalText] = useState("")
  const [formPlainEnglish, setFormPlainEnglish] = useState("")
  const [saving, setSaving] = useState(false)

  // Results collapsible
  const [otherMatchesOpen, setOtherMatchesOpen] = useState(false)

  // Explanation cache
  const [explanationCache, setExplanationCache] = useState<Map<string, MatchExplanation>>(new Map())

  const handleExplanationLoaded = (variantCode: string, explanation: MatchExplanation) => {
    setExplanationCache((prev) => {
      const next = new Map(prev)
      next.set(variantCode, explanation)
      return next
    })
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [conceptsRes, variantsRes] = await Promise.all([
        fetch("/api/sandbox-v2/lcl"),
        fetch("/api/sandbox-v2/lcstx"),
      ])

      const conceptsData = await conceptsRes.json()
      const variantsData = await variantsRes.json()

      if (conceptsData.success) {
        setConcepts(conceptsData.data)
      }
      if (variantsData.success) {
        setVariants(variantsData.data)
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ============================================================================
  // MATCHING
  // ============================================================================

  const runMatch = useCallback(async (text: string) => {
    if (!text.trim() || text.length < 10) {
      setMatchResult(null)
      return
    }

    setMatching(true)
    setMatchError(null)

    try {
      const body: Record<string, unknown> = {
        text,
        similarity_threshold: 0.5,
        max_results: 10,
        record_result: false,
      }

      // Include PAT context if enabled and filled
      if (patEnabled && patContext.term_category && patContext.expected_value) {
        body.pat_context = patContext
      }

      const response = await fetch("/api/sandbox-v2/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await response.json()
      if (data.success) {
        setMatchResult(data.data)
      } else {
        setMatchError(data.error || "Match failed")
      }
    } catch (err) {
      setMatchError("Failed to connect to API")
    } finally {
      setMatching(false)
    }
  }, [patEnabled, patContext])

  // Debounced matching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputText.trim().length >= 10) {
        runMatch(inputText)
        // Clear explanation cache when input changes
        setExplanationCache(new Map())
      } else {
        setMatchResult(null)
        setExplanationCache(new Map())
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [inputText, runMatch])

  // ============================================================================
  // DIALOG HANDLERS
  // ============================================================================

  const openAddDialog = (prefillText?: string) => {
    setDialogMode("add")
    setSelectedVariant(null)
    setFormConceptId("")
    setFormCreateNewType(false)
    setFormNewTypeCode("")
    setFormNewTypeCategory("")
    setFormNewTypeName("")
    setFormVariantCode("")
    setFormRiskLevel("medium")
    setFormCanonicalText(prefillText || inputText)
    setFormPlainEnglish("")
    setDialogOpen(true)
  }

  const openEditDialog = (variant: LCSTXWithConcept) => {
    setDialogMode("edit")
    setSelectedVariant(variant)
    setFormConceptId(variant.lcl_id)
    setFormVariantCode(variant.variant_code)
    setFormRiskLevel(variant.risk_level)
    setFormCanonicalText(variant.canonical_text)
    setFormPlainEnglish(variant.plain_english || "")
    setDialogOpen(true)
  }

  const handleClauseTypeSelect = (value: string) => {
    if (value === "new") {
      setFormCreateNewType(true)
      setFormConceptId("")
      setFormVariantCode("")
    } else {
      setFormCreateNewType(false)
      setFormConceptId(value)
      const concept = concepts.find(c => c.id === value)
      if (concept) {
        setFormVariantCode(generateVariantCode(concept.concept_code, variants))
      }
    }
  }

  const handleNewTypeCodeChange = (code: string) => {
    const upperCode = code.toUpperCase()
    setFormNewTypeCode(upperCode)
    if (upperCode) {
      setFormVariantCode(generateVariantCode(upperCode, variants))
    } else {
      setFormVariantCode("")
    }
  }

  const handleSave = async () => {
    if (dialogMode === "add") {
      if (formCreateNewType) {
        if (!formNewTypeCode || !formNewTypeCategory || !formNewTypeName) {
          alert("Please fill in all new type fields (Code, Category, Name)")
          return
        }
      } else if (!formConceptId) {
        alert("Please select a clause type")
        return
      }
    }
    if (!formVariantCode || !formCanonicalText) {
      alert("Please fill in all required fields")
      return
    }

    setSaving(true)
    try {
      let lclId = formConceptId

      // Create new clause type if needed
      if (dialogMode === "add" && formCreateNewType) {
        const typeRes = await fetch("/api/sandbox-v2/lcl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            concept_code: formNewTypeCode,
            category: formNewTypeCategory,
            display_name: formNewTypeName,
          }),
        })

        const typeData = await typeRes.json()
        if (!typeData.success) {
          alert(typeData.error || "Failed to create clause type")
          setSaving(false)
          return
        }
        lclId = typeData.data.id
      }

      if (dialogMode === "add") {
        const variantRes = await fetch("/api/sandbox-v2/lcstx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lcl_id: lclId,
            variant_code: formVariantCode,
            risk_level: formRiskLevel,
            canonical_text: formCanonicalText,
            plain_english: formPlainEnglish || null,
            generate_embedding: true,
          }),
        })

        const variantData = await variantRes.json()
        if (!variantData.success) {
          alert(variantData.error || "Failed to create variant")
          setSaving(false)
          return
        }
      } else {
        // Edit mode
        const variantRes = await fetch(`/api/sandbox-v2/lcstx/${selectedVariant?.variant_code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            risk_level: formRiskLevel,
            canonical_text: formCanonicalText,
            plain_english: formPlainEnglish || null,
            regenerate_embedding: true,
          }),
        })

        const variantData = await variantRes.json()
        if (!variantData.success) {
          alert(variantData.error || "Failed to update variant")
          setSaving(false)
          return
        }
      }

      setDialogOpen(false)
      fetchData()
      // Re-run match to see updated results
      if (inputText.trim()) {
        setTimeout(() => runMatch(inputText), 500)
      }
    } catch (error) {
      console.error("Save failed:", error)
      alert("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (variantCode: string) => {
    if (!confirm("Are you sure you want to delete this variant?")) return

    try {
      const response = await fetch(`/api/sandbox-v2/lcstx/${variantCode}`, {
        method: "DELETE",
      })

      const data = await response.json()
      if (data.success) {
        fetchData()
        if (inputText.trim()) {
          setTimeout(() => runMatch(inputText), 500)
        }
      } else {
        alert(data.error || "Failed to delete variant")
      }
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete variant")
    }
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  const loadVariantToInput = (variant: LCSTXWithConcept) => {
    setInputText(variant.canonical_text)
  }

  const clauseTypes = concepts.map(c => ({
    id: c.id,
    code: c.concept_code,
    name: c.display_name,
  }))

  const filteredVariants = variants.filter((variant) => {
    const matchesSearch =
      searchQuery === "" ||
      variant.variant_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.canonical_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.lcl?.concept_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      variant.lcl?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesConcept =
      filterType === "all" || variant.lcl?.concept_code === filterType

    const matchesRisk = filterRisk === "all" || variant.risk_level === filterRisk

    return matchesSearch && matchesConcept && matchesRisk
  })

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Database className="h-8 w-8 text-blue-500" />
          <h1 className="text-3xl font-bold">Contract Buddy LCL Sandbox</h1>
        </div>
        <p className="text-muted-foreground">
          Test clause matching and manage your Legal Clause Library (v2 schema)
        </p>
      </div>

      {/* Thresholds Reference */}
      <Card className="p-4 mb-6 bg-muted/50">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="font-medium">Thresholds:</span>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500">GREEN</Badge>
            <span>≥{V2_THRESHOLDS.GREEN * 100}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-amber-500">AMBER</Badge>
            <span>≥{V2_THRESHOLDS.AMBER * 100}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-red-500">RED</Badge>
            <span>&lt;{V2_THRESHOLDS.AMBER * 100}%</span>
          </div>
          <span className="text-muted-foreground border-l pl-4">
            Risk Resolution: <strong>HIGH &gt; MEDIUM &gt; LOW</strong> (highest risk wins)
          </span>
        </div>
      </Card>

      {/* Main Content: Input + Results */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Input Panel */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Test Clause</h2>
            {matching && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Matching...
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Paste or type clause text here to find matches in the LCL...

Example: Payment shall be made within thirty (30) days of receipt of a valid invoice."
              rows={6}
              className="font-mono text-sm"
            />

            <div className="flex gap-2">
              <Button
                onClick={() => runMatch(inputText)}
                disabled={matching || !inputText.trim()}
                variant="outline"
                className="flex-1"
              >
                <Search className="mr-2 h-4 w-4" />
                Find Matches
              </Button>
              <Button onClick={() => openAddDialog()} disabled={!inputText.trim()}>
                <Plus className="mr-2 h-4 w-4" />
                Add to LCL
              </Button>
            </div>

            {/* PAT Context Toggle */}
            <Collapsible open={patEnabled} onOpenChange={setPatEnabled}>
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-2 rounded -mx-2">
                  <Checkbox
                    id="pat-enabled"
                    checked={patEnabled}
                    onCheckedChange={(checked) => setPatEnabled(!!checked)}
                  />
                  <Label htmlFor="pat-enabled" className="cursor-pointer text-sm">
                    Include PAT Context (Pre-Agreed Terms comparison)
                  </Label>
                  {patEnabled ? (
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  ) : (
                    <ChevronRight className="h-4 w-4 ml-auto" />
                  )}
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Term Category</Label>
                    <Input
                      value={patContext.term_category}
                      onChange={(e) =>
                        setPatContext({ ...patContext, term_category: e.target.value })
                      }
                      placeholder="e.g., payment_terms"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Expected Value</Label>
                    <Input
                      value={patContext.expected_value}
                      onChange={(e) =>
                        setPatContext({ ...patContext, expected_value: e.target.value })
                      }
                      placeholder="e.g., Net 30"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="pat-mandatory"
                    checked={patContext.is_mandatory}
                    onCheckedChange={(checked) =>
                      setPatContext({ ...patContext, is_mandatory: !!checked })
                    }
                  />
                  <Label htmlFor="pat-mandatory" className="text-xs">
                    Mandatory term (RED if not found)
                  </Label>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {inputText.trim() && inputText.length < 10 && (
              <p className="text-sm text-muted-foreground">
                Enter at least 10 characters to search
              </p>
            )}

            {matchError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {matchError}
              </div>
            )}
          </div>
        </Card>

        {/* Results Panel */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Match Results</h2>

          {!matchResult && !matching ? (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Enter clause text to see matches</p>
            </div>
          ) : matchResult ? (
            <div className="space-y-4">
              {/* Final RAG Status */}
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="font-medium">Final Status:</span>
                <div className="flex items-center gap-2">
                  {getRAGBadge(matchResult.rag_final)}
                  {matchResult.rag_pat && (
                    <span className="text-xs text-muted-foreground">
                      (Library: {matchResult.rag_library}, PAT: {matchResult.rag_pat})
                    </span>
                  )}
                </div>
              </div>

              {/* Resolved Match (highest risk winner) */}
              {matchResult.resolved_match ? (
                <MatchFlipCard
                  match={matchResult.resolved_match}
                  inputText={inputText}
                  explanationCache={explanationCache}
                  onExplanationLoaded={handleExplanationLoaded}
                />
              ) : (
                <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-red-800">No Match Found</div>
                      <div className="text-sm text-red-700">
                        This appears to be a novel clause not in the LCL.
                      </div>
                      <Button size="sm" className="mt-2" onClick={() => openAddDialog()}>
                        <Plus className="mr-2 h-3 w-3" />
                        Add to LCL
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Matches */}
              {matchResult.all_matches.length > 1 && (
                <Collapsible open={otherMatchesOpen} onOpenChange={setOtherMatchesOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between h-8">
                      <span className="text-sm">
                        Other Matches ({matchResult.all_matches.length - 1})
                      </span>
                      {otherMatchesOpen ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {matchResult.all_matches
                        .filter(
                          (m) =>
                            m.variant_code !== matchResult.resolved_match?.variant_code
                        )
                        .map((match, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                          >
                            <div className="flex items-center gap-2">
                              {getRiskBadge(match.risk_level)}
                              <span className="font-mono">{match.variant_code}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="font-mono">
                                {(match.similarity * 100).toFixed(1)}%
                              </span>
                              <OtherMatchExplanationPopover
                                match={match}
                                inputText={inputText}
                                explanationCache={explanationCache}
                                onExplanationLoaded={handleExplanationLoaded}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Escalation Notice */}
              {matchResult.escalation_needed && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <span className="font-medium text-amber-800">
                        {matchResult.escalation_type === "new_pattern"
                          ? "Potential New Pattern"
                          : matchResult.escalation_type === "variant_candidate"
                          ? "Potential Variant"
                          : matchResult.escalation_type === "low_confidence"
                          ? "Low Confidence Match"
                          : "Review Needed"}
                      </span>
                      <span className="text-amber-700 ml-1">
                        — Consider adding to LCL or reviewing
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* PAT Override Notice */}
              {matchResult.pat_override_applied && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    <Zap className="h-4 w-4" />
                    PAT context applied - status adjusted based on pre-agreed terms
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </Card>
      </div>

      {/* Clause Library Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Clause Library
            <span className="text-muted-foreground font-normal ml-2">
              ({variants.length} variants, {concepts.length} types)
            </span>
          </h2>
          <Button onClick={() => openAddDialog("")} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Add Variant
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search variants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {clauseTypes.map((c) => (
                <SelectItem key={c.id} value={c.code}>
                  {c.code} - {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Filter by risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Variant</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead className="w-[100px]">Risk</TableHead>
                <TableHead>Canonical Text</TableHead>
                <TableHead className="w-[60px]">Embed</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredVariants.map((variant) => (
                <TableRow
                  key={variant.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => loadVariantToInput(variant)}
                >
                  <TableCell className="font-mono text-sm">{variant.variant_code}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{variant.lcl?.concept_code || "-"}</Badge>
                  </TableCell>
                  <TableCell>{getRiskBadge(variant.risk_level)}</TableCell>
                  <TableCell className="max-w-md">
                    <div className="text-sm line-clamp-2">{variant.canonical_text}</div>
                    {variant.plain_english && (
                      <div className="text-xs text-muted-foreground italic mt-1 line-clamp-1">
                        {variant.plain_english}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {variant.embedding ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => loadVariantToInput(variant)}
                        title="Load to test"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          navigator.clipboard.writeText(variant.canonical_text)
                        }}
                        title="Copy text"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(variant)}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(variant.variant_code)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredVariants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading...
                      </div>
                    ) : variants.length === 0 ? (
                      <div>
                        <p className="mb-2">No variants in the LCL yet</p>
                        <Button size="sm" onClick={() => openAddDialog("")}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Your First Variant
                        </Button>
                      </div>
                    ) : (
                      "No variants match your filters"
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 text-sm text-muted-foreground">
          Showing {filteredVariants.length} of {variants.length} variants
          <span className="ml-4">Click a row to load canonical text into the test area</span>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add" ? "Add New Variant" : "Edit Variant"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "add"
                ? "Select a clause type and fill in the variant details. Embedding will be generated automatically."
                : "Update variant details. Embedding will be regenerated if text changes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Clause Type Selection (Add mode only) */}
            {dialogMode === "add" && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>
                    Clause Type <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formCreateNewType ? "new" : formConceptId}
                    onValueChange={handleClauseTypeSelect}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a clause type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {concepts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="font-mono">{c.concept_code}</span>
                          <span className="text-muted-foreground ml-2">- {c.display_name}</span>
                        </SelectItem>
                      ))}
                      <SelectItem value="new">
                        <span className="flex items-center gap-2">
                          <Plus className="h-4 w-4" />
                          Create New Type
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Inline new type fields */}
                {formCreateNewType && (
                  <div className="p-3 border rounded-lg bg-muted/30 space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Code <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={formNewTypeCode}
                          onChange={(e) => handleNewTypeCodeChange(e.target.value)}
                          placeholder="PAY"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Category <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={formNewTypeCategory}
                          onChange={(e) => setFormNewTypeCategory(e.target.value)}
                          placeholder="Payment"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">
                          Display Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          value={formNewTypeName}
                          onChange={(e) => setFormNewTypeName(e.target.value)}
                          placeholder="Payment Terms"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Show selected type in edit mode */}
            {dialogMode === "edit" && (
              <div className="p-3 bg-muted/50 rounded-lg text-sm">
                <span className="text-muted-foreground">Clause Type: </span>
                <span className="font-medium">
                  {concepts.find((c) => c.id === formConceptId)?.display_name || "-"}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-code">
                  Variant Code <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="variant-code"
                  value={formVariantCode}
                  onChange={(e) => setFormVariantCode(e.target.value.toUpperCase())}
                  placeholder="PAY-001"
                  disabled={dialogMode === "edit"}
                />
                <p className="text-xs text-muted-foreground">
                  {dialogMode === "add" ? "Auto-generated when you select a type" : "Cannot change variant code"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="risk-level">
                  Risk Level <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formRiskLevel}
                  onValueChange={(v) => setFormRiskLevel(v as RiskLevel)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-green-500" />
                        Low
                      </span>
                    </SelectItem>
                    <SelectItem value="medium">
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-yellow-500" />
                        Medium
                      </span>
                    </SelectItem>
                    <SelectItem value="high">
                      <span className="flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-orange-500" />
                        High
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="canonical-text">
                Canonical Text <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="canonical-text"
                value={formCanonicalText}
                onChange={(e) => setFormCanonicalText(e.target.value)}
                placeholder="Enter the canonical clause text..."
                rows={5}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{formCanonicalText.length} characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plain-english">Plain English Summary</Label>
              <Textarea
                id="plain-english"
                value={formPlainEnglish}
                onChange={(e) => setFormPlainEnglish(e.target.value)}
                placeholder="A simple explanation of what this clause means..."
                rows={2}
              />
            </div>

            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || (dialogMode === "add" && !formConceptId && !formCreateNewType)}>
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {dialogMode === "add" ? "Add Variant" : "Save Changes"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
