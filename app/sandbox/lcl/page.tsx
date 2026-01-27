"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Search,
} from "lucide-react"

interface LCLClause {
  id: string
  clause_id: string
  clause_type: string
  category: string | null
  standard_text: string
  risk_level: string
  embedding: unknown
  parent_clause_id: string | null
  variation_letter: string
  tags: string[] | null
  created_at: string
}

export default function SandboxLCLPage() {
  const [clauses, setClauses] = useState<LCLClause[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add")
  const [selectedClause, setSelectedClause] = useState<LCLClause | null>(null)

  // Form state
  const [formClauseId, setFormClauseId] = useState("")
  const [formClauseType, setFormClauseType] = useState("")
  const [formCategory, setFormCategory] = useState("")
  const [formStandardText, setFormStandardText] = useState("")
  const [formRiskLevel, setFormRiskLevel] = useState<string>("medium")
  const [formTags, setFormTags] = useState("")
  const [saving, setSaving] = useState(false)

  const fetchClauses = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/sandbox/lcl")
      const data = await response.json()
      if (data.success) {
        setClauses(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch clauses:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchClauses()
  }, [])

  const uniqueTypes = Array.from(new Set(clauses.map((c) => c.clause_type))).sort()

  const filteredClauses = clauses.filter((clause) => {
    const matchesSearch =
      searchQuery === "" ||
      clause.clause_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clause.standard_text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clause.clause_type.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesType = filterType === "all" || clause.clause_type === filterType

    return matchesSearch && matchesType
  })

  const openAddDialog = () => {
    setDialogMode("add")
    setSelectedClause(null)
    resetForm()
    setDialogOpen(true)
  }

  const openEditDialog = (clause: LCLClause) => {
    setDialogMode("edit")
    setSelectedClause(clause)
    setFormClauseId(clause.clause_id)
    setFormClauseType(clause.clause_type)
    setFormCategory(clause.category || "")
    setFormStandardText(clause.standard_text)
    setFormRiskLevel(clause.risk_level)
    setFormTags(clause.tags?.join(", ") || "")
    setDialogOpen(true)
  }

  const resetForm = () => {
    setFormClauseId("")
    setFormClauseType("")
    setFormCategory("")
    setFormStandardText("")
    setFormRiskLevel("medium")
    setFormTags("")
  }

  const handleSave = async () => {
    if (!formClauseId || !formClauseType || !formStandardText) {
      alert("Please fill in all required fields")
      return
    }

    setSaving(true)
    try {
      const method = dialogMode === "add" ? "POST" : "PATCH"
      const url =
        dialogMode === "add"
          ? "/api/sandbox/lcl"
          : `/api/sandbox/lcl/${selectedClause?.clause_id}`

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clause_id: formClauseId,
          clause_type: formClauseType,
          category: formCategory || null,
          standard_text: formStandardText,
          risk_level: formRiskLevel,
          tags: formTags
            ? formTags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : null,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setDialogOpen(false)
        fetchClauses()
        resetForm()
      } else {
        alert(data.error || "Failed to save clause")
      }
    } catch (error) {
      console.error("Save failed:", error)
      alert("Failed to save clause")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (clauseId: string) => {
    if (!confirm("Are you sure you want to delete this clause?")) return

    try {
      const response = await fetch(`/api/sandbox/lcl/${clauseId}`, {
        method: "DELETE",
      })

      const data = await response.json()
      if (data.success) {
        fetchClauses()
      } else {
        alert(data.error || "Failed to delete clause")
      }
    } catch (error) {
      console.error("Delete failed:", error)
      alert("Failed to delete clause")
    }
  }

  const getRiskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      low: "bg-green-500",
      medium: "bg-yellow-500",
      high: "bg-orange-500",
      critical: "bg-red-500",
    }
    return <Badge className={colors[risk] || "bg-gray-500"}>{risk}</Badge>
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <Link
          href="/sandbox"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Sandbox
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">LCL Browser</h1>
            <p className="text-muted-foreground mt-1">
              Browse and manage sandbox Legal Clause Library
            </p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Add Clause
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search clauses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {uniqueTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchClauses} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </Card>

      {/* Clauses Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Clause ID</TableHead>
              <TableHead className="w-[150px]">Type</TableHead>
              <TableHead className="w-[120px]">Category</TableHead>
              <TableHead>Standard Text</TableHead>
              <TableHead className="w-[80px]">Risk</TableHead>
              <TableHead className="w-[80px]">Embed</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredClauses.map((clause) => (
              <TableRow key={clause.id}>
                <TableCell className="font-mono text-sm">{clause.clause_id}</TableCell>
                <TableCell>
                  <Badge variant="outline">{clause.clause_type}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {clause.category || "-"}
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="text-sm line-clamp-2">{clause.standard_text}</div>
                </TableCell>
                <TableCell>{getRiskBadge(clause.risk_level)}</TableCell>
                <TableCell>
                  {clause.embedding ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(clause)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(clause.clause_id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filteredClauses.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {loading ? "Loading..." : "No clauses found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="mt-4 text-sm text-muted-foreground">
        Showing {filteredClauses.length} of {clauses.length} clauses
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add" ? "Add New Clause" : "Edit Clause"}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === "add"
                ? "Create a new clause in the sandbox LCL. Embedding will be generated automatically."
                : "Update clause details. Embedding will be regenerated if text changes."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="clause-id">Clause ID *</Label>
                <Input
                  id="clause-id"
                  value={formClauseId}
                  onChange={(e) => setFormClauseId(e.target.value)}
                  placeholder="LC-PAY-001-a"
                  disabled={dialogMode === "edit"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clause-type">Clause Type *</Label>
                <Input
                  id="clause-type"
                  value={formClauseType}
                  onChange={(e) => setFormClauseType(e.target.value)}
                  placeholder="payment_terms"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  placeholder="Payment"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="risk-level">Risk Level</Label>
                <Select value={formRiskLevel} onValueChange={setFormRiskLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="standard-text">Standard Text *</Label>
              <Textarea
                id="standard-text"
                value={formStandardText}
                onChange={(e) => setFormStandardText(e.target.value)}
                placeholder="Enter the clause text..."
                rows={5}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={formTags}
                onChange={(e) => setFormTags(e.target.value)}
                placeholder="payment, invoice, terms"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Clause"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
