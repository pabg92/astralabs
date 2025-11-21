"use client"

import type React from "react"

import { useState } from "react"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Home, ArrowRight, Sparkles } from "lucide-react"

interface PreAgreedTerm {
  id: string
  clauseType: string
  expectedTerm: string
  notes: string
}

export default function SetupPage() {
  const router = useRouter()
  const [terms, setTerms] = useState<PreAgreedTerm[]>([{ id: "1", clauseType: "", expectedTerm: "", notes: "" }])
  const [contractFile, setContractFile] = useState<File | null>(null)

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setContractFile(file)
    }
  }

  const canProceed = terms.some((term) => term.clauseType && term.expectedTerm) && contractFile

  const handleStartReconciliation = () => {
    const validTerms = terms.filter((term) => term.clauseType && term.expectedTerm)
    localStorage.setItem("preAgreedTerms", JSON.stringify(validTerms))
    if (contractFile) {
      localStorage.setItem("contractFileName", contractFile.name)
    }
    router.push("/reconciliation")
  }

  const handleSkip = () => {
    router.push("/reconciliation")
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/")
    }, 3000)

    return () => clearTimeout(timer)
  }, [router])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 flex items-center justify-center p-6">
      <Card className="max-w-2xl w-full p-8 shadow-xl rounded-2xl border-blue-200 bg-white">
        <div className="text-center space-y-6">
          {/* Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Sparkles className="w-10 h-10 text-white" />
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-3">Setup Process Streamlined!</h1>
            <p className="text-lg text-slate-600 leading-relaxed">
              We've simplified your workflow. You can now start contract reconciliation directly from the homepage
              without any separate setup steps.
            </p>
          </div>

          {/* Features */}
          <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">What's New:</h3>
            <ul className="text-sm text-blue-700 space-y-2 text-left">
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>Upload contracts and start reconciliation instantly from the homepage</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>Quick access to recent deals with one-click reconciliation</span>
              </li>
              <li className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5 flex-shrink-0" />
                <span>Streamlined workflow with fewer steps and faster results</span>
              </li>
            </ul>
          </div>

          {/* CTA */}
          <div className="space-y-3">
            <Button
              onClick={() => router.push("/")}
              size="lg"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg"
            >
              <Home className="w-5 h-5 mr-2" />
              Go to Homepage
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-xs text-slate-500">Redirecting automatically in 3 seconds...</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
