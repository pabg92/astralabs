"use client"

import type React from "react"

import { useState, useMemo, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Search, Plus, MoreVertical, Check, X, Upload, FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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

// Legacy interface for compatibility (map database fields to UI expectations)
interface DealWithUI extends Deal {
  deal_name: string // Maps to title
  date_added: string // Maps to created_at
  brand: string // Maps to client_name
  agency: string // Needs to be added or derived
  in_out: "In" | "Out" // New field to add
  deliverables: string // From pre_agreed_terms
  usage: string // From pre_agreed_terms
  exclusivity: string // From pre_agreed_terms
  fee_amount: number // Maps to value
  confirmed: boolean // Needs to be added or derived
  category: string // New field to add
  reconciliationStatus?: ReconciliationStatus
}

const sampleDeals: Deal[] = [
  {
    id: "1",
    deal_name: "Abby Smith x Gucci - February 2025 Campaign",
    date_added: "2025-02-05",
    status: "Signed",
    talent_name: "Abby Smith",
    agency: "Lit Works",
    brand: "Gucci",
    in_out: "In",
    deliverables: "Instagram Post, YouTube Video, TikTok Series",
    usage: "30 days",
    exclusivity: "Yes - 6 months",
    fee_amount: 32500,
    currency: "USD",
    confirmed: true,
    category: "Fashion",
  },
  {
    id: "2",
    deal_name: "Ben Rogers x Asics - December 2025 Partnership",
    date_added: "2025-12-01",
    status: "Draft",
    talent_name: "Ben Rogers",
    agency: "Run Elite",
    brand: "Asics",
    in_out: "Out",
    deliverables: "TikTok Video",
    usage: "30 days",
    exclusivity: "No",
    fee_amount: 14000,
    currency: "USD",
    confirmed: false,
    category: "Sportswear",
  },
  {
    id: "3",
    deal_name: "Maya Johnson x Fenty Beauty - March 2025 Collection",
    date_added: "2025-03-15",
    status: "In Review",
    talent_name: "Maya Johnson",
    agency: "Beauty Collective",
    brand: "Fenty Beauty",
    in_out: "In",
    deliverables: "Instagram Reels, YouTube Tutorial",
    usage: "6 months",
    exclusivity: "Yes - 12 months",
    fee_amount: 45000,
    currency: "USD",
    confirmed: false,
    category: "Beauty",
  },
  {
    id: "4",
    deal_name: "Tom Chen x Apple - January 2025 Product Launch",
    date_added: "2025-01-20",
    status: "Signed",
    talent_name: "Tom Chen",
    agency: "Tech Influencers",
    brand: "Apple",
    in_out: "In",
    deliverables: "YouTube Review, Instagram Stories",
    usage: "90 days",
    exclusivity: "No",
    fee_amount: 28000,
    currency: "USD",
    confirmed: true,
    category: "Tech",
  },
  {
    id: "5",
    deal_name: "Lisa Wang x Nike - April 2025 Athletic Campaign",
    date_added: "2025-04-10",
    status: "Draft",
    talent_name: "Lisa Wang",
    agency: "Sports Marketing Pro",
    brand: "Nike",
    in_out: "Out",
    deliverables: "Instagram Post, TikTok Video",
    usage: "60 days",
    exclusivity: "Yes - 3 months",
    fee_amount: 19500,
    currency: "USD",
    confirmed: false,
    category: "Sportswear",
  },
  {
    id: "6",
    deal_name: "Sarah Kim x Chanel - May 2025 Fashion Week",
    date_added: "2025-05-01",
    status: "In Review",
    talent_name: "Sarah Kim",
    agency: "Luxury Talent",
    brand: "Chanel",
    in_out: "In",
    deliverables: "Instagram Campaign, YouTube Vlog",
    usage: "45 days",
    exclusivity: "Yes - 9 months",
    fee_amount: 52000,
    currency: "USD",
    confirmed: false,
    category: "Fashion",
  },
]

export default function DealsPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("newest")
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)
  const [reconciliationStatuses, setReconciliationStatuses] = useState<Record<string, ReconciliationStatus>>({})
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Fetch deals from API
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true)

        // Call API endpoint instead of direct Supabase query
        const response = await fetch('/api/deals')

        if (!response.ok) {
          throw new Error(`API error: ${response.statusText}`)
        }

        const result = await response.json()

        if (result.success && result.data) {
          setDeals(result.data)
        } else {
          console.error("API returned error:", result.error)
          // Fallback to empty array on error
          setDeals([])
        }
      } catch (error) {
        console.error("Error fetching deals:", error)
        // Keep empty array to avoid blank screen during development
        setDeals([])
      } finally {
        setLoading(false)
      }
    }

    fetchDeals()
  }, [])

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

  const filteredAndSortedDeals = useMemo(() => {
    let filtered = deals

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

    // Category filter (TODO: Add category field to database or derive from metadata)
    // if (categoryFilter !== "all") {
    //   filtered = filtered.filter((deal) => deal.category === categoryFilter)
    // }

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
  }, [deals, searchQuery, statusFilter, categoryFilter, sortBy, reconciliationStatuses])

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
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1600px] px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Deals Overview</h1>
            <p className="mt-2 text-gray-600">Manage your talent deals and contract reconciliations</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowUploadModal(!showUploadModal)}
              className="border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Contract
            </Button>
            <Link href="/deals/new">
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="mr-2 h-4 w-4" />
                New Deal
              </Button>
            </Link>
          </div>
        </div>

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
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
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
                <SelectTrigger className="w-[150px]">
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
                <SelectTrigger className="w-[150px]">
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
        </div>

        {/* Table */}
        {filteredAndSortedDeals.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
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
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
            <div className="text-4xl mb-4">⏳</div>
            <p className="text-gray-600">Loading deals...</p>
          </div>
        ) : (
          <div className="deals-table-container overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 min-w-[280px]">Deal Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Date Added</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900 min-w-[180px]">Contract Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Talent</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Brand</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Fee</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-900">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedDeals.map((deal, index) => {
                  const unifiedStatus = getUnifiedStatus(deal)
                  // Helper to get pre-agreed term value
                  const getTermValue = (category: string) => {
                    return deal.pre_agreed_terms?.find(t => t.term_category === category)?.expected_value || "—"
                  }

                  return (
                    <tr
                      key={deal.id}
                      className={`border-t border-gray-200 transition-colors hover:bg-blue-50 ${
                        index % 2 === 1 ? "bg-gray-50/50" : ""
                      }`}
                    >
                      <td className="px-4 py-4 min-w-[280px]">
                        <Link
                          href={`/deals/${deal.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-700 hover:underline text-sm"
                        >
                          {deal.title}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(deal.created_at || "")}</td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-gray-900">{deal.talent_name}</td>
                      <td className="px-4 py-3 text-gray-900">{deal.client_name}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">
                        {formatCurrency(deal.value || 0, deal.currency || "USD")}
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/deals/${deal.id}`}>View Details</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/deals/${deal.id}/edit`}>Edit Deal</Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/reconciliation?dealId=${deal.id}`} className="font-semibold text-blue-600">
                                {unifiedStatus.stage === "Redlining"
                                  ? "Continue Reconciliation"
                                  : "Start Reconciliation"}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600">Archive Deal</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
