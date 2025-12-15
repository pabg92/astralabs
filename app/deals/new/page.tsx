"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Plus, Trash2, Upload, Save, ArrowRight, FileText, Users, CheckCircle2, Zap, Info } from "lucide-react"
import { PAT_CATEGORIES } from "@/lib/constants/pat-categories"

interface PreAgreedTerm {
  id: string
  clauseType: string
  expectedTerm: string
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
  dateAdded: string
}

export default function NewDealPage() {
  const router = useRouter()

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
    dateAdded: new Date().toISOString().split("T")[0],
  })

  // Contract upload state
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Pre-agreed terms state
  const [terms, setTerms] = useState<PreAgreedTerm[]>([{ id: "1", clauseType: "", expectedTerm: "" }])

  // Form handlers
  const updateFormData = (field: keyof DealFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // Contract upload handlers
  const handleFileUpload = (file: File) => {
    if (file && (file.type === "application/pdf" || file.type.includes("document"))) {
      setContractFile(file)

      // Simulate auto-population from contract
      if (!formData.dealName) {
        updateFormData("dealName", file.name.replace(/\.[^/.]+$/, ""))
      }
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFileUpload(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileUpload(file)
  }

  // Terms handlers
  const addTerm = () => {
    const newTerm: PreAgreedTerm = {
      id: Date.now().toString(),
      clauseType: "",
      expectedTerm: "",
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

  // Validation
  const isBasicInfoComplete = formData.dealName && formData.talent && formData.brand
  const hasValidTerms = terms.some((term) => term.clauseType && term.expectedTerm)
  const canStartReconciliation = isBasicInfoComplete && contractFile && hasValidTerms

  // Submit handlers
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSaveDraft = async () => {
    if (!isBasicInfoComplete) return

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      // Prepare FormData
      const formDataToSubmit = new FormData()
      formDataToSubmit.append("title", formData.dealName)
      formDataToSubmit.append("talent_name", formData.talent)
      formDataToSubmit.append("client_name", formData.brand)
      formDataToSubmit.append("status", "draft")

      // Optional fields
      if (formData.fee) {
        const feeValue = formData.fee.replace(/[^0-9.]/g, "")
        formDataToSubmit.append("value", feeValue)
      }
      formDataToSubmit.append("currency", "USD")

      if (formData.deliverables) {
        formDataToSubmit.append("description", formData.deliverables)
      }

      // TODO: Get these from authentication when implemented
      formDataToSubmit.append("tenant_id", "00000000-0000-0000-0000-000000000001")
      formDataToSubmit.append("created_by", "00000000-0000-0000-0000-000000000002")

      // Add pre-agreed terms as JSON
      const validTerms = terms
        .filter((term) => term.clauseType && term.expectedTerm)
        .map((term) => ({
          term_category: term.clauseType,
          term_description: term.expectedTerm,
          expected_value: null,
          is_mandatory: true,
        }))

      if (validTerms.length > 0) {
        formDataToSubmit.append("terms", JSON.stringify(validTerms))
      }

      // Submit to API
      const response = await fetch("/api/deals", {
        method: "POST",
        body: formDataToSubmit,
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create deal")
      }

      console.log("Deal saved as draft:", result.data)
      router.push("/deals")
    } catch (error) {
      console.error("Error saving draft:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to save deal")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAndReconcile = async () => {
    if (!canStartReconciliation) return

    try {
      setIsSubmitting(true)
      setSubmitError(null)

      // Prepare FormData
      const formDataToSubmit = new FormData()
      formDataToSubmit.append("title", formData.dealName)
      formDataToSubmit.append("talent_name", formData.talent)
      formDataToSubmit.append("client_name", formData.brand)
      formDataToSubmit.append("status", "in_review")

      // Optional fields
      if (formData.fee) {
        const feeValue = formData.fee.replace(/[^0-9.]/g, "")
        formDataToSubmit.append("value", feeValue)
      }
      formDataToSubmit.append("currency", "USD")

      if (formData.deliverables) {
        formDataToSubmit.append("description", formData.deliverables)
      }

      // TODO: Get these from authentication when implemented
      formDataToSubmit.append("tenant_id", "00000000-0000-0000-0000-000000000001")
      formDataToSubmit.append("created_by", "00000000-0000-0000-0000-000000000002")

      // Add pre-agreed terms as JSON
      const validTerms = terms
        .filter((term) => term.clauseType && term.expectedTerm)
        .map((term) => ({
          term_category: term.clauseType,
          term_description: term.expectedTerm,
          expected_value: null,
          is_mandatory: true,
        }))

      if (validTerms.length > 0) {
        formDataToSubmit.append("terms", JSON.stringify(validTerms))
      }

      // Add contract file if uploaded
      if (contractFile) {
        formDataToSubmit.append("file", contractFile)
      }

      // Submit to API
      const response = await fetch("/api/deals", {
        method: "POST",
        body: formDataToSubmit,
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to create deal")
      }

      console.log("Deal created with contract:", result.data)

      // Navigate to reconciliation with the new deal ID
      router.push(`/reconciliation?dealId=${result.data.id}`)
    } catch (error) {
      console.error("Error creating deal:", error)
      setSubmitError(error instanceof Error ? error.message : "Failed to create deal")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Dev Mode Skip Button Handler
  const handleSkipToReconciliation = () => {
    console.log("[v0] Dev mode: Skipping to reconciliation")
    router.push("/reconciliation")
  }

  // Load uploaded contract data from localStorage
  useEffect(() => {
    const uploadedData = localStorage.getItem("uploadedContractData")
    if (uploadedData) {
      try {
        const data = JSON.parse(uploadedData)
        setFormData({
          dealName: data.deal_name || "",
          talent: data.talent_name || "",
          agency: data.agency || "",
          brand: data.brand || "",
          inOut: data.in_out || "",
          deliverables: data.deliverables || "",
          usage: data.usage || "",
          exclusivity: data.exclusivity || "",
          fee: data.fee_amount || "",
          dateAdded: new Date().toISOString().split("T")[0],
        })
        if (data.contractFileName) {
          setContractFile(new File([], data.contractFileName))
        }
        // Clear the localStorage after loading
        localStorage.removeItem("uploadedContractData")
      } catch (e) {
        console.error("[v0] Error loading uploaded contract data:", e)
      }
    }
  }, [])

  return (
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

            {/* Dev Mode Skip Button */}
            <Button
              onClick={handleSkipToReconciliation}
              variant="outline"
              size="sm"
              className="border-2 border-dashed border-orange-400 text-orange-600 hover:bg-orange-50 hover:text-orange-700 hover:border-orange-500 rounded-lg bg-transparent"
            >
              <Zap className="w-4 h-4 mr-2" />
              Skip to Reconciliation
              <span className="ml-2 px-2 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded border border-orange-300">
                DEV
              </span>
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Create New Deal</h1>
          <p className="text-slate-600">
            Add deal information, upload the contract, and set up pre-agreed terms for reconciliation.
          </p>
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
                    <Label htmlFor="agency">Agency</Label>
                    <Input
                      id="agency"
                      value={formData.agency}
                      onChange={(e) => updateFormData("agency", e.target.value)}
                      placeholder="e.g., Luxury Talent"
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
                    <Label htmlFor="inOut">In/Out</Label>
                    <Select value={formData.inOut} onValueChange={(value) => updateFormData("inOut", value)}>
                      <SelectTrigger className="rounded-lg">
                        <SelectValue placeholder="Select..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="In">In</SelectItem>
                        <SelectItem value="Out">Out</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="md:col-span-2">
                    <Label htmlFor="deliverables">Deliverables</Label>
                    <Textarea
                      id="deliverables"
                      value={formData.deliverables}
                      onChange={(e) => updateFormData("deliverables", e.target.value)}
                      placeholder="e.g., Instagram Campaign, YouTube Video"
                      className="rounded-lg resize-none"
                      rows={2}
                    />
                  </div>

                  <div>
                    <Label htmlFor="usage">Usage</Label>
                    <Input
                      id="usage"
                      value={formData.usage}
                      onChange={(e) => updateFormData("usage", e.target.value)}
                      placeholder="e.g., 45 days"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="exclusivity">Exclusivity</Label>
                    <Input
                      id="exclusivity"
                      value={formData.exclusivity}
                      onChange={(e) => updateFormData("exclusivity", e.target.value)}
                      placeholder="e.g., Yes - 9 months"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="fee">Fee</Label>
                    <Input
                      id="fee"
                      value={formData.fee}
                      onChange={(e) => updateFormData("fee", e.target.value)}
                      placeholder="e.g., $52,000"
                      className="rounded-lg"
                    />
                  </div>

                  <div>
                    <Label htmlFor="dateAdded">Date Added</Label>
                    <Input
                      id="dateAdded"
                      type="date"
                      value={formData.dateAdded}
                      onChange={(e) => updateFormData("dateAdded", e.target.value)}
                      className="rounded-lg"
                    />
                  </div>
                </div>
              </div>
            </Card>

            {/* Contract Upload */}
            <Card className="p-6 shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Contract Upload</h2>
                  <p className="text-sm text-slate-500">Upload the contract document for reconciliation</p>
                </div>
              </div>

              <div className="flex items-start gap-2 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-700">
                  Don&apos;t have the contract yet? No problem — save the deal as a draft and drop the contract in later from the Deals page when you&apos;re ready.
                </p>
              </div>

              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                  isDragging
                    ? "border-blue-400 bg-blue-50"
                    : contractFile
                      ? "border-emerald-400 bg-emerald-50"
                      : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
                }`}
              >
                <input
                  type="file"
                  id="contract-upload"
                  className="hidden"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileInput}
                />
                <label htmlFor="contract-upload" className="cursor-pointer">
                  {contractFile ? (
                    <>
                      <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                      <p className="text-sm font-medium text-emerald-700 mb-1">{contractFile.name}</p>
                      <p className="text-xs text-emerald-600">Contract uploaded successfully</p>
                      <Button variant="outline" size="sm" className="mt-4 rounded-lg bg-transparent">
                        Change File
                      </Button>
                    </>
                  ) : (
                    <>
                      <Upload className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-medium text-slate-700 mb-1">
                        Drag and drop your contract here, or click to browse
                      </p>
                      <p className="text-xs text-slate-500">PDF, DOC, or DOCX (Max 10MB)</p>
                    </>
                  )}
                </label>
              </div>
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
                  <div className="col-span-4 text-xs font-semibold text-slate-700 uppercase">Term Category</div>
                  <div className="col-span-7 text-xs font-semibold text-slate-700 uppercase">What We Agreed</div>
                  <div className="col-span-1"></div>
                </div>

                {/* Table Rows */}
                {terms.map((term) => (
                  <div key={term.id} className="grid grid-cols-12 gap-4 items-start">
                    <div className="col-span-4">
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
                    <div className="col-span-7">
                      <Textarea
                        value={term.expectedTerm}
                        onChange={(e) => updateTerm(term.id, "expectedTerm", e.target.value)}
                        placeholder="e.g., $5,000 fee, NET 30 payment terms"
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

              {terms.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-slate-500 mb-4">No terms added yet</p>
                  <Button onClick={addTerm} size="sm" className="rounded-lg">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Term
                  </Button>
                </div>
              )}
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
                      contractFile ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    {contractFile && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Contract Upload</p>
                    <p className="text-xs text-slate-500">{contractFile ? "Uploaded" : "Not uploaded"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      hasValidTerms ? "bg-emerald-500" : "bg-slate-200"
                    }`}
                  >
                    {hasValidTerms && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">Pre-agreed Terms</p>
                    <p className="text-xs text-slate-500">
                      {terms.filter((t) => t.clauseType && t.expectedTerm).length} term(s) added
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
                  onClick={handleCreateAndReconcile}
                  disabled={!canStartReconciliation || isSubmitting}
                  className="w-full rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-slate-300"
                >
                  {isSubmitting ? "Creating..." : "Create & Start Reconciliation"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>

                <Button
                  onClick={handleSaveDraft}
                  disabled={!isBasicInfoComplete || isSubmitting}
                  variant="outline"
                  className="w-full rounded-lg bg-transparent"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmitting ? "Saving..." : "Save as Draft"}
                </Button>

                {submitError && (
                  <div className="text-xs text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                    {submitError}
                  </div>
                )}

                {!canStartReconciliation && !submitError && (
                  <p className="text-xs text-slate-500 text-center pt-2">
                    Complete all sections to start reconciliation
                  </p>
                )}
              </div>
            </Card>

            {/* Help */}
            <Card className="p-6 shadow-sm rounded-2xl border-blue-100 bg-blue-50">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Quick Tips</h4>
              <ul className="text-xs text-blue-700 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Fill in required fields marked with *</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Upload contract to enable auto-population</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Add pre-agreed terms for faster reconciliation</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Save as draft to continue later</span>
                </li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
