"use client"

import type React from "react"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import Link from "next/link"
import {
  FileText,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Shield,
  ArrowRight,
  Briefcase,
  Sparkles,
  Target,
  Award,
  Activity,
  PlayCircle,
  Loader2,
  AlertCircle,
  LayoutGrid,
  LayoutList,
  Upload,
} from "lucide-react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useLayoutPreference } from "@/hooks/use-layout-preference"

interface RecentDeal {
  id: string
  title: string
  client_name: string
  talent_name: string
  status: "draft" | "in_review" | "signed" | "cancelled"
  progress: number
  is_urgent: boolean
  updated_at: string | null
}

interface DashboardStats {
  contracts_reconciled: number
  contracts_reconciled_change: number
  contracts_signed: number
  contracts_signed_change: number
  clauses_reviewed: number
  clauses_reviewed_change: number
  hours_saved: number
  hours_saved_change: number
  avg_risk_reduction: number
  avg_risk_reduction_change: number
  recent_deals: RecentDeal[]
}

// Helper function to format relative time
function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return ""
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export default function HomePage() {
  const [currentTime, setCurrentTime] = useState("")
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const { user, isLoaded: userLoaded } = useUser()
  const { layout, updateLayout, isLoaded: layoutLoaded } = useLayoutPreference()

  // Get user's first name for greeting
  const firstName = user?.firstName || "there"

  useEffect(() => {
    const hour = new Date().getHours()
    if (hour < 12) setCurrentTime("morning")
    else if (hour < 18) setCurrentTime("afternoon")
    else setCurrentTime("evening")
  }, [])

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/dashboard/stats")
        const result = await response.json()

        if (result.success) {
          setStats(result.data)
        } else {
          setError(result.error || "Failed to load dashboard data")
          // Use fallback data from error response if available
          if (result.data) {
            setStats(result.data)
          }
        }
      } catch (err) {
        console.error("Error fetching dashboard stats:", err)
        setError("Failed to connect to server")
        // Set empty stats as fallback
        setStats({
          contracts_reconciled: 0,
          contracts_reconciled_change: 0,
          contracts_signed: 0,
          contracts_signed_change: 0,
          clauses_reviewed: 0,
          clauses_reviewed_change: 0,
          hours_saved: 0,
          hours_saved_change: 0,
          avg_risk_reduction: 0,
          avg_risk_reduction_change: 0,
          recent_deals: [],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  // Keyboard shortcut: Press "N" to start new reconciliation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        router.push("/deals/new")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [router])

  const handleReconcileDeal = (dealId: string) => {
    // Check if there's a last viewed clause for this deal
    const lastClause = localStorage.getItem(`contractbuddy-last-clause-${dealId}`)
    if (lastClause) {
      router.push(`/reconciliation?dealId=${dealId}&resumeAt=${lastClause}`)
    } else {
      router.push(`/reconciliation?dealId=${dealId}`)
    }
  }

  // Build KPIs from stats
  const kpis = [
    {
      label: "Contracts Reconciled",
      value: stats?.contracts_reconciled ?? 0,
      change: `+${stats?.contracts_reconciled_change ?? 0} this month`,
      icon: FileText,
      color: "blue",
      trend: "up",
    },
    {
      label: "Contracts Signed",
      value: stats?.contracts_signed ?? 0,
      change: `+${stats?.contracts_signed_change ?? 0} this month`,
      icon: CheckCircle2,
      color: "emerald",
      trend: "up",
    },
    {
      label: "Clauses Reviewed",
      value: stats?.clauses_reviewed ?? 0,
      change: `+${stats?.clauses_reviewed_change ?? 0} this month`,
      icon: Activity,
      color: "purple",
      trend: "up",
    },
    {
      label: "Hours Saved",
      value: stats?.hours_saved ?? 0,
      change: `+${stats?.hours_saved_change ?? 0} this month`,
      icon: Clock,
      color: "amber",
      trend: "up",
    },
    {
      label: "Avg Risk Reduction",
      value: `${stats?.avg_risk_reduction ?? 0}%`,
      change: `${stats?.avg_risk_reduction_change ?? 0}% green matches`,
      icon: Shield,
      color: "rose",
      trend: "up",
    },
  ]

  // Map recent deals from stats
  const recentDeals = stats?.recent_deals ?? []

  const quickActions = [
    {
      title: "Start New Reconciliation",
      description: "Upload and review a new contract",
      icon: FileText,
      href: "/deals/new",
      color: "blue",
      shortcut: "N",
    },
    {
      title: "View All Deals",
      description: "Browse and manage your contracts",
      icon: Briefcase,
      href: "/deals",
      color: "purple",
    },
    {
      title: "View Reports",
      description: "Access analytics and insights",
      icon: TrendingUp,
      href: "/deals",
      color: "emerald",
    },
  ]

  // Check if this is a new user (no data yet)
  const isNewUser = stats &&
    stats.contracts_reconciled === 0 &&
    stats.contracts_signed === 0 &&
    stats.clauses_reviewed === 0

  return (
    <TooltipProvider>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <Card className="p-8 shadow-lg rounded-2xl border-blue-200 bg-gradient-to-br from-blue-500 to-blue-600 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-6 h-6" />
                <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm">
                  {currentTime === "morning"
                    ? "Good Morning"
                    : currentTime === "afternoon"
                      ? "Good Afternoon"
                      : "Good Evening"}
                </Badge>
              </div>
              <h1 className="text-4xl font-bold mb-3">
                Welcome back, {userLoaded ? firstName : "..."}!
              </h1>
              {loading ? (
                <p className="text-xl text-blue-50 mb-6">
                  Loading your stats...
                </p>
              ) : isNewUser ? (
                <p className="text-xl text-blue-50 mb-6">
                  Ready to get started? Upload your first contract to begin saving time!
                </p>
              ) : (
                <p className="text-xl text-blue-50 mb-6">
                  You've saved{" "}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="font-bold text-white cursor-help border-b border-dashed border-white/50">
                        {stats?.hours_saved ?? 0}h
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="bg-slate-900 text-white">
                      <p>≈ {((stats?.hours_saved ?? 0) / 40).toFixed(1)} weeks of manual work</p>
                    </TooltipContent>
                  </Tooltip>{" "}
                  this month
                </p>
              )}
              <div className="flex gap-4">
                <Link href="/deals">
                  <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 rounded-lg shadow-lg">
                    <Briefcase className="w-5 h-5 mr-2" />
                    View Deals
                  </Button>
                </Link>
                <Link href="/deals/new">
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-white/30 text-white hover:bg-white/10 rounded-lg backdrop-blur-sm bg-transparent"
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    Start Reconciliation
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-5 h-5" />
            <span>{error} - Showing cached data</span>
          </div>
        )}

        {layout === "standard" && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-slate-700" />
              <h2 className="text-2xl font-semibold text-slate-800">Your Performance</h2>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateLayout("standard")}
                    className={`px-2 ${layout === "standard" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Standard view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateLayout("compact")}
                    className={`px-2 ${layout === "compact" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutList className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Compact view</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {kpis.map((kpi) => (
              <Card
                key={kpi.label}
                className={`p-5 shadow-md rounded-xl border-2 transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                  kpi.color === "blue"
                    ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white"
                    : kpi.color === "emerald"
                      ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white"
                      : kpi.color === "purple"
                        ? "border-purple-200 bg-gradient-to-br from-purple-50 to-white"
                        : kpi.color === "amber"
                          ? "border-amber-200 bg-gradient-to-br from-amber-50 to-white"
                          : "border-rose-200 bg-gradient-to-br from-rose-50 to-white"
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      kpi.color === "blue"
                        ? "bg-blue-500 text-white"
                        : kpi.color === "emerald"
                          ? "bg-emerald-500 text-white"
                          : kpi.color === "purple"
                            ? "bg-purple-500 text-white"
                            : kpi.color === "amber"
                              ? "bg-amber-500 text-white"
                              : "bg-rose-500 text-white"
                    }`}
                  >
                    <kpi.icon className="w-5 h-5" />
                  </div>
                  {loading ? (
                    <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                  ) : (
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  )}
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">
                  {loading ? (
                    <span className="text-slate-400">--</span>
                  ) : (
                    kpi.value
                  )}
                </div>
                <div className="text-xs font-medium text-slate-600 mb-2">{kpi.label}</div>
                <div className="text-xs text-emerald-600 font-medium">
                  {loading ? "Loading..." : kpi.change}
                </div>
              </Card>
            ))}
          </div>
        </div>
        )}

        {/* Compact mode layout toggle - shows in header when compact is active */}
        {layout === "compact" && (
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-slate-700" />
              <h2 className="text-2xl font-semibold text-slate-800">Dashboard</h2>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateLayout("standard")}
                    className={`px-2 ${layout === "standard" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Standard view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateLayout("compact")}
                    className={`px-2 ${layout === "compact" ? "bg-white shadow-sm" : ""}`}
                  >
                    <LayoutList className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Compact view</TooltipContent>
              </Tooltip>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-2 p-6 shadow-lg rounded-xl border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-slate-700" />
                <h3 className="text-xl font-semibold text-slate-800">Recent Deals</h3>
              </div>
              <Link href="/deals">
                <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700">
                  View All
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : recentDeals.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-16 h-16 mx-auto mb-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <Upload className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="text-xl font-semibold text-slate-800 mb-2">Get Started</h4>
                <p className="text-slate-500 mb-6 max-w-sm mx-auto">
                  Upload your first contract to begin reconciliation
                </p>
                <Link href="/deals/new">
                  <Button className="bg-blue-600 hover:bg-blue-700 shadow-md">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Contract
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-4 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                          <FileText className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-slate-900">{deal.title}</div>
                          <div className="text-sm text-slate-600">
                            {deal.client_name} x {deal.talent_name}
                          </div>
                          {deal.updated_at && (
                            <div className="text-xs text-slate-400 mt-0.5">
                              Updated {formatRelativeTime(deal.updated_at)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={
                            deal.is_urgent
                              ? "bg-red-100 text-red-700 border-red-300"
                              : deal.status === "in_review"
                                ? "bg-amber-100 text-amber-700 border-amber-300"
                                : deal.status === "signed"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-300"
                                  : "bg-slate-100 text-slate-700 border-slate-300"
                          }
                        >
                          {deal.is_urgent
                            ? "Urgent"
                            : deal.status === "in_review"
                              ? "In Progress"
                              : deal.status === "signed"
                                ? "Complete"
                                : "Draft"}
                        </Badge>
                        {deal.status !== "signed" && (
                          <Button
                            size="sm"
                            onClick={() => handleReconcileDeal(deal.id)}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                          >
                            <PlayCircle className="w-4 h-4 mr-1" />
                            Reconcile
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            deal.progress === 100
                              ? "bg-emerald-500"
                              : deal.progress >= 50
                                ? "bg-blue-500"
                                : "bg-amber-500"
                          }`}
                          style={{ width: `${deal.progress}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600">{deal.progress}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Right sidebar: Quick Actions (standard) or Compact KPIs (compact) */}
          {layout === "standard" ? (
            <Card className="p-6 shadow-lg rounded-xl border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-slate-700" />
                <h3 className="text-xl font-semibold text-slate-800">Quick Actions</h3>
              </div>
              <div className="space-y-3">
                {quickActions.map((action) => {
                  const content = (
                    <div
                      className={`p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md cursor-pointer ${
                        action.color === "blue"
                          ? "border-blue-200 hover:border-blue-300 bg-gradient-to-br from-blue-50 to-white"
                          : action.color === "purple"
                            ? "border-purple-200 hover:border-purple-300 bg-gradient-to-br from-purple-50 to-white"
                            : "border-emerald-200 hover:border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            action.color === "blue"
                              ? "bg-blue-500 text-white"
                              : action.color === "purple"
                                ? "bg-purple-500 text-white"
                                : "bg-emerald-500 text-white"
                          }`}
                        >
                          <action.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{action.title}</span>
                            {"shortcut" in action && action.shortcut && (
                              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 border border-slate-300 rounded text-slate-600">
                                {action.shortcut}
                              </kbd>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 mt-1">{action.description}</div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  )

                  return (
                    <Link key={action.title} href={action.href}>
                      {content}
                    </Link>
                  )
                })}
              </div>
            </Card>
          ) : (
            /* Compact KPIs in sidebar */
            <Card className="p-6 shadow-lg rounded-xl border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-5 h-5 text-slate-700" />
                <h3 className="text-xl font-semibold text-slate-800">Metrics</h3>
              </div>
              <div className="space-y-3">
                {kpis.map((kpi) => {
                  const changeValue = kpi.change.match(/[+-]?\d+/)?.[0] ?? "0"
                  const isPositive = !kpi.change.startsWith("-")
                  return (
                    <div
                      key={kpi.label}
                      className={`p-3 rounded-lg border transition-all ${
                        kpi.color === "blue"
                          ? "border-blue-200 bg-blue-50/50"
                          : kpi.color === "emerald"
                            ? "border-emerald-200 bg-emerald-50/50"
                            : kpi.color === "purple"
                              ? "border-purple-200 bg-purple-50/50"
                              : kpi.color === "amber"
                                ? "border-amber-200 bg-amber-50/50"
                                : "border-rose-200 bg-rose-50/50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center ${
                              kpi.color === "blue"
                                ? "bg-blue-500 text-white"
                                : kpi.color === "emerald"
                                  ? "bg-emerald-500 text-white"
                                  : kpi.color === "purple"
                                    ? "bg-purple-500 text-white"
                                    : kpi.color === "amber"
                                      ? "bg-amber-500 text-white"
                                      : "bg-rose-500 text-white"
                            }`}
                          >
                            <kpi.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs text-slate-500">
                              {kpi.label === "Contracts Reconciled" ? "Reconciled" :
                               kpi.label === "Contracts Signed" ? "Signed" :
                               kpi.label === "Clauses Reviewed" ? "Reviewed" :
                               kpi.label === "Hours Saved" ? "Hours" :
                               "Risk ↓"}
                            </div>
                            <div className="text-xl font-bold text-slate-900">
                              {loading ? "--" : kpi.value}
                            </div>
                          </div>
                        </div>
                        {/* Trend indicator */}
                        <div className="flex flex-col items-end">
                          {loading ? (
                            <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                          ) : (
                            <>
                              {isPositive ? (
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                              )}
                              <div className={`text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                                {changeValue}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Quick Actions below Recent Deals when in compact mode */}
        {layout === "compact" && (
          <div className="mb-8">
            <Card className="p-6 shadow-lg rounded-xl border-slate-200">
              <div className="flex items-center gap-2 mb-4">
                <Award className="w-5 h-5 text-slate-700" />
                <h3 className="text-xl font-semibold text-slate-800">Quick Actions</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {quickActions.map((action) => (
                  <Link key={action.title} href={action.href}>
                    <div
                      className={`p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md cursor-pointer ${
                        action.color === "blue"
                          ? "border-blue-200 hover:border-blue-300 bg-gradient-to-br from-blue-50 to-white"
                          : action.color === "purple"
                            ? "border-purple-200 hover:border-purple-300 bg-gradient-to-br from-purple-50 to-white"
                            : "border-emerald-200 hover:border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            action.color === "blue"
                              ? "bg-blue-500 text-white"
                              : action.color === "purple"
                                ? "bg-purple-500 text-white"
                                : "bg-emerald-500 text-white"
                          }`}
                        >
                          <action.icon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{action.title}</span>
                            {"shortcut" in action && action.shortcut && (
                              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 border border-slate-300 rounded text-slate-600">
                                {action.shortcut}
                              </kbd>
                            )}
                          </div>
                          <div className="text-xs text-slate-600">{action.description}</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        )}

        <Card className="p-6 shadow-lg rounded-xl border-slate-200 bg-gradient-to-br from-slate-50 to-white text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-slate-800">
              {isNewUser ? "Ready to Get Started!" : "Keep Up the Great Work!"}
            </h3>
          </div>
          <p className="text-slate-600 max-w-2xl mx-auto">
            {isNewUser ? (
              "Upload your first contract to start saving time on contract reconciliation. Our AI-powered system will help you review clauses faster and reduce risk."
            ) : (
              `You're making excellent progress on your contract reconciliation journey. ${
                (stats?.avg_risk_reduction ?? 0) > 0
                  ? `Your risk reduction is at ${stats?.avg_risk_reduction}%, helping you close deals faster and reduce risk.`
                  : "Keep reviewing clauses to improve your risk reduction metrics."
              }`
            )}
          </p>
        </Card>
      </div>
    </div>
    </TooltipProvider>
  )
}
