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
import { ArrowLeft, Plus, Loader2, BookOpen } from "lucide-react"
import type { LCL } from "@/lib/sandbox-v2/types"

export default function LCLBrowserPage() {
  const [concepts, setConcepts] = useState<LCL[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [conceptCode, setConceptCode] = useState("")
  const [category, setCategory] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [description, setDescription] = useState("")

  useEffect(() => {
    fetchConcepts()
  }, [])

  const fetchConcepts = async () => {
    try {
      const response = await fetch("/api/sandbox-v2/lcl")
      const data = await response.json()
      if (data.success) {
        setConcepts(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch concepts:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!conceptCode || !category || !displayName) {
      alert("Please fill all required fields")
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch("/api/sandbox-v2/lcl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept_code: conceptCode,
          category,
          display_name: displayName,
          description: description || null,
        }),
      })

      const data = await response.json()
      if (data.success) {
        setDialogOpen(false)
        resetForm()
        fetchConcepts()
      } else {
        alert(data.error || "Failed to create concept")
      }
    } catch (error) {
      console.error("Failed to create concept:", error)
      alert("Failed to create concept")
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setConceptCode("")
    setCategory("")
    setDisplayName("")
    setDescription("")
  }

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
          <h1 className="text-2xl font-bold">LCL Browser</h1>
          <p className="text-muted-foreground">
            Tier 1 - Legal Clause Library Concepts
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Concept
        </Button>
      </div>

      {/* Concepts Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {concepts.map((concept) => (
              <TableRow key={concept.id}>
                <TableCell>
                  <code className="bg-muted px-2 py-1 rounded text-sm">
                    {concept.concept_code}
                  </code>
                </TableCell>
                <TableCell>{concept.category}</TableCell>
                <TableCell className="font-medium">{concept.display_name}</TableCell>
                <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                  {concept.description || "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={concept.is_active ? "default" : "secondary"}>
                    {concept.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {concepts.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No concepts found</p>
                  <p className="text-sm text-muted-foreground">
                    Run the seed script or add concepts manually
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add LCL Concept</DialogTitle>
            <DialogDescription>
              Create a new clause concept category
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="concept-code">Concept Code *</Label>
              <Input
                id="concept-code"
                value={conceptCode}
                onChange={(e) => setConceptCode(e.target.value.toUpperCase())}
                placeholder="PAY, EXC, IP..."
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                Short uppercase code (e.g., PAY for Payment)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Input
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Payment, Exclusivity..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name *</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Payment Terms, Exclusivity Clauses..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of this concept..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Concept
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
