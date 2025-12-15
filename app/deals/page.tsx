"use client"

import type React from "react"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Search,
  Plus,
  MoreVertical,
  Check,
  X,
  Upload,
  FileUp,
  AlertCircle,
  RefreshCw,
  History,
  ArrowLeft,
  LayoutGrid,
  LayoutList,
  CheckCircle2,
  Send,
  Building,
  FileText,
  Archive,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"
import { VersionHistoryModal } from "@/components/deals/version-history-modal"
import { useColumnPreset, type ColumnId } from "@/hooks/use-column-preset"
import { useToast } from "@/hooks/use-toast"
import type { Tables } from "@/types/database"

interface ReconciliationStatus {
  dealId: string
  totalClauses: number
  acceptedCount: number
  rejectedCount: number
  pendingCount: number
  completionRate: number
  lastUpdated: string
}

// Database types
type Deal = Tables<"deals"> & {
  pre_agreed_terms?: Tables<"pre_agreed_terms">[]
}

// Filter preset definitions
const FILTER_PRESETS = [
  { id: "needs-upload", label: "Needs Upload", icon: Upload },
  { id: "redlining-50", label: "Redlining > 50%", icon: FileText },
  { id: "signed-30d", label: "Signed 30 days", icon: CheckCircle2 },
] as const

type FilterPresetId = typeof FILTER_PRESETS[number]["id"]

// Workflow status helper
function getWorkflowStatus(deal: Deal, hasDocument: boolean) {
  if (deal.status === "signed") {
    return { label: "Signed", color: "emerald", icon: CheckCircle2, bgClass: "bg-emerald-100 text-emerald-700 border-emerald-300" }
  }
  if (deal.status === "in_review") {
    return { label: "With Brand", color: "amber", icon: Send, bgClass: "bg-amber-100 text-amber-700 border-amber-300" }
  }
  if (hasDocument) {
    return { label: "With Us", color: "blue", icon: Building, bgClass: "bg-blue-100 text-blue-700 border-blue-300" }
  }
  return { label: "Internal", color: "slate", icon: FileText, bgClass: "bg-slate-100 text-slate-700 border-slate-300" }
}

