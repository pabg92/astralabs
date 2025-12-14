"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { FileText, Database, Scale, Search, Brain, CheckCircle2, Sparkles, Zap, Eye, BookOpen } from "lucide-react"
import confetti from "canvas-confetti"

interface ThoughtStep {
  icon: React.ElementType
  text: string
  duration: number
  substeps?: string[]
}

// Optimized for ~30 second total animation
const processingThoughts: ThoughtStep[] = [
  { icon: FileText, text: "Receiving contract document...", duration: 800 },
  { icon: Eye, text: "Scanning document structure", duration: 1000, substeps: ["Detecting page boundaries", "Identifying section headers", "Mapping clause locations"] },
  { icon: BookOpen, text: "Extracting contractual clauses", duration: 1200, substeps: ["Payment Terms detected", "Deliverables found", "IP Rights identified", "Confidentiality located", "Termination mapped"] },
  { icon: Database, text: "Invoking Legal Clause Library", duration: 1000, substeps: ["Connecting to LCL", "Loading 260+ templates", "Preparing semantic engine"] },
  { icon: Brain, text: "Generating embeddings", duration: 1200, substeps: ["Vector encoding", "1024-dim semantic space", "Normalising similarity"] },
  { icon: Search, text: "P1 Reconciliation", duration: 1400, substeps: ["Matching pre-agreed terms", "Computing similarity", "Finding discrepancies", "Flagging missing clauses"] },
  { icon: Scale, text: "Analysing risk factors", duration: 1000, substeps: ["Evaluating deviations", "Assessing impact", "Scoring risk levels"] },
  { icon: Zap, text: "Running GPT analysis", duration: 1200, substeps: ["Generating summaries", "Identifying obligations", "Highlighting review areas"] },
  { icon: Sparkles, text: "Finalising report", duration: 800, substeps: ["Aggregating results", "Computing RAG statuses", "Preparing interface"] },
]

const didYouKnowFacts = [
  "The average contract has 40+ clauses that need review",
  "ContractBuddy can identify 260+ standard clause types",
  "RAG = Red (issues), Amber (review), Green (approved)",
  "P1 reconciliation catches 95%+ of term mismatches",
  "AI embedding vectors capture semantic meaning, not just keywords",
  "Most contract disputes arise from ambiguous payment terms",
  "Our LCL is based on real influencer contracts from 100+ brands",
  "Green clauses match industry-standard language exactly",
  "Amber clauses need a human eye - slight variations detected",
  "Red clauses indicate significant deviations from agreed terms",
]

interface ProcessingThoughtsProps {
  onComplete?: () => void
  isActuallyProcessing?: boolean
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
  const [animationComplete, setAnimationComplete] = useState(false)
  const [factIndex, setFactIndex] = useState(0)
  const [ragLight, setRagLight] = useState<"green" | "amber" | "red">("green")
  const containerRef = useRef<HTMLDivElement>(null)
  const onCompleteRef = useRef(onComplete)

  // Keep onComplete ref updated
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  // Green confetti bursts
  useEffect(() => {
    confetti({
      particleCount: 50,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
    })

    const confettiInterval = setInterval(() => {
      if (!animationComplete) {
        confetti({
          particleCount: 25,
          spread: 50,
          origin: { y: 0.7, x: 0.3 + Math.random() * 0.4 },
          colors: ['#22c55e', '#16a34a', '#15803d', '#86efac', '#4ade80'],
          gravity: 0.8,
          scalar: 0.9,
        })
      }
    }, 5000)

    return () => clearInterval(confettiInterval)
  }, [animationComplete])

  // Cycle "Did you know?" facts every 4 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex(prev => (prev + 1) % didYouKnowFacts.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Cycle RAG lights
  useEffect(() => {
    const lights: Array<"green" | "amber" | "red"> = ["green", "amber", "red"]
    let idx = 0
    const interval = setInterval(() => {
      idx = (idx + 1) % lights.length
      setRagLight(lights[idx])
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  // Typewriter effect
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
    }, 20) // Faster typing

    return () => clearInterval(typeInterval)
  }, [currentStep, currentSubstep])

