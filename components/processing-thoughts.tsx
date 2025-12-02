"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { FileText, Database, Scale, Search, Brain, CheckCircle2, Sparkles, Zap, Eye, BookOpen } from "lucide-react"

interface ThoughtStep {
  icon: React.ElementType
  text: string
  duration: number // ms to display before next
  substeps?: string[]
}

const processingThoughts: ThoughtStep[] = [
  {
    icon: FileText,
    text: "Receiving contract document...",
    duration: 1200,
  },
  {
    icon: Eye,
    text: "Scanning document structure",
    duration: 1500,
    substeps: [
      "Detecting page boundaries",
      "Identifying section headers",
      "Mapping clause locations",
    ],
  },
  {
    icon: BookOpen,
    text: "Extracting contractual clauses",
    duration: 2000,
    substeps: [
      "Payment Terms detected",
      "Deliverables clause found",
      "IP Rights section identified",
      "Confidentiality provisions located",
      "Termination clauses mapped",
    ],
  },
  {
    icon: Database,
    text: "Invoking Legal Clause Library",
    duration: 1800,
    substeps: [
      "Connecting to LCL database",
      "Loading 260+ standard clause templates",
      "Preparing semantic matching engine",
    ],
  },
  {
    icon: Brain,
    text: "Generating clause embeddings",
    duration: 2200,
    substeps: [
      "Converting clauses to vector space",
      "1024-dimensional semantic encoding",
      "Normalising for cosine similarity",
    ],
  },
  {
    icon: Search,
    text: "Performing P1 Reconciliation",
    duration: 2500,
    substeps: [
      "Matching against pre-agreed terms",
      "Computing similarity scores",
      "Identifying discrepancies",
      "Flagging missing mandatory clauses",
    ],
  },
  {
    icon: Scale,
    text: "Analysing risk factors",
    duration: 1800,
    substeps: [
      "Evaluating clause deviations",
      "Assessing commercial impact",
      "Scoring risk levels",
    ],
  },
  {
    icon: Zap,
    text: "Running GPT analysis",
    duration: 2000,
    substeps: [
      "Generating plain English summaries",
      "Identifying key obligations",
      "Highlighting areas for review",
    ],
  },
  {
    icon: Sparkles,
    text: "Finalising reconciliation report",
    duration: 1500,
    substeps: [
      "Aggregating match results",
      "Computing RAG statuses",
      "Preparing review interface",
    ],
  },
]

interface ProcessingThoughtsProps {
  onComplete?: () => void
  isActuallyProcessing?: boolean // true = real processing, will poll; false = just showing animation
  className?: string
}

export function ProcessingThoughts({
  onComplete,
  isActuallyProcessing = true,
  className
}: ProcessingThoughtsProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [currentSubstep, setCurrentSubstep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])
  const [displayedText, setDisplayedText] = useState("")
  const [isTyping, setIsTyping] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)

  // Typewriter effect for current text
  useEffect(() => {
    const step = processingThoughts[currentStep]
    if (!step) return

    const targetText = step.substeps?.[currentSubstep] || step.text
    let charIndex = 0
    setIsTyping(true)
    setDisplayedText("")

    const typeInterval = setInterval(() => {
      if (charIndex < targetText.length) {
        setDisplayedText(targetText.slice(0, charIndex + 1))
        charIndex++
      } else {
        clearInterval(typeInterval)
        setIsTyping(false)
      }
    }, 25) // typing speed

    return () => clearInterval(typeInterval)
  }, [currentStep, currentSubstep])

  // Progress through steps and substeps
  useEffect(() => {
    if (isTyping) return // wait for typing to finish

    const step = processingThoughts[currentStep]
    if (!step) {
      onComplete?.()
      return
    }

    const hasSubsteps = step.substeps && step.substeps.length > 0
    const isLastSubstep = !hasSubsteps || currentSubstep >= (step.substeps?.length || 0) - 1

    const timer = setTimeout(() => {
      if (hasSubsteps && !isLastSubstep) {
        // Move to next substep
        setCurrentSubstep(prev => prev + 1)
      } else {
        // Complete this step and move to next
        setCompletedSteps(prev => [...prev, currentStep])
        if (currentStep < processingThoughts.length - 1) {
          setCurrentStep(prev => prev + 1)
          setCurrentSubstep(0)
        } else {
          // All done
          onComplete?.()
        }
      }
    }, hasSubsteps ? 600 : step.duration)

    return () => clearTimeout(timer)
  }, [isTyping, currentStep, currentSubstep, onComplete])

  // Auto-scroll to bottom
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [completedSteps, displayedText])

  const currentThought = processingThoughts[currentStep]
  const CurrentIcon = currentThought?.icon || Brain

  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[500px] p-8", className)}>
      {/* Main processing card */}
      <div className="w-full max-w-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl shadow-2xl border border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Brain className="w-8 h-8 text-blue-400" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">ContractBuddy AI</h2>
              <p className="text-sm text-slate-400">Scrutinising your contract...</p>
            </div>
          </div>
        </div>

        {/* Thoughts stream */}
        <div
          ref={containerRef}
          className="p-6 space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-600"
        >
          {/* Completed steps */}
          {completedSteps.map((stepIndex) => {
            const step = processingThoughts[stepIndex]
            const StepIcon = step.icon
            return (
              <div key={stepIndex} className="flex items-start gap-3 text-slate-400">
                <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <StepIcon className="w-4 h-4" />
                    <span className="text-sm">{step.text}</span>
                  </div>
                  {step.substeps && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      {step.substeps.map((sub, i) => (
                        <div key={i} className="text-xs text-slate-500 flex items-center gap-1.5">
                          <span className="w-1 h-1 bg-slate-600 rounded-full" />
                          {sub}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Current step */}
          {currentThought && (
            <div className="flex items-start gap-3 text-white">
              <div className="w-5 h-5 mt-0.5 flex-shrink-0 relative">
                <CurrentIcon className="w-5 h-5 text-blue-400 animate-pulse" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {currentThought.substeps?.[currentSubstep]
                      ? currentThought.text
                      : displayedText}
                    {isTyping && !currentThought.substeps?.[currentSubstep] && (
                      <span className="inline-block w-2 h-4 ml-0.5 bg-blue-400 animate-pulse" />
                    )}
                  </span>
                </div>
                {currentThought.substeps && currentSubstep >= 0 && (
                  <div className="ml-6 mt-2 space-y-1">
                    {currentThought.substeps.slice(0, currentSubstep + 1).map((sub, i) => (
                      <div
                        key={i}
                        className={cn(
                          "text-xs flex items-center gap-1.5 transition-colors",
                          i === currentSubstep ? "text-blue-300" : "text-slate-500"
                        )}
                      >
                        {i === currentSubstep ? (
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-green-500" />
                        )}
                        {i === currentSubstep ? (
                          <>
                            {displayedText}
                            {isTyping && (
                              <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse" />
                            )}
                          </>
                        ) : (
                          sub
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>Processing</span>
            <span>{Math.round((completedSteps.length / processingThoughts.length) * 100)}%</span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
              style={{ width: `${(completedSteps.length / processingThoughts.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 bg-slate-800/50 border-t border-slate-700">
          <p className="text-xs text-slate-500 text-center">
            {isActuallyProcessing
              ? "This page will automatically refresh when processing completes"
              : "Preparing your contract review workspace..."
            }
          </p>
        </div>
      </div>
    </div>
  )
}
