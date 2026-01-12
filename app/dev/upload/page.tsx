"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Upload, FileText, Loader2, Zap, AlertTriangle } from "lucide-react"

export default function DevQuickUploadPage() {
  const router = useRouter()

  // Form state
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [talentName, setTalentName] = useState("Test Talent")
  const [clientName, setClientName] = useState("Test Brand")
  const [addSampleTerms, setAddSampleTerms] = useState(true)

  // Upload state
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ deal_id: string; document_id: string; redirect_url: string } | null>(null)

  // File handlers
  const handleFileSelect = (selectedFile: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
    if (!allowedTypes.includes(selectedFile.type)) {
      setError("Invalid file type. Only PDF and DOCX are supported.")
      return
    }
    setFile(selectedFile)
    setError(null)
    if (!title) {
      setTitle(`Test Deal - ${selectedFile.name.replace(/\.[^/.]+$/, "")}`)
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) handleFileSelect(selectedFile)
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
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleFileSelect(droppedFile)
  }

  // Upload handler
  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      if (title) formData.append("title", title)
      formData.append("talent_name", talentName)
      formData.append("client_name", clientName)
      formData.append("add_sample_terms", addSampleTerms.toString())

      const response = await fetch("/api/dev/quick-upload", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Upload failed")
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to App
          </Link>
          <Badge variant="outline" className="border-orange-300 text-orange-700 bg-orange-50">
            Dev Only
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className="h-8 w-8 text-blue-500" />
            <h1 className="text-3xl font-bold text-slate-900">Quick Upload</h1>
          </div>
          <p className="text-slate-600">
            Fast contract testing - auto-creates deal + pre-agreed terms and goes straight to reconciliation.
          </p>
        </div>

        <Card>
          <CardHeader className="border-b bg-slate-50">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Development testing only - not available in production
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Drop Zone */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragging
                  ? "border-blue-400 bg-blue-50"
                  : file
                  ? "border-green-400 bg-green-50"
                  : "border-slate-200 hover:border-slate-300 bg-slate-50"
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileText className="h-12 w-12 text-green-500" />
                  <p className="font-medium text-slate-900">{file.name}</p>
                  <p className="text-sm text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFile(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <label className="cursor-pointer block">
                  <Upload className="h-12 w-12 text-slate-400 mx-auto mb-3" />
                  <p className="font-medium text-slate-700 mb-1">
                    Drag & drop PDF/DOCX here
                  </p>
                  <p className="text-sm text-slate-500">or click to browse</p>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={handleFileInput}
                  />
                </label>
              )}
            </div>

            {/* Form Fields */}
            <div className="grid gap-4">
              <div>
                <Label htmlFor="title">Deal Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Auto-generated from filename"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="talent">Talent Name</Label>
                  <Input
                    id="talent"
                    value={talentName}
                    onChange={(e) => setTalentName(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="brand">Brand Name</Label>
                  <Input
                    id="brand"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="terms"
                  checked={addSampleTerms}
                  onCheckedChange={(checked) => setAddSampleTerms(checked === true)}
                />
                <Label htmlFor="terms" className="text-sm font-normal cursor-pointer">
                  Add sample pre-agreed terms (Brand Name, Talent Name, Payment Terms)
                </Label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Success Display */}
            {result && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
                <p className="font-medium text-green-800">Upload successful!</p>
                <p className="text-sm text-green-700">Deal ID: {result.deal_id}</p>
                <p className="text-sm text-green-700">Document ID: {result.document_id}</p>
                <Button
                  className="mt-2"
                  onClick={() => router.push(result.redirect_url)}
                >
                  Go to Reconciliation
                </Button>
              </div>
            )}
          </CardContent>

          <CardFooter className="border-t bg-slate-50">
            <Button
              className="w-full"
              size="lg"
              disabled={!file || isUploading}
              onClick={handleUpload}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading & Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Process
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 flex justify-center gap-4 text-sm">
          <Link
            href="/dev/process"
            className="text-blue-600 hover:underline"
          >
            Direct Extraction (no deal)
          </Link>
          <span className="text-slate-300">|</span>
          <Link
            href="/deals/new"
            className="text-slate-600 hover:underline"
          >
            Full Deal Form
          </Link>
        </div>
      </main>
    </div>
  )
}
