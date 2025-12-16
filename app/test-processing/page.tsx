"use client"

import { ProcessingThoughts } from "@/components/processing-thoughts"

export default function TestProcessingPage() {
  return (
    <ProcessingThoughts
      isActuallyProcessing={true}
      onComplete={() => {
        console.log("Animation complete!")
      }}
    />
  )
}
