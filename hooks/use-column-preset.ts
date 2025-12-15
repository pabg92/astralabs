"use client"

import { useState, useEffect } from "react"

export type ColumnPreset = "manager" | "ops"

const STORAGE_KEY = "contractbuddy-deals-column-preset"

// Define which columns are visible in each preset
export const COLUMN_PRESETS = {
  manager: ["select", "name", "contractStatus", "workflowStatus", "actions"],
  ops: ["select", "name", "dateAdded", "contractStatus", "workflowStatus", "version", "talent", "brand", "fee", "actions"],
} as const

export type ColumnId =
  | "select"
  | "name"
  | "dateAdded"
  | "contractStatus"
  | "workflowStatus"
  | "version"
  | "talent"
  | "brand"
  | "fee"
  | "actions"

export function useColumnPreset() {
  const [preset, setPreset] = useState<ColumnPreset>("ops")
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === "manager" || saved === "ops") {
      setPreset(saved)
    }
    setIsLoaded(true)
  }, [])

  const updatePreset = (newPreset: ColumnPreset) => {
    setPreset(newPreset)
    localStorage.setItem(STORAGE_KEY, newPreset)
  }

  const isColumnVisible = (columnId: ColumnId): boolean => {
    return COLUMN_PRESETS[preset].includes(columnId)
  }

  return { preset, updatePreset, isColumnVisible, isLoaded }
}
