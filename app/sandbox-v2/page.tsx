"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  BookOpen,
  FileCode,
  Search,
  ClipboardCheck,
  TestTube,
  AlertTriangle,
  CheckCircle,
  AlertCircle,
  TrendingUp,
  Loader2,
} from "lucide-react"
import type { SandboxStats } from "@/lib/sandbox-v2/types"

export default function SandboxV2DashboardPage() {
  const [stats, setStats] = useState<SandboxStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/sandbox-v2/stats")
      const data = await response.json()
      if (data.success) {
        setStats(data.data)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError("Failed to fetch stats")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-8 w-8" />
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Sandbox V2 - Three-Tier Architecture</h1>
        <p className="text-muted-foreground mt-2">
          Test environment for the PMS recommended clause architecture
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-600" />
          <span className="text-yellow-800">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchStats} className="ml-auto">
            Retry
          </Button>
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <Link href="/sandbox-v2/lcl">
          <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
            <BookOpen className="h-8 w-8 mb-2 text-blue-600" />
            <div className="font-semibold">LCL Browser</div>
            <div className="text-sm text-muted-foreground">Manage concepts</div>
          </Card>
        </Link>
        <Link href="/sandbox-v2/lcstx">
          <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
            <FileCode className="h-8 w-8 mb-2 text-purple-600" />
            <div className="font-semibold">LCSTX Editor</div>
            <div className="text-sm text-muted-foreground">Edit variants</div>
          </Card>
        </Link>
        <Link href="/sandbox-v2/matching">
          <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
            <Search className="h-8 w-8 mb-2 text-green-600" />
            <div className="font-semibold">Match Tester</div>
            <div className="text-sm text-muted-foreground">Test matching</div>
          </Card>
        </Link>
        <Link href="/sandbox-v2/review">
          <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors relative">
            <ClipboardCheck className="h-8 w-8 mb-2 text-orange-600" />
            <div className="font-semibold">Review Queue</div>
            <div className="text-sm text-muted-foreground">HITL approvals</div>
            {stats && stats.pending_reviews > 0 && (
              <Badge className="absolute top-2 right-2 bg-red-500">
                {stats.pending_reviews}
              </Badge>
            )}
          </Card>
        </Link>
        <Link href="/sandbox-v2/test">
          <Card className="p-4 hover:bg-muted/50 cursor-pointer transition-colors">
            <TestTube className="h-8 w-8 mb-2 text-cyan-600" />
            <div className="font-semibold">Test Runner</div>
            <div className="text-sm text-muted-foreground">Run test suite</div>
          </Card>
        </Link>
        <Card className="p-4 bg-muted/20">
          <TrendingUp className="h-8 w-8 mb-2 text-gray-400" />
          <div className="font-semibold text-gray-500">Analytics</div>
          <div className="text-sm text-muted-foreground">Coming soon</div>
        </Card>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card className="p-4">
          <div className="text-3xl font-bold">{stats?.total_concepts || 0}</div>
          <div className="text-sm text-muted-foreground">LCL Concepts</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-bold">{stats?.total_variants || 0}</div>
          <div className="text-sm text-muted-foreground">LCSTX Variants</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-bold">{stats?.total_matches || 0}</div>
          <div className="text-sm text-muted-foreground">Total Matches</div>
        </Card>
        <Card className="p-4">
          <div className="text-3xl font-bold">
            {stats ? (stats.escalation_rate * 100).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-muted-foreground">Escalation Rate</div>
        </Card>
      </div>

      {/* Risk Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Risk Distribution</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span>High Risk</span>
              </div>
              <span className="font-semibold">{stats?.high_risk_variants || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span>Medium Risk</span>
              </div>
              <span className="font-semibold">{stats?.medium_risk_variants || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span>Low Risk</span>
              </div>
              <span className="font-semibold">{stats?.low_risk_variants || 0}</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold mb-4">Match Results</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span>GREEN</span>
              </div>
              <span className="font-semibold">{stats?.green_matches || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span>AMBER</span>
              </div>
              <span className="font-semibold">{stats?.amber_matches || 0}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span>RED</span>
              </div>
              <span className="font-semibold">{stats?.red_matches || 0}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Architecture Info */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Three-Tier Architecture</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">Tier 1: LCL (Concepts)</h4>
            <p className="text-sm text-blue-800">
              High-level clause categories (Payment, Exclusivity, IP, etc.)
            </p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <h4 className="font-semibold text-purple-900 mb-2">Tier 2: LCSTX (Meanings)</h4>
            <p className="text-sm text-purple-800">
              Specific variants with risk levels, patterns, and embeddings
            </p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-semibold text-green-900 mb-2">Key Features</h4>
            <ul className="text-sm text-green-800 list-disc list-inside">
              <li>Highest risk wins</li>
              <li>PAT override hierarchy</li>
              <li>HITL escalation</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  )
}
