"use client"

import { useState, useEffect } from "react"

export type LayoutMode = "standard" | "compact"

const STORAGE_KEY = "contractbuddy-dashboard-layout"

export function useLayoutPreference() {
  const [layout, setLayout] = useState<LayoutMode>("standard")
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "standard" || saved === "compact") {
      setLayout(saved)
    }
    setIsLoaded(true)
  }, [])

  const updateLayout = (newLayout: LayoutMode) => {
    setLayout(newLayout)
    localStorage.setItem(STORAGE_KEY, newLayout)
  }

  return { layout, updateLayout, isLoaded }
}
