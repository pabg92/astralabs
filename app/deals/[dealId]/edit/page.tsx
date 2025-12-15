"use client"

import type React from "react"
import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, Save, FileText, Users, CheckCircle2, Loader2, Upload, File, X, Send, Building } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { PAT_CATEGORIES } from "@/lib/constants/pat-categories"

interface PreAgreedTerm {
  id: string
  clauseType: string
  expectedTerm: string
  notes: string
}

// Map user-friendly clause types to database clause_type values
function mapClauseTypeToRelatedTypes(clauseType: string): string[] {
  const normalized = clauseType.toLowerCase().trim()

  if (/payment|fee|compensation|invoice/.test(normalized)) return ["payment_terms"]
  if (/usage|rights|license/.test(normalized)) return ["usage_rights"]
  if (/deliverable|scope|work|service|content/.test(normalized)) return ["scope_of_work", "deliverables"]
  if (/exclusivity|exclusive|non-compete/.test(normalized)) return ["exclusivity"]
  if (/approval|feedback|review/.test(normalized)) return ["approval_process", "general_terms"]
  if (/confiden|nda|secret/.test(normalized)) return ["confidentiality"]
  if (/termination|term|duration|cancel|expire/.test(normalized)) return ["term_and_termination"]
  if (/indemn|liabilit|warranty/.test(normalized)) return ["indemnification"]
  if (/intellectual|ip|copyright|trademark|ownership/.test(normalized)) return ["intellectual_property"]
  if (/part(y|ies)|contact|address/.test(normalized)) return ["parties", "contact_information"]
  return []
}

interface DealFormData {
  dealName: string
  talent: string
  agency: string
  brand: string
  inOut: "In" | "Out" | ""
  deliverables: string
  usage: string
  exclusivity: string
  fee: string
  status: string
  workflowStatus: "internal" | "with_us" | "with_brand" | "signed"
}

interface DocumentInfo {
  id: string
  file_name: string
  created_at: string
  file_type: string | null
}

