"use client"

import type React from "react"
import { useState } from "react"
import Link from "next/link"
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { ArrowLeft, Upload, FileText, Loader2, FileSearch, AlertTriangle, Clock, Hash, ChevronDown, ChevronUp } from "lucide-react"

interface ExtractedClause {
  clause_type: string
  content: string
  confidence: number
  rag_status: 'green' | 'amber' | 'red'
  summary: string
  section_title?: string
}

interface ExtractionResult {
  success: boolean
  text_length: number
  extraction_time_ms: number
  text_extraction_time_ms: number
  gemini_time_ms: number
  clauses: ExtractedClause[]
  stats: {
    total: number
    by_type: Record<string, number>
  }
}

export default function DevProcessPage() {
  // Form state
  const [file, setFile] = useState<File | null>(null)

  // Upload state
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ExtractionResult | null>(null)

  // UI state
  const [expandedClauses, setExpandedClauses] = useState<Set<number>>(new Set())

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
    setResult(null)
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

  // Process handler
  const handleProcess = async () => {
    if (!file) return

    setIsProcessing(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/dev/extract", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Extraction failed")
      }

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed")
    } finally {
      setIsProcessing(false)
    }
  }

  const toggleClause = (index: number) => {
    setExpandedClauses((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const getRagColor = (status: string) => {
    switch (status) {
      case 'green': return 'bg-green-100 text-green-800 border-green-300'
      case 'amber': return 'bg-amber-100 text-amber-800 border-amber-300'
      case 'red': return 'bg-red-100 text-red-800 border-red-300'
      default: return 'bg-slate-100 text-slate-800 border-slate-300'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
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
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <FileSearch className="h-8 w-8 text-purple-500" />
            <h1 className="text-3xl font-bold text-slate-900">Direct Extraction</h1>
          </div>
          <p className="text-slate-600">
            Extract clauses directly from a PDF/DOCX - no deal created, just see raw extraction results.
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
                  ? "border-purple-400 bg-purple-50"
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
                    onClick={() => {
                      setFile(null)
                      setResult(null)
                    }}
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

            {/* Error Display */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </CardContent>

          <CardFooter className="border-t bg-slate-50">
            <Button
              className="w-full"
              size="lg"
              disabled={!file || isProcessing}
              onClick={handleProcess}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Extracting Clauses...
                </>
              ) : (
                <>
                  <FileSearch className="mr-2 h-4 w-4" />
                  Extract Clauses
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Results Section */}
        {result && (
          <Card className="mt-8">
            <CardHeader className="border-b">
              <h2 className="text-xl font-semibold">Extraction Results</h2>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <FileText className="h-4 w-4" />
                  <span>{result.text_length.toLocaleString()} chars</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{(result.extraction_time_ms / 1000).toFixed(1)}s total</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Hash className="h-4 w-4" />
                  <span>{result.stats.total} clauses</span>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-6">
              {/* Stats by Type */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-slate-700 mb-2">Clauses by Type</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(result.stats.by_type)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <Badge key={type} variant="secondary">
                        {type}: {count}
                      </Badge>
                    ))}
                </div>
              </div>

              <Separator className="my-6" />

              {/* Clause List */}
              <h3 className="text-sm font-medium text-slate-700 mb-4">All Clauses</h3>
              <ScrollArea className="h-[500px]">
                <div className="space-y-3 pr-4">
                  {result.clauses.map((clause, index) => (
                    <div
                      key={index}
                      className="border rounded-lg overflow-hidden"
                    >
                      <button
                        className="w-full p-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors text-left"
                        onClick={() => toggleClause(index)}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="font-mono text-xs">
                            {clause.clause_type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${getRagColor(clause.rag_status)}`}
                          >
                            {clause.rag_status.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {(clause.confidence * 100).toFixed(0)}% confidence
                          </span>
                        </div>
                        {expandedClauses.has(index) ? (
                          <ChevronUp className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        )}
                      </button>

                      {expandedClauses.has(index) && (
                        <div className="p-3 border-t bg-white space-y-3">
                          {clause.section_title && (
                            <p className="text-xs text-slate-500">
                              Section: {clause.section_title}
                            </p>
                          )}
                          <p className="text-sm font-medium text-slate-700">
                            {clause.summary}
                          </p>
                          <div className="p-3 bg-slate-50 rounded text-sm text-slate-600 font-mono whitespace-pre-wrap">
                            {clause.content}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Footer Links */}
        <div className="mt-8 flex justify-center gap-4 text-sm">
          <Link
            href="/dev/upload"
            className="text-blue-600 hover:underline"
          >
            Quick Upload (with deal)
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