export default function DealsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { preset, updatePreset, isColumnVisible } = useColumnPreset()

  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [activeFilterPreset, setActiveFilterPreset] = useState<FilterPresetId | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [reconciliationStatuses, setReconciliationStatuses] = useState<Record<string, ReconciliationStatus>>({})
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [draggingDealId, setDraggingDealId] = useState<string | null>(null)
  const [uploadingDealId, setUploadingDealId] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [historyModalDeal, setHistoryModalDeal] = useState<Deal | null>(null)

  // Selection state for bulk operations
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set())

  // Archive confirmation state
  const [archiveConfirmDeal, setArchiveConfirmDeal] = useState<Deal | null>(null)
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const demoAuthorId = process.env.NEXT_PUBLIC_DEMO_AUTHOR_ID || "00000000-0000-0000-0000-000000000002"

  // Fetch deals from API
  const fetchDeals = useCallback(async () => {
    try {
      setLoading(true)
      setFetchError(null)

      const response = await fetch("/api/deals")
      const result = await response.json()

      if (!response.ok || !result.success) {
        const errorMessage = result.error || result.details || `API error: ${response.statusText}`
        setFetchError(errorMessage)
        setDeals([])
        return
      }

      setDeals(result.data || [])
    } catch (error) {
      console.error("Error fetching deals:", error)
      setFetchError(error instanceof Error ? error.message : "Unable to connect to server")
      setDeals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDeals()
  }, [fetchDeals])

  const uploadDocumentForDeal = useCallback(
    async (deal: Deal, file: File) => {
      setUploadingDealId(deal.id)
      setUploadMessage(null)
      try {
        const formData = new FormData()
        formData.append("file", file)
        formData.append("created_by", (deal as any).created_by || demoAuthorId)

        const response = await fetch(`/api/deals/${deal.id}/upload`, {
          method: "POST",
          body: formData,
        })

        const result = await response.json()

        if (!response.ok || !result.success) {
          const details = result.error || result.details || "Upload failed"
          throw new Error(details)
        }

        setUploadMessage(`Uploaded "${file.name}" to ${deal.title}`)
        // Refresh deals so latest document status shows up
        fetchDeals()
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed"
        setUploadMessage(message)
        console.error("Upload error:", err)
      } finally {
        setUploadingDealId(null)
      }
    },
    [demoAuthorId, fetchDeals]
  )

  const handleRowDrop = useCallback(
    async (deal: Deal, event: React.DragEvent<HTMLTableRowElement>) => {
      event.preventDefault()
      setDraggingDealId(null)
      const file = event.dataTransfer?.files?.[0]
      if (!file) return
      await uploadDocumentForDeal(deal, file)
    },
    [uploadDocumentForDeal]
  )

  const handleRowDragOver = useCallback(
    (dealId: string, event: React.DragEvent<HTMLTableRowElement>) => {
      event.preventDefault()
      setDraggingDealId(dealId)
    },
    []
  )

  const handleRowDragLeave = useCallback(() => {
    setDraggingDealId(null)
  }, [])

  const handleFileInputChange = useCallback(
    async (deal: Deal, event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      await uploadDocumentForDeal(deal, file)
      event.target.value = ""
    },
    [uploadDocumentForDeal]
  )

  const getUnifiedStatus = (deal: Deal) => {
    const reconciliation = reconciliationStatuses[deal.id]
    const completionRate = reconciliation?.completionRate || 0

    // Map database status to UI status
    const dbStatus = deal.status

    // Determine unified status based on contract status and reconciliation progress
    if (dbStatus === "signed") {
      return {
        stage: "Signed",
        stageNumber: 4,
        progress: 100,
        color: "emerald",
        bgColor: "bg-emerald-100",
        textColor: "text-emerald-700",
        borderColor: "border-emerald-300",
      }
    } else if (completionRate === 100) {
      return {
        stage: "Approved",
        stageNumber: 3,
        progress: 100,
        color: "blue",
        bgColor: "bg-blue-100",
        textColor: "text-blue-700",
        borderColor: "border-blue-300",
      }
    } else if (dbStatus === "in_review" || completionRate > 0) {
      return {
        stage: "Redlining",
        stageNumber: 2,
        progress: completionRate,
        color: "amber",
        bgColor: "bg-amber-100",
        textColor: "text-amber-700",
        borderColor: "border-amber-300",
      }
    } else {
      return {
        stage: "Pending",
        stageNumber: 1,
        progress: 0,
        color: "slate",
        bgColor: "bg-slate-100",
        textColor: "text-slate-700",
        borderColor: "border-slate-300",
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const file = files[0]
      handleContractUpload(file)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      const file = files[0]
      handleContractUpload(file)
    }
  }

  const handleContractUpload = (file: File) => {
    console.log("[v0] Contract uploaded:", file.name)

    // Simulate contract data extraction (placeholder for future AI extraction)
    const extractedData = {
      deal_name: `${file.name.replace(/\.[^/.]+$/, "")} Partnership`,
      talent_name: "Extracted Talent Name",
      agency: "Extracted Agency",
      brand: "Extracted Brand",
      in_out: "In" as "In" | "Out",
      deliverables: "Instagram Post, TikTok Video",
      usage: "30 days",
      exclusivity: "Yes - 6 months",
      fee_amount: "25000",
      category: "Fashion",
      contractFileName: file.name,
    }

    // Store extracted data in localStorage for the new deal page to use
    localStorage.setItem("uploadedContractData", JSON.stringify(extractedData))

    // Navigate to new deal page
    router.push("/deals/new")
  }

  // Archive a single deal
  const handleArchiveDeal = useCallback(async (deal: Deal) => {
    setArchiving(true)
    try {
      const response = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" })
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Failed to archive deal")
      }

      toast({
        title: "Deal archived",
        description: `"${deal.title}" has been archived.`,
      })
      fetchDeals()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to archive deal",
        variant: "destructive",
      })
    } finally {
      setArchiving(false)
      setArchiveConfirmDeal(null)
    }
  }, [fetchDeals, toast])

  // Bulk archive selected deals
  const handleBulkArchive = useCallback(async () => {
    setArchiving(true)
    const dealIds = Array.from(selectedDealIds)
    let successCount = 0
    let errorCount = 0

    for (const dealId of dealIds) {
      try {
        const response = await fetch(`/api/deals/${dealId}`, { method: "DELETE" })
        if (response.ok) {
          successCount++
        } else {
          errorCount++
        }
      } catch {
        errorCount++
      }
    }

    if (successCount > 0) {
      toast({
        title: "Deals archived",
        description: `${successCount} deal(s) archived successfully.${errorCount > 0 ? ` ${errorCount} failed.` : ""}`,
      })
    } else {
      toast({
        title: "Error",
        description: "Failed to archive deals.",
        variant: "destructive",
      })
    }

    setSelectedDealIds(new Set())
    setBulkArchiveConfirm(false)
    setArchiving(false)
    fetchDeals()
  }, [selectedDealIds, fetchDeals, toast])

  // Selection handlers
  const handleSelectDeal = useCallback((dealId: string, checked: boolean) => {
    setSelectedDealIds(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(dealId)
      } else {
        next.delete(dealId)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback((checked: boolean, visibleDealIds: string[]) => {
    if (checked) {
      setSelectedDealIds(new Set(visibleDealIds))
    } else {
      setSelectedDealIds(new Set())
    }
  }, [])

  // Filter preset handler
  const handleFilterPreset = useCallback((presetId: FilterPresetId | null) => {
    if (presetId === activeFilterPreset) {
      // Toggle off
      setActiveFilterPreset(null)
      setStatusFilter("all")
    } else {
      setActiveFilterPreset(presetId)
      // Clear other filters when applying preset
      setSearchQuery("")
      setStatusFilter("all")
    }
  }, [activeFilterPreset])

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = deals

    // Filter preset takes precedence
    if (activeFilterPreset) {
      switch (activeFilterPreset) {
        case "needs-upload":
          // Deals without a document (we check if latest_document exists)
          filtered = filtered.filter((deal) => !(deal as any).latest_document)
          break
        case "redlining-50":
          // Deals in Redlining stage with > 50% progress
          filtered = filtered.filter((deal) => {
            const status = getUnifiedStatus(deal)
            return status.stage === "Redlining" && status.progress > 50
          })
          break
        case "signed-30d":
          // Deals signed in the last 30 days
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          filtered = filtered.filter((deal) => {
            if (deal.status !== "signed") return false
            const updatedAt = deal.updated_at ? new Date(deal.updated_at) : null
            return updatedAt && updatedAt >= thirtyDaysAgo
          })
          break
      }
    } else {
      // Regular filters when no preset is active
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(
          (deal) =>
            deal.title.toLowerCase().includes(query) ||
            deal.talent_name.toLowerCase().includes(query) ||
            deal.client_name.toLowerCase().includes(query),
        )
      }

      // Status filter
      if (statusFilter !== "all") {
        filtered = filtered.filter((deal) => {
          const unifiedStatus = getUnifiedStatus(deal)
          return unifiedStatus.stage === statusFilter
        })
      }
    }

    // Sort
    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.created_at || "").getTime() - new Date(a.created_at || "").getTime()
        case "oldest":
          return new Date(a.created_at || "").getTime() - new Date(b.created_at || "").getTime()
        case "highest":
          return (b.value || 0) - (a.value || 0)
        case "lowest":
          return (a.value || 0) - (b.value || 0)
        default:
          return 0
      }
    })

    return sorted
  }, [deals, searchQuery, statusFilter, activeFilterPreset, sortBy, reconciliationStatuses])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-gray-50" data-testid="deals-page">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {/* Back to Dashboard */}
        <div className="mb-4">
          <Link href="/">
            <Button variant="ghost" size="sm" className="-ml-2 text-gray-600 hover:text-gray-900">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deals Overview</h1>
            <p className="mt-2 text-gray-600">Manage your talent deals and contract reconciliations</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Column Preset Toggle */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updatePreset("manager")}
                    className={`px-3 ${preset === "manager" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutList className="w-4 h-4 mr-1.5" />
                    Manager
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Simple view with key columns</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updatePreset("ops")}
                    className={`px-3 ${preset === "ops" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutGrid className="w-4 h-4 mr-1.5" />
                    Ops
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Full view with all columns</TooltipContent>
              </Tooltip>
            </div>
            <Button
              variant="outline"
              onClick={() => setShowUploadModal(!showUploadModal)}
              className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              data-testid="upload-contract-button"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Contract
            </Button>
            <Link href="/deals/new">
              <Button className="bg-blue-600 hover:bg-blue-700" data-testid="new-deal-button">
                <Plus className="mr-2 h-4 w-4" />
                New Deal
              </Button>
            </Link>
          </div>
        </div>

        {/* Stats Summary Bar */}
        {!loading && deals.length > 0 && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-2xl">📋</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{deals.filter(d => getUnifiedStatus(d).stage === "Pending").length}</p>
                <p className="text-sm text-gray-500">Pending</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                <span className="text-2xl">✏️</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-700">{deals.filter(d => getUnifiedStatus(d).stage === "Redlining").length}</p>
                <p className="text-sm text-amber-600">Redlining</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-blue-200 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                <span className="text-2xl">✅</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-700">{deals.filter(d => getUnifiedStatus(d).stage === "Approved").length}</p>
                <p className="text-sm text-blue-600">Approved</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                <span className="text-2xl">🎉</span>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-700">{deals.filter(d => getUnifiedStatus(d).stage === "Signed").length}</p>
                <p className="text-sm text-emerald-600">Signed</p>
              </div>
            </div>
          </div>
        )}

        {(uploadingDealId || uploadMessage) && (
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            {uploadingDealId ? "Uploading document to deal..." : uploadMessage}
          </div>
        )}

        {/* Error Banner */}
        {fetchError && !loading && (
          <div data-testid="deals-error-banner" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-red-800">Unable to load deals</p>
                <p className="text-sm text-red-600 mt-1">{fetchError}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setFetchError(null); fetchDeals(); }}
                className="flex-shrink-0 border-red-200 text-red-700 hover:bg-red-100"
                data-testid="deals-retry-button"
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Upload Modal with drag and drop */}
        {showUploadModal && (
          <div className="mb-6 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 p-8 transition-all">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-all ${
                isDragging
                  ? "border-blue-500 bg-blue-100"
                  : "border-blue-300 bg-white hover:border-blue-400 hover:bg-blue-50"
              }`}
            >
              <FileUp className={`h-16 w-16 mb-4 ${isDragging ? "text-blue-600" : "text-blue-400"}`} />
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Contract Document</h3>
              <p className="text-gray-600 mb-6 text-center max-w-md">
                Drag and drop your contract files here, or click to browse. We'll automatically extract key details to
                create your deal.
              </p>
              <div className="flex gap-3">
                <label htmlFor="file-upload">
                  <Button asChild className="bg-blue-600 hover:bg-blue-700 cursor-pointer">
                    <span>
                      <Upload className="mr-2 h-4 w-4" />
                      Choose Files
                    </span>
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
                <Button variant="outline" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Search */}
            <div className="relative w-full md:w-[300px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search deals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="deals-search-input"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="deals-status-filter">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Redlining">Redlining</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Signed">Signed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]" data-testid="deals-category-filter">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Fashion">Fashion</SelectItem>
                  <SelectItem value="Sportswear">Sportswear</SelectItem>
                  <SelectItem value="Beauty">Beauty</SelectItem>
                  <SelectItem value="Tech">Tech</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[150px]" data-testid="deals-sort-select">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="oldest">Oldest First</SelectItem>
                  <SelectItem value="highest">Highest Value</SelectItem>
                  <SelectItem value="lowest">Lowest Value</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Filter Preset Pills */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
            <span className="text-sm text-gray-500">Quick filters:</span>
            {FILTER_PRESETS.map((filterPreset) => {
              const Icon = filterPreset.icon
              return (
                <button
                  key={filterPreset.id}
                  onClick={() => handleFilterPreset(filterPreset.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeFilterPreset === filterPreset.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {filterPreset.label}
                </button>
              )
            })}
            {activeFilterPreset && (
              <button
                onClick={() => handleFilterPreset(null)}
                className="text-sm text-gray-500 hover:text-gray-700 underline ml-2"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>

        {/* Bulk Action Toolbar */}
        {selectedDealIds.size > 0 && (
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="font-medium text-blue-900">
                {selectedDealIds.size} deal{selectedDealIds.size !== 1 ? "s" : ""} selected
              </span>
              <button
                onClick={() => setSelectedDealIds(new Set())}
                className="text-sm text-blue-600 hover:text-blue-800 underline"
              >
                Clear selection
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkArchiveConfirm(true)}
                disabled={archiving}
              >
                <Archive className="w-4 h-4 mr-1.5" />
                Archive Selected
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {filteredAndSortedDeals.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center" data-testid="deals-empty-state">
            <div className="text-6xl">📋</div>
            <h3 className="mt-4 text-xl font-semibold text-gray-900">No deals found</h3>
            <p className="mt-2 text-gray-600">
              {searchQuery || statusFilter !== "all" || categoryFilter !== "all"
                ? "Try adjusting your filters or search query."
                : "Create your first deal to begin managing talent contracts and reconciliations."}
            </p>
            {!searchQuery && statusFilter === "all" && categoryFilter === "all" && (
              <Link href="/deals/new">
                <Button className="mt-6 bg-blue-600 hover:bg-blue-700">Create Your First Deal</Button>
              </Link>
            )}
          </div>
        ) : loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center" data-testid="deals-loading-state">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Loading deals...</p>
          </div>
        ) : (
          <div className="deals-table-container overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm" data-testid="deals-table-container">
            <table className="w-full text-sm" data-testid="deals-table">
              <thead className="bg-gray-50">
                <tr>
                  {/* Checkbox Column */}
                  {isColumnVisible("select") && (
                    <th className="px-4 py-3 w-[50px]">
                      <Checkbox
                        checked={selectedDealIds.size === filteredAndSortedDeals.length && filteredAndSortedDeals.length > 0}
                        onCheckedChange={(checked) =>
                          handleSelectAll(!!checked, filteredAndSortedDeals.map(d => d.id))
                        }
                        aria-label="Select all deals"
                      />
                    </th>
                  )}
                  {isColumnVisible("name") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 min-w-[280px]">Deal Name</th>
                  )}
                  {isColumnVisible("dateAdded") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Date Added</th>
                  )}
                  {isColumnVisible("contractStatus") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 min-w-[140px]">Contract Status</th>
                  )}
                  {isColumnVisible("workflowStatus") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900 min-w-[130px]">Workflow</th>
                  )}
                  {isColumnVisible("version") && (
                    <th className="px-4 py-3 text-center font-semibold text-gray-900">Ver.</th>
                  )}
                  {isColumnVisible("talent") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Talent</th>
                  )}
                  {isColumnVisible("brand") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Brand</th>
                  )}
                  {isColumnVisible("fee") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Fee</th>
                  )}
                  {isColumnVisible("actions") && (
                    <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody data-testid="deals-table-body">
                {filteredAndSortedDeals.map((deal, index) => {
                  const unifiedStatus = getUnifiedStatus(deal)
                  const hasDocument = !!(deal as any).latest_document
                  const workflowStatus = getWorkflowStatus(deal, hasDocument)
                  const WorkflowIcon = workflowStatus.icon

                  return (
                    <tr
                      key={deal.id}
                      data-testid={`deal-row-${deal.id}`}
                      onDragOver={(e) => handleRowDragOver(deal.id, e)}
                      onDragLeave={handleRowDragLeave}
                      onDrop={(e) => handleRowDrop(deal, e)}
                      className={`group relative border-t border-gray-200 transition-colors hover:bg-blue-50 ${
                        index % 2 === 1 ? "bg-gray-50/50" : ""
                      } ${draggingDealId === deal.id ? "ring-2 ring-blue-400 bg-blue-100" : ""} ${
                        selectedDealIds.has(deal.id) ? "bg-blue-50" : ""
                      }`}
                    >
                      {/* Drag overlay */}
                      {draggingDealId === deal.id && (
                        <td colSpan={10} className="absolute inset-0 p-0 z-10">
                          <div className="flex items-center justify-center h-full bg-blue-100/95 border-2 border-dashed border-blue-400 rounded">
                            <div className="flex items-center gap-2 text-blue-700 font-medium">
                              <FileUp className="h-5 w-5 animate-bounce" />
                              <span>Drop to upload contract</span>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Checkbox Column */}
                      {isColumnVisible("select") && (
                        <td className="px-4 py-3 w-[50px]">
                          <Checkbox
                            checked={selectedDealIds.has(deal.id)}
                            onCheckedChange={(checked) => handleSelectDeal(deal.id, !!checked)}
                            aria-label={`Select ${deal.title}`}
                          />
                        </td>
                      )}

                      {/* Deal Name */}
                      {isColumnVisible("name") && (
                        <td className="px-4 py-4 min-w-[280px]" data-testid={`deal-title-${deal.id}`}>
                          <Link
                            href={`/reconciliation?dealId=${deal.id}`}
                            className="font-semibold text-blue-600 hover:text-blue-700 hover:underline text-sm"
                          >
                            {deal.title}
                          </Link>
                        </td>
                      )}

                      {/* Date Added */}
                      {isColumnVisible("dateAdded") && (
                        <td className="px-4 py-3 text-gray-600">{formatDate(deal.created_at || "")}</td>
                      )}

                      {/* Contract Status */}
                      {isColumnVisible("contractStatus") && (
                        <td className="px-4 py-3" data-testid={`deal-status-${deal.id}`}>
                          <div className="relative inline-flex items-center overflow-hidden rounded-md border-2 min-w-[140px]">
                            {/* Background progress fill for Redlining status */}
                            {unifiedStatus.stage === "Redlining" && (
                              <div
                                className="absolute inset-0 bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-500"
                                style={{ width: `${unifiedStatus.progress}%` }}
                              />
                            )}

                            {/* Status badge content */}
                            <div
                              className={`relative z-10 w-full px-4 py-1.5 text-center font-semibold text-sm transition-colors ${
                                unifiedStatus.stage === "Pending"
                                  ? "bg-slate-100 text-slate-700 border-slate-300"
                                  : unifiedStatus.stage === "Redlining"
                                    ? "bg-amber-50/80 text-amber-900 border-amber-300"
                                    : unifiedStatus.stage === "Approved"
                                      ? "bg-blue-100 text-blue-700 border-blue-300"
                                      : "bg-emerald-100 text-emerald-700 border-emerald-300"
                              }`}
                            >
                              <span className="flex items-center justify-center gap-2">
                                {unifiedStatus.stage}
                                {unifiedStatus.stage === "Redlining" && unifiedStatus.progress > 0 && (
                                  <span className="font-bold text-amber-900">{unifiedStatus.progress}%</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>
                      )}

                      {/* Workflow Status */}
                      {isColumnVisible("workflowStatus") && (
                        <td className="px-4 py-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${workflowStatus.bgClass}`}>
                                <WorkflowIcon className="w-3.5 h-3.5" />
                                {workflowStatus.label}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {workflowStatus.label === "With Brand" && "Contract sent to brand for review"}
                              {workflowStatus.label === "With Us" && "Contract being reviewed internally"}
                              {workflowStatus.label === "Internal" && "Initial draft, not yet sent"}
                              {workflowStatus.label === "Signed" && "Contract fully executed"}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      )}

                      {/* Version */}
                      {isColumnVisible("version") && (
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full font-semibold text-xs ${
                            (deal.version || 1) >= 3
                              ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                              : (deal.version || 1) === 2
                                ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                                : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                          }`}>
                            v{deal.version || 1}
                          </span>
                        </td>
                      )}

                      {/* Talent */}
                      {isColumnVisible("talent") && (
                        <td className="px-4 py-3 text-gray-900">{deal.talent_name}</td>
                      )}

                      {/* Brand */}
                      {isColumnVisible("brand") && (
                        <td className="px-4 py-3 text-gray-900">{deal.client_name}</td>
                      )}

                      {/* Fee */}
                      {isColumnVisible("fee") && (
                        <td className="px-4 py-3 font-semibold text-gray-900">
                          {formatCurrency(deal.value || 0, deal.currency || "USD")}
                        </td>
                      )}

                      {/* Actions */}
                      {isColumnVisible("actions") && (
                        <td className="px-4 py-3" data-testid={`deal-actions-${deal.id}`}>
                          <div className="flex items-center gap-1">
                            {/* Inline upload button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <label className="cursor-pointer">
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.txt"
                                    className="hidden"
                                    onChange={(e) => handleFileInputChange(deal, e)}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                                    asChild
                                  >
                                    <span>
                                      <Upload className="h-4 w-4" />
                                    </span>
                                  </Button>
                                </label>
                              </TooltipTrigger>
                              <TooltipContent>Upload contract</TooltipContent>
                            </Tooltip>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/reconciliation?dealId=${deal.id}`} className="font-semibold text-blue-600">
                                    {unifiedStatus.stage === "Redlining"
                                      ? "Continue Reconciliation"
                                      : "Start Reconciliation"}
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild>
                                  <Link href={`/reconciliation?dealId=${deal.id}`}>View Details</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/deals/${deal.id}/edit`}>Edit Deal</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setHistoryModalDeal(deal)}>
                                  <History className="mr-2 h-4 w-4" />
                                  Version History
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="cursor-pointer">
                                  <label className="flex w-full cursor-pointer items-center">
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.txt"
                                      className="hidden"
                                      onChange={(e) => handleFileInputChange(deal, e)}
                                    />
                                    <Upload className="mr-2 h-4 w-4" />
                                    Upload Document
                                  </label>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setArchiveConfirmDeal(deal)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Archive Deal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>

    {/* Version History Modal */}
    {historyModalDeal && (
      <VersionHistoryModal
        dealId={historyModalDeal.id}
        dealTitle={historyModalDeal.title}
        open={!!historyModalDeal}
        onOpenChange={(open) => !open && setHistoryModalDeal(null)}
      />
    )}

    {/* Single Archive Confirmation Dialog */}
    <AlertDialog open={!!archiveConfirmDeal} onOpenChange={(open) => !open && setArchiveConfirmDeal(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Deal</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive "{archiveConfirmDeal?.title}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => archiveConfirmDeal && handleArchiveDeal(archiveConfirmDeal)}
            disabled={archiving}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {archiving ? "Archiving..." : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    {/* Bulk Archive Confirmation Dialog */}
    <AlertDialog open={bulkArchiveConfirm} onOpenChange={setBulkArchiveConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {selectedDealIds.size} Deal{selectedDealIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive {selectedDealIds.size} selected deal{selectedDealIds.size !== 1 ? "s" : ""}? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleBulkArchive}
            disabled={archiving}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {archiving ? "Archiving..." : `Archive ${selectedDealIds.size} Deal${selectedDealIds.size !== 1 ? "s" : ""}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </TooltipProvider>
  )
}