  // Progress through steps
  useEffect(() => {
    if (isTyping) return

    const step = processingThoughts[currentStep]
    if (!step) {
      setAnimationComplete(true)
      onCompleteRef.current?.()
      return
    }

    const hasSubsteps = step.substeps && step.substeps.length > 0
    const isLastSubstep = !hasSubsteps || currentSubstep >= (step.substeps?.length || 0) - 1

    const timer = setTimeout(() => {
      if (hasSubsteps && !isLastSubstep) {
        setCurrentSubstep(prev => prev + 1)
      } else {
        setCompletedSteps(prev => {
          if (prev.includes(currentStep)) return prev
          return [...prev, currentStep]
        })
        if (currentStep < processingThoughts.length - 1) {
          setCurrentStep(prev => prev + 1)
          setCurrentSubstep(0)
        } else {
          setAnimationComplete(true)
          onCompleteRef.current?.()
        }
      }
    }, hasSubsteps ? 400 : step.duration)

    return () => clearTimeout(timer)
  }, [isTyping, currentStep, currentSubstep])

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [completedSteps, displayedText])

  const currentThought = processingThoughts[currentStep]
  const CurrentIcon = currentThought?.icon || Brain
  const progressPercent = Math.min(100, Math.round((completedSteps.length / processingThoughts.length) * 100))

  return (
    <div className={cn("min-h-screen bg-slate-50 flex items-center justify-center p-6", className)}>
      <div className="flex flex-col items-center gap-6 max-w-xl w-full">

        {/* CBA Logo with RAG Traffic Lights */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            {/* Main Logo Circle */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-200">
              <span className="text-2xl font-bold text-white tracking-tight">CBA</span>
            </div>

            {/* RAG Traffic Lights - vertical on the right */}
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-slate-800 rounded-full py-2 px-1.5 shadow-lg">
              <div className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                ragLight === "red" ? "bg-red-500 shadow-red-500/50 shadow-md" : "bg-red-900/40"
              )} />
              <div className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                ragLight === "amber" ? "bg-amber-500 shadow-amber-500/50 shadow-md" : "bg-amber-900/40"
              )} />
              <div className={cn(
                "w-3 h-3 rounded-full transition-all duration-300",
                ragLight === "green" ? "bg-emerald-500 shadow-emerald-500/50 shadow-md" : "bg-emerald-900/40"
              )} />
            </div>

            {/* Sparkle */}
            <div className="absolute -top-1 -left-1 w-6 h-6 bg-emerald-500 rounded-full animate-bounce flex items-center justify-center shadow-md">
              <Sparkles className="w-3 h-3 text-white" />
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-800">ContractBuddy AI</h1>
            <p className="text-sm text-emerald-600">Scrutinising your contract...</p>
          </div>
        </div>

        {/* Progress Card */}
        <div className="w-full bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Progress Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3">
            <div className="flex items-center justify-between text-white text-sm">
              <span className="font-medium">Analysing contract</span>
              <span className="font-bold">{progressPercent}%</span>
            </div>
            <div className="mt-2 h-1.5 bg-emerald-700/30 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/90 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div ref={containerRef} className="p-3 space-y-2 max-h-[200px] overflow-y-auto">
            {completedSteps.map((stepIndex) => {
              const step = processingThoughts[stepIndex]
              const StepIcon = step.icon
              return (
                <div key={stepIndex} className="flex items-start gap-2 text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <StepIcon className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-xs font-medium">{step.text}</span>
                    </div>
                  </div>
                </div>
              )
            })}

            {currentThought && !animationComplete && (
              <div className="flex items-start gap-2 text-slate-800">
                <CurrentIcon className="w-4 h-4 text-emerald-500 animate-pulse mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="text-xs font-medium">
                    {currentThought.substeps?.[currentSubstep] ? currentThought.text : displayedText}
                    {isTyping && !currentThought.substeps?.[currentSubstep] && (
                      <span className="inline-block w-1.5 h-3 ml-0.5 bg-emerald-500 animate-pulse" />
                    )}
                  </span>
                  {currentThought.substeps && currentSubstep >= 0 && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {currentThought.substeps.slice(0, currentSubstep + 1).map((sub, i) => (
                        <div
                          key={i}
                          className={cn(
                            "text-[10px] flex items-center gap-1",
                            i === currentSubstep ? "text-emerald-600" : "text-slate-400"
                          )}
                        >
                          {i === currentSubstep ? (
                            <>
                              <span className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                              {displayedText}
                              {isTyping && <span className="w-1 h-2 bg-emerald-500 animate-pulse" />}
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                              {sub}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Waiting state */}
          {animationComplete && isActuallyProcessing && (
            <div className="px-4 py-3 bg-emerald-50 border-t border-emerald-100">
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-emerald-700 font-medium">Loading your results...</p>
              </div>
            </div>
          )}
        </div>

        {/* Did You Know? Box */}
        <div className="w-full bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-[10px] text-white font-bold">?</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wide">Did you know?</p>
              <p className="text-xs text-emerald-700 mt-0.5 transition-all duration-500">
                {didYouKnowFacts[factIndex]}
              </p>
            </div>
          </div>
        </div>

        {/* Bouncing dots */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-emerald-500 animate-bounce"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </div>

        {/* Tagline */}
        <p className="text-[10px] text-slate-400 italic">
          Smart Contract Reviews. For People With Better Things To Do.
        </p>
      </div>
    </div>
  )
}