export default function EditDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Deal form state
  const [formData, setFormData] = useState<DealFormData>({
    dealName: "",
    talent: "",
    agency: "",
    brand: "",
    inOut: "",
    deliverables: "",
    usage: "",
    exclusivity: "",
    fee: "",
    status: "draft",
    workflowStatus: "internal",
  })

  // Document and version state
  const [currentDocument, setCurrentDocument] = useState<DocumentInfo | null>(null)
  const [dealVersion, setDealVersion] = useState<number>(1)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const demoAuthorId = process.env.NEXT_PUBLIC_DEMO_AUTHOR_ID || "00000000-0000-0000-0000-000000000002"

  // Pre-agreed terms state
  const [terms, setTerms] = useState<PreAgreedTerm[]>([{ id: "1", clauseType: "", expectedTerm: "", notes: "" }])

  // Form handlers
  const updateFormData = (field: keyof DealFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Terms handlers
  const addTerm = () => {
    const newTerm: PreAgreedTerm = {
      id: Date.now().toString(),
      clauseType: "",
      expectedTerm: "",
      notes: "",
    }
    setTerms([...terms, newTerm])
  }

  const removeTerm = (id: string) => {
    if (terms.length > 1) {
      setTerms(terms.filter((term) => term.id !== id))
    }
  }

  const updateTerm = (id: string, field: keyof PreAgreedTerm, value: string) => {
    setTerms(terms.map((term) => (term.id === id ? { ...term, [field]: value } : term)))
  }

  // Document upload handler
  const handleDocumentUpload = async (file: File) => {
    setUploading(true)
    setUploadError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("created_by", demoAuthorId)

      const response = await fetch(`/api/deals/${dealId}/upload`, {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.details || "Upload failed")
      }

      // Update document info and version with the new document
      if (result.data?.document) {
        setCurrentDocument({
          id: result.data.document.id,
          file_name: result.data.document.file_name,
          created_at: result.data.document.created_at,
          file_type: result.data.document.file_type,
        })
      }
      if (result.data?.newVersion) {
        setDealVersion(result.data.newVersion)
      }
    } catch (error) {
      console.error("Document upload error:", error)
      setUploadError(error instanceof Error ? error.message : "Failed to upload document")
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleDocumentUpload(file)
    }
    e.target.value = "" // Reset input
  }

  // Fetch deal data
  useEffect(() => {
    async function fetchDeal() {
      try {
        setLoading(true)
        setFetchError(null)

        const response = await fetch(`/api/deals/${dealId}`)
        const result = await response.json()

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Failed to fetch deal")
        }

        const deal = result.data

        // Derive workflow status from deal status and document presence
        const hasDocument = !!deal.latest_document
        let workflowStatus: DealFormData["workflowStatus"] = "internal"
        if (deal.status === "signed") {
          workflowStatus = "signed"
        } else if (deal.status === "in_review") {
          workflowStatus = "with_brand"
        } else if (hasDocument) {
          workflowStatus = "with_us"
        }

        // Populate form data
        setFormData({
          dealName: deal.title || "",
          talent: deal.talent_name || "",
          agency: "", // Not stored in DB yet
          brand: deal.client_name || "",
          inOut: "",
          deliverables: deal.description || "",
          usage: "",
          exclusivity: "",
          fee: deal.value ? String(deal.value) : "",
          status: deal.status || "draft",
          workflowStatus,
        })

        // Populate version
        setDealVersion(deal.version || 1)

        // Populate document info
        if (deal.latest_document) {
          setCurrentDocument({
            id: deal.latest_document.id,
            file_name: deal.latest_document.file_name,
            created_at: deal.latest_document.created_at,
            file_type: deal.latest_document.file_type,
          })
        }

        // Populate terms
        if (deal.pre_agreed_terms && deal.pre_agreed_terms.length > 0) {
          setTerms(
            deal.pre_agreed_terms.map((term: any) => ({
              id: term.id,
              clauseType: term.term_category || "",
              expectedTerm: term.term_description || "",
              notes: term.expected_value || "",
            }))
          )
        }
      } catch (error) {
        console.error("Error fetching deal:", error)
        setFetchError(error instanceof Error ? error.message : "Failed to load deal")
      } finally {
        setLoading(false)
      }
    }

    fetchDeal()
  }, [dealId])

  // Validation
  const isBasicInfoComplete = formData.dealName && formData.talent && formData.brand

  // Submit handlers
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!isBasicInfoComplete) return

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      // Map workflow status to database status
      let dbStatus = "draft"
      if (formData.workflowStatus === "signed") {
        dbStatus = "signed"
      } else if (formData.workflowStatus === "with_brand") {
        dbStatus = "in_review"
      } else {
        dbStatus = "draft"
      }

      // Prepare update payload
      const payload: Record<string, any> = {
        title: formData.dealName,
        talent_name: formData.talent,
        client_name: formData.brand,
        status: dbStatus,
      }

      if (formData.fee) {
        payload.value = formData.fee.replace(/[^0-9.]/g, "")
      }

      if (formData.deliverables) {
        payload.description = formData.deliverables
      }

      // Prepare terms
      const validTerms = terms
        .filter((term) => term.clauseType && term.expectedTerm)
        .map((term) => ({
          term_category: term.clauseType,
          term_description: term.expectedTerm,
          expected_value: term.notes || null,
          is_mandatory: true,
          related_clause_types: mapClauseTypeToRelatedTypes(term.clauseType),
        }))

      if (validTerms.length > 0) {
        payload.terms = validTerms
      }

      // Submit to API
      const response = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to update deal")
      }

      console.log("Deal updated:", result.data)
      router.push("/deals")
    } catch (error) {
      console.error("Error updating deal:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to update deal")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading deal...</p>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{fetchError}</p>
          <Link href="/deals">
            <Button variant="outline">Back to Deals</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-4">
            <Link href="/deals">
              <Button variant="ghost" size="sm" className="-ml-2">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Deals
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Edit Deal</h1>
          <p className="text-slate-600">Update deal information and pre-agreed terms.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Deal Information */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Deal Information</h2>
                  <p className="text-sm text-slate-500">Basic details about the partnership</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="dealName">Deal Name *</Label>
                    <Input
                      id="dealName"
                      value={formData.dealName}
                      onChange={(e) => updateFormData("dealName", e.target.value)}
                      placeholder="e.g., Sarah Kim x Chanel - May 2025"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="talent">Talent *</Label>
                    <Input
                      id="talent"
                      value={formData.talent}
                      onChange={(e) => updateFormData("talent", e.target.value)}
                      placeholder="e.g., Sarah Kim"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="brand">Brand *</Label>
                    <Input
                      id="brand"
                      value={formData.brand}
                      onChange={(e) => updateFormData("brand", e.target.value)}
                      placeholder="e.g., Chanel"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fee">Fee</Label>
                    <Input
                      id="fee"
                      value={formData.fee}
                      onChange={(e) => updateFormData("fee", e.target.value)}
                      placeholder="e.g., 52000"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="workflowStatus">Workflow Status</Label>
                    <Select value={formData.workflowStatus} onValueChange={(value) => updateFormData("workflowStatus", value as DealFormData["workflowStatus"])}>
                      <SelectTrigger className="rounded-lg">
                        <SelectValue placeholder="Select workflow status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="internal">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-slate-500" />
                            <span>Internal</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="with_us">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-blue-500" />
                            <span>With Us</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="with_brand">
                          <div className="flex items-center gap-2">
                            <Send className="w-4 h-4 text-amber-500" />
                            <span>With Brand</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="signed">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            <span>Signed</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-500 mt-1">Where is this contract in the review process?</p>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="deliverables">Description / Deliverables</Label>
                    <Textarea
                      id="deliverables"
                      value={formData.deliverables}
                      onChange={(e) => updateFormData("deliverables", e.target.value)}
                      placeholder="e.g., Instagram Campaign, YouTube Video"
                      className="rounded-lg resize-none"
                      rows={3}
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Contract Document */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <File className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Contract Document</h2>
                    <p className="text-sm text-slate-500">Upload or replace the contract file</p>
                  </div>
                </div>
                <div className={`px-3 py-1.5 rounded-full text-sm font-semibold ${
                  dealVersion >= 3
                    ? "bg-emerald-100 text-emerald-700"
                    : dealVersion === 2
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600"
                }`}>
                  v{dealVersion}
                </div>
              </div>

              {/* Current Document Display */}
              {currentDocument ? (
                <>
                  <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 text-sm">{currentDocument.file_name}</p>
                          <p className="text-xs text-slate-500">
                            Uploaded {new Date(currentDocument.created_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {currentDocument.file_type && ` • ${currentDocument.file_type.toUpperCase()}`}
                          </p>
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx"
                              className="hidden"
                              onChange={handleFileSelect}
                              disabled={uploading}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-blue-600 border-blue-200 hover:bg-blue-50"
                              asChild
                              disabled={uploading}
                            >
                              <span>
                                {uploading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <>
                                    <Upload className="w-4 h-4 mr-1.5" />
                                    Replace
                                  </>
                                )}
                              </span>
                            </Button>
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>Upload new contract → creates v{dealVersion + 1}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <p className="text-xs text-amber-600 mb-4">
                    Uploading a new contract will create v{dealVersion + 1} and reset reconciliation progress.
                  </p>
                </>
              ) : (
                <div className="mb-4">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={handleFileSelect}
                      disabled={uploading}
                    />
                    <div className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      uploading ? "border-blue-300 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50/50"
                    }`}>
                      {uploading ? (
                        <>
                          <Loader2 className="w-8 h-8 text-blue-500 mx-auto mb-3 animate-spin" />
                          <p className="text-sm font-medium text-blue-700">Uploading...</p>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                          <p className="text-sm font-medium text-slate-700">Click to upload contract</p>
                          <p className="text-xs text-slate-500 mt-1">PDF, DOC, or DOCX • Will create v{dealVersion + 1}</p>
                        </>
                      )}
                    </div>
                  </label>
                </div>
              )}

              {uploadError && (
                <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                  {uploadError}
                </div>
              )}
            </Card>

            {/* Pre-agreed Terms */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Pre-agreed Terms</h2>
                    <p className="text-sm text-slate-500">Define expected contractual terms for reconciliation</p>
                  </div>
                </div>
                <Button onClick={addTerm} size="sm" className="rounded-lg bg-blue-500 hover:bg-blue-600">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Term
                </Button>
              </div>

              <div className="space-y-4">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 pb-3 border-b border-slate-200">
                  <div className="col-span-3 text-xs font-semibold text-slate-700 uppercase">Clause Type</div>
                  <div className="col-span-5 text-xs font-semibold text-slate-700 uppercase">Expected Term</div>
                  <div className="col-span-3 text-xs font-semibold text-slate-700 uppercase">Notes</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Table Rows */}
                {terms.map((term) => (
                  <div key={term.id} className="grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-3">
                      <Select
                        value={term.clauseType}
                        onValueChange={(value) => updateTerm(term.id, "clauseType", value)}
                      >
                        <SelectTrigger className="rounded-lg h-20">
                          <SelectValue placeholder="Select category..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PAT_CATEGORIES.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              {cat.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {term.clauseType && (
                        <p className="text-xs text-slate-500 mt-1">
                          {PAT_CATEGORIES.find(c => c.value === term.clauseType)?.description}
                        </p>
                      )}
                    </div>
                    <div className="col-span-5">
                      <Textarea
                        value={term.expectedTerm}
                        onChange={(e) => updateTerm(term.id, "expectedTerm", e.target.value)}
                        placeholder="Describe the expected term..."
                        className="rounded-lg resize-none h-20"
                      />
                    </div>
                    <div className="col-span-3">
                      <Textarea
                        value={term.notes}
                        onChange={(e) => updateTerm(term.id, "notes", e.target.value)}
                        placeholder="Additional notes..."
                        className="rounded-lg resize-none h-20"
                      />
                    </div>
                    <div className="col-span-1 flex items-center justify-center pt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeTerm(term.id)}
                        disabled={terms.length === 1}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress Summary */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Progress Summary</h3>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      isBasicInfoComplete ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    {isBasicInfoComplete && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Deal Information</p>
                    <p className="text-xs text-slate-500">
                      {isBasicInfoComplete ? "Complete" : "Required fields pending"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      terms.some((t) => t.clauseType && t.expectedTerm) ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    {terms.some((t) => t.clauseType && t.expectedTerm) && (
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Pre-agreed Terms</p>
                    <p className="text-xs text-slate-500">
                      {terms.filter((t) => t.clauseType && t.expectedTerm).length} term(s) defined
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Actions */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Actions</h3>

              <div className="space-y-3">
                <Button
                  onClick={handleSave}
                  disabled={!isBasicInfoComplete || isSubmitting}
                  className="w-full rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>

                <Link href="/deals" className="block">
                  <Button variant="outline" className="w-full rounded-lg bg-transparent">
                    Cancel
                  </Button>
                </Link>

                {submitError && (
                  <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                    {submitError}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
