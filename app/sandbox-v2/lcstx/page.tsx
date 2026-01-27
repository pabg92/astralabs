"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { ArrowLeft, Plus, Loader2, FileCode, AlertTriangle } from "lucide-react"
import type { LCL, LCSTXWithConcept, RiskLevel } from "@/lib/sandbox-v2/types"

export default function LCSTXEditorPage() {
  const [variants, setVariants] = useState<LCSTXWithConcept[]>([])
  const [concepts, setConcepts] = useState<LCL[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [filterRisk, setFilterRisk] = useState<string>("all")
  const [filterConcept, setFilterConcept] = useState<string>("all")

  // Form state
  const [lclId, setLclId] = useState("")
  const [variantCode, setVariantCode] = useState("")
  const [riskLevel, setRiskLevel] = useState<RiskLevel>("medium")
  const [canonicalText, setCanonicalText] = useState("")
  const [plainEnglish, setPlainEnglish] = useState("")
  const [suggestedRewrite, setSuggestedRewrite] = useState("")

  useEffect(() => {
    fetchData()
  }, [filterRisk, filterConcept])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch concepts for dropdown
      const conceptsRes = await fetch("/api/sandbox-v2/lcl")
      const conceptsData = await conceptsRes.json()
      if (conceptsData.success) {
        setConcepts(conceptsData.data)
      }

      // Fetch variants with filters
      let url = "/api/sandbox-v2/lcstx?"
      if (filterRisk !== "all") {
        url += `risk_level=${filterRisk}&`
      }
      if (filterConcept !== "all") {
        url += `concept_code=${filterConcept}&`
      }

      const variantsRes = await fetch(url)
      const variantsData = await variantsRes.json()
      if (variantsData.success) {
        setVariants(variantsData.data)
      }
    } catch (error) {
      console.error("Failed to fetch data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!lclId || !variantCode || !canonicalText) {
      alert("Please fill all required fields")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/sandbox-v2/lcstx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lcl_id: lclId,
          variant_code: variantCode,
          risk_level: riskLevel,
          canonical_text: canonicalText,
          plain_english: plainEnglish || null,
          suggested_rewrite: suggestedRewrite || null,
          patterns: [],
          generate_embedding: true,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setDialogOpen(false)
        resetForm()
        fetchData()
      } else {
        alert(data.error || "Failed to create variant")
      }
    } catch (error) {
      console.error("Failed to create variant:", error)
      alert("Failed to create variant")
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setLclId("")
    setVariantCode("")
    setRiskLevel("medium")
    setCanonicalText("")
    setPlainEnglish("")
    setSuggestedRewrite("")
  }

  const getRiskBadge = (risk: RiskLevel) => {
    const colors = {
      low: "bg-green-500",
      medium: "bg-yellow-500",
      high: "bg-red-500",
    }
    return <Badge className={colors[risk]}>{risk}</Badge>
  }

  // Group variants by concept
  const groupedVariants = variants.reduce(
    (acc, variant) => {
      const conceptCode = variant.lcl?.concept_code || "Unknown"
      if (!acc[conceptCode]) {
        acc[conceptCode] = []
      }
      acc[conceptCode].push(variant)
      return acc
    },
    {} as Record<string, LCSTXWithConcept[]>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/sandbox-v2">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">LCSTX Editor</h1>
          <p className="text-muted-foreground">
            Tier 2 - Clause Variants with Risk Levels
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Variant
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="w-48">
          <Label className="text-sm text-muted-foreground">Filter by Risk</Label>
          <Select value={filterRisk} onValueChange={setFilterRisk}>
            <SelectTrigger>
              <SelectValue placeholder="All risks" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Label className="text-sm text-muted-foreground">Filter by Concept</Label>
          <Select value={filterConcept} onValueChange={setFilterConcept}>
            <SelectTrigger>
              <SelectValue placeholder="All concepts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Concepts</SelectItem>
              {concepts.map((c) => (
                <SelectItem key={c.id} value={c.concept_code}>
                  {c.concept_code} - {c.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Variants by Concept */}
      {Object.keys(groupedVariants).length === 0 ? (
        <Card className="p-12 text-center">
          <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No variants found</p>
          <p className="text-sm text-muted-foreground">
            Run the seed script or add variants manually
          </p>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-4">
          {Object.entries(groupedVariants).map(([conceptCode, conceptVariants]) => (
            <AccordionItem key={conceptCode} value={conceptCode} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-4">
                  <code className="bg-muted px-2 py-1 rounded text-sm">
                    {conceptCode}
                  </code>
                  <span className="font-medium">
                    {conceptVariants[0]?.lcl?.display_name || conceptCode}
                  </span>
                  <Badge variant="secondary">{conceptVariants.length} variants</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Variant</TableHead>
                      <TableHead className="w-24">Risk</TableHead>
                      <TableHead>Canonical Text</TableHead>
                      <TableHead className="w-24">Embedding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {conceptVariants.map((variant) => (
                      <TableRow key={variant.id}>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-sm">
                            {variant.variant_code}
                          </code>
                        </TableCell>
                        <TableCell>{getRiskBadge(variant.risk_level)}</TableCell>
                        <TableCell>
                          <p className="text-sm line-clamp-2">{variant.canonical_text}</p>
                          {variant.plain_english && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {variant.plain_english}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {variant.embedding ? (
                            <Badge variant="outline" className="text-green-600">
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-yellow-600">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add LCSTX Variant</DialogTitle>
            <DialogDescription>
              Create a new clause variant with risk level
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lcl-id">Concept *</Label>
                <Select value={lclId} onValueChange={setLclId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select concept" />
                  </SelectTrigger>
                  <SelectContent>
                    {concepts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.concept_code} - {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="variant-code">Variant Code *</Label>
                <Input
                  id="variant-code"
                  value={variantCode}
                  onChange={(e) => setVariantCode(e.target.value.toUpperCase())}
                  placeholder="PAY-001, EXC-002..."
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk-level">Risk Level *</Label>
              <Select
                value={riskLevel}
                onValueChange={(v) => setRiskLevel(v as RiskLevel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low - Standard/favorable terms</SelectItem>
                  <SelectItem value="medium">Medium - Requires review</SelectItem>
                  <SelectItem value="high">High - Unfavorable/risky</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="canonical-text">Canonical Text *</Label>
              <Textarea
                id="canonical-text"
                value={canonicalText}
                onChange={(e) => setCanonicalText(e.target.value)}
                placeholder="Standard form of the clause..."
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="plain-english">Plain English Summary</Label>
              <Textarea
                id="plain-english"
                value={plainEnglish}
                onChange={(e) => setPlainEnglish(e.target.value)}
                placeholder="What this clause means in simple terms..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="suggested-rewrite">Suggested Rewrite</Label>
              <Textarea
                id="suggested-rewrite"
                value={suggestedRewrite}
                onChange={(e) => setSuggestedRewrite(e.target.value)}
                placeholder="Recommended alternative text..."
                rows={2}
              />
            </div>

            <div className="p-3 bg-muted rounded-lg text-sm">
              <p className="font-medium mb-1">Note:</p>
              <p className="text-muted-foreground">
                An embedding will be automatically generated from the canonical text.
                This enables similarity-based matching.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Variant
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
