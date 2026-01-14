/**
 * P1 Adapter Factory
 *
 * Creates the appropriate P1 adapter (GPT or Gemini) based on configuration.
 * Allows seamless switching between providers via P1_MODEL environment variable.
 *
 * @module adapters/p1-adapter-factory
 */

import { GPTAdapter, createGPTAdapter } from './gpt-adapter'
import {
  GeminiP1Adapter,
  createGeminiP1Adapter,
  type GeminiP1Model,
} from './gemini-p1-adapter'
import { P1_MODEL, NORMALIZATION_MODEL } from '../config/p1-config'

// ============ TYPES ============

/** Union type for P1 adapters */
export type P1Adapter = GPTAdapter | GeminiP1Adapter

/** Provider type for P1 reconciliation */
export type P1Provider = 'gemini' | 'openai'

// ============ PROVIDER DETECTION ============

/**
 * Check if a model name indicates a Gemini model
 */
export function isGeminiModel(model: string): boolean {
  return model.startsWith('gemini-')
}

/**
 * Get the AI provider for P1 based on configured model name
 */
export function getP1Provider(): P1Provider {
  return isGeminiModel(P1_MODEL) ? 'gemini' : 'openai'
}

/**
 * Get the provider for normalization based on configured model name
 */
export function getNormalizationProvider(): P1Provider {
  return isGeminiModel(NORMALIZATION_MODEL) ? 'gemini' : 'openai'
}

// ============ ADAPTER FACTORY ============

export interface CreateP1AdapterOptions {
  openaiApiKey?: string
  geminiApiKey?: string
  /** Override the comparison model (defaults to P1_MODEL from config) */
  model?: string
  /** Override the normalization model (defaults to NORMALIZATION_MODEL from config) */
  normalizationModel?: string
}

/**
 * Create the appropriate P1 adapter based on configuration
 *
 * Selection logic:
 * 1. If P1_MODEL starts with 'gemini-', use Gemini adapter
 * 2. Otherwise, use GPT adapter
 * 3. Falls back to the other provider if the primary API key is missing
 *
 * @param options - API keys and optional model overrides
 * @returns The appropriate adapter, or null if no API keys available
 */
export function createP1Adapter(options: CreateP1AdapterOptions): P1Adapter | null {
  const { openaiApiKey, geminiApiKey } = options
  const model = options.model || P1_MODEL
  const normalizationModel = options.normalizationModel || NORMALIZATION_MODEL

  const useGemini = isGeminiModel(model)

  if (useGemini) {
    if (geminiApiKey) {
      console.log(`   Using Gemini for P1 (model: ${model})`)
      return createGeminiP1Adapter(
        geminiApiKey,
        model as GeminiP1Model,
        isGeminiModel(normalizationModel)
          ? (normalizationModel as GeminiP1Model)
          : 'gemini-2.5-flash'
      )
    }

    // Fallback to GPT if Gemini key missing
    if (openaiApiKey) {
      console.warn(
        `   ⚠️ P1_MODEL is ${model} but no GEMINI_API_KEY, falling back to GPT`
      )
      return createGPTAdapter(openaiApiKey)
    }

    console.warn('   ⚠️ No API keys available for P1 reconciliation')
    return null
  }

  // Default to GPT
  if (openaiApiKey) {
    console.log(`   Using GPT for P1 (model: ${model})`)
    return createGPTAdapter(openaiApiKey, model, normalizationModel)
  }

  // Fallback to Gemini if GPT key missing
  if (geminiApiKey) {
    console.warn(
      `   ⚠️ P1_MODEL is ${model} but no OPENAI_API_KEY, falling back to Gemini`
    )
    return createGeminiP1Adapter(geminiApiKey)
  }

  console.warn('   ⚠️ No API keys available for P1 reconciliation')
  return null
}

/**
 * Convenience function that accepts separate key arguments
 * (matches the original signature used in p1-reconciliation.ts)
 */
export function createP1AdapterFromKeys(
  openaiApiKey?: string,
  geminiApiKey?: string
): P1Adapter | null {
  return createP1Adapter({ openaiApiKey, geminiApiKey })
}
