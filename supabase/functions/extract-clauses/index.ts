// Edge Function: extract-clauses
// Phase 5 - Checkpoint A: Queue polling
// Polls document_processing_queue, extracts clauses from contracts, persists to database

import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const OPENAI_CHUNK_SIZE = 12000 // characters per chunk (≈3k tokens)
const OPENAI_CHUNK_OVERLAP = 800 // characters of overlap between chunks
const OPENAI_MIN_CHARS_FOR_CHUNK = 600
const OPENAI_MIN_CLAUSES_PER_CHUNK = 3
const OPENAI_MAX_ATTEMPTS = 2

type ExtractedClause = {
  content: string
  clause_type: string
  summary: string
  confidence: number
  rag_status: "green" | "amber" | "red"
  start_page?: number
  end_page?: number
  parsing_quality?: number
  section_title?: string
  chunk_index?: number
}

type SectionInfo = {
  title: string
  content: string
}

type ChunkPayload = {
  text: string
  sections: SectionInfo[]
}

function normalizeSectionTitle(title: string | undefined | null) {
  if (!title) return ""
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function cleanHeading(line: string) {
  return line.replace(/[:\-–—\s]+$/g, "").trim()
}

/**
 * Signature/contact block filter: Excludes common signature placeholders,
 * party headers, and contact fields to reduce noise in clause extraction.
 *
 * Filters out:
 * - Party/entity names: DIOR, INFLUENCER, BRAND, TALENT, LOAN OUT ENTITY, COUNTERPARTY
 * - Signature fields: "By:", "Name:", "Its:", "Title:", "Signature", "[ ] By", "[ ] Name"
 * - Contact labels: "Influencer Contact", "Contact Information", "Phone", "Email"
 *
 * Only filters lines that consist primarily of these tokens; genuine headings
 * that happen to include keywords (e.g., "Confidentiality of Influencer shall remain...")
 * are preserved.
 */
function isSignatureOrContactHeading(line: string): boolean {
  const cleaned = cleanHeading(line).toLowerCase()

  // Party/entity headers (typically standalone or with minimal context)
  const partyPatterns = /^(dior|influencer|brand|talent|loan out entity|counterparty|client|agency|advertiser)$/i
  if (partyPatterns.test(cleaned)) return true

  // Signature field labels (often with brackets or colons)
  const signaturePatterns = /^(\[\s*\])?\s*(by|name|its|title|signature|date|signed|executed)[\s:]*$/i
  if (signaturePatterns.test(cleaned)) return true

  // Signature blocks with placeholder structure: "[ ] By: ___ Name: ___ Its: ___"
  if (/\[\s*\]\s*(by|name|its|title)/i.test(cleaned)) return true

  // Contact/address labels
  const contactPatterns = /^(influencer\s+contact|contact\s+information|phone|email|address|telephone|mobile)[\s:]*$/i
  if (contactPatterns.test(cleaned)) return true

  // Generic signature placeholders
  if (/^_+$/.test(cleaned)) return true  // Lines with only underscores
  if (/^(signature|print\s+name|authorized\s+signatory)$/i.test(cleaned)) return true

  return false
}

function isHeadingLine(line: string) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 150) return false
  const cleaned = cleanHeading(trimmed)
  if (cleaned.length < 2) return false

  const words = cleaned.split(/\s+/)
  const wordCount = words.length

  // === EXCLUSION RULES (filter out false positives) ===

  // Skip signature blocks and contact information (added to reduce noise)
  if (isSignatureOrContactHeading(line)) return false

  // Skip bullet points
  if (/^[-•*]\s/.test(trimmed)) return false

  // Skip person titles
  if (/^(Mr\.|Mrs\.|Ms\.|Miss|Dr\.)\s/i.test(cleaned)) return false

  // Skip obvious sentence fragments
  if (/\b(is|are|was|were|the|a|an|to|of|for|and|or|must|shall|will|may|can|be)\s*$/i.test(cleaned)) return false

  // Skip lowercase roman numeral list items with long text
  if (/^[ivxlcdm]+\.\s+\w{4,}/i.test(cleaned) && cleaned.length > 25) return false

  // Skip address components and other noise
  if (wordCount <= 2) {
    // Postcodes
    if (/^[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}$/i.test(cleaned)) return false
    // Common address/location words
    if (/^(Building|Street|Road|Avenue|Lane|Drive|Court|Place|Square|Way|Close|City|Town)$/i.test(cleaned)) return false
    // Company suffixes
    if (/^(Limited|Ltd|LLC|Inc|Corp|plc)$/i.test(cleaned)) return false
    // Single place names without context (too ambiguous)
    if (wordCount === 1 && /^[A-Z][a-z]+$/.test(cleaned) && !/^(Cost|Fees|Term|Scope|Brief|Reviews)$/i.test(cleaned)) {
      // Only allow whitelisted single words
      return false
    }
  }

  // Skip 2-word address patterns (e.g., "Dantzic Building", "Date Date")
  if (wordCount === 2) {
    const [word1, word2] = words
    // Both words capitalized but look like address (Second word is Building/Street/etc or repeated word)
    if (word1 === word2) return false  // "Date Date"
    if (/^(Building|Street|Road|Avenue)$/i.test(word2)) return false
  }

  // === POSITIVE DETECTION RULES ===

  // All uppercase (like "CAMPAIGN DETAILS")
  const isUpper =
    cleaned === cleaned.toUpperCase() && /[A-Z]/.test(cleaned.replace(/[^A-Z]/g, ""))
  if (isUpper) return true

  // Ends with colon (like "Payment terms:")
  const endsWithColon = /:\s*$/.test(trimmed)
  if (endsWithColon) return true

  // Roman numerals standalone (like "I.", "II.")
  const romanNumeral = /^[IVXLCDM]+\.\s*$/i.test(cleaned) && cleaned.length <= 10
  if (romanNumeral) return true

  // Whitelisted clause keywords
  const clauseKeywords = /\b(terms|details|requirements|deliverables|confidentially|confidentiality|agreement|approval|feedback|invoicing|payment|scope|brief|cost|fees|usage|schedule|exhibit|annex|appendix|definitions|recitals|whereas)\b/i
  if (clauseKeywords.test(cleaned) && wordCount <= 4) return true

  // Count capitalized words
  const capitalizedWords = words.filter((word) =>
    /^[A-Z][a-zA-Z&\/0-9\-\(\)\.]*$/.test(word)
  ).length

  // 2-3 word phrases with at least 50% capitalization
  if (wordCount >= 2 && wordCount <= 3 && capitalizedWords >= Math.ceil(wordCount * 0.5)) {
    return true
  }

  return false
}

function detectSections(text: string): SectionInfo[] {
  const sections: SectionInfo[] = []
  const lines = text.split(/\n/).map((line) => line.trim())

  let current: SectionInfo | null = null

  for (const line of lines) {
    if (!line) continue  // Skip empty lines

    if (isHeadingLine(line)) {
      // Found a new heading - create a new section
      const heading = cleanHeading(line)
      current = {
        title: heading,
        content: "",
      }
      sections.push(current)
    } else if (current) {
      // Add content to the current section
      current.content = current.content
        ? `${current.content}\n${line}`
        : line
    }
  }

  return sections
}

function buildSectionOutline(sections: SectionInfo[]) {
  if (!sections.length) {
    return "No explicit section headings detected in this chunk."
  }

  return sections.map((section, index) => `${index + 1}. ${section.title}`).join("\n")
}

function inferClauseTypeFromTitle(title: string) {
  const normalized = normalizeSectionTitle(title)
  if (!normalized) return "general_terms"
  if (normalized.includes("payment") || normalized.includes("cost")) return "payment_terms"
  if (normalized.includes("invoice") || normalized.includes("invoicing"))
    return "payment_terms"
  if (normalized.includes("confidential")) return "confidentiality"
  if (normalized.includes("term_and_usage") || normalized.includes("usage"))
    return "terms_and_usage"
  if (normalized.includes("deliverable") || normalized.includes("deliveries"))
    return "deliverables"
  if (normalized.includes("brief") || normalized.includes("content"))
    return "content_requirements"
  if (normalized.includes("approval") || normalized.includes("feedback"))
    return "approval_process"
  if (normalized.includes("general_requirement")) return "general_requirements"
  if (normalized.includes("exclusivity") || normalized.includes("non_competition"))
    return "exclusivity"
  if (normalized.includes("term") && !normalized.includes("terms_and_usage"))
    return "term"
  return normalized || "general_terms"
}

function ensureSectionCoverage(
  sections: SectionInfo[],
  clauses: ExtractedClause[],
  chunkIndex: number
) {
  if (!sections.length) return clauses

  const coverage = new Set(
    clauses
      .filter((clause) => clause.section_title)
      .map((clause) => normalizeSectionTitle(clause.section_title))
  )
  let added = 0

  for (const section of sections) {
    const normalizedTitle = normalizeSectionTitle(section.title)
    if (!normalizedTitle || coverage.has(normalizedTitle)) {
      continue
    }

    const snippet = section.content?.trim() || section.title
    clauses.push({
      content: snippet.slice(0, 1200),
      clause_type: inferClauseTypeFromTitle(section.title),
      summary: snippet.slice(0, 200) || section.title,
      confidence: 0.55,
      rag_status: "amber",
      parsing_quality: 0.55,
      section_title: section.title,
      chunk_index: chunkIndex,
    })

    coverage.add(normalizedTitle)
    added++
  }

  if (added > 0) {
    console.log(
      `🧩 Added ${added} clause(s) to cover missing headings in chunk ${chunkIndex + 1}`
    )
  }

  return clauses
}

/**
 * Split the contract text into overlapping character chunks so GPT does not
 * attempt to summarize a 50k+ character payload in one go.
 */
function chunkContractText(text: string): ChunkPayload[] {
  const sanitized = text.replace(/\u0000/g, "").trim()
  if (sanitized.length === 0) {
    return []
  }

  if (sanitized.length <= OPENAI_CHUNK_SIZE) {
    return [
      {
        text: sanitized,
        sections: detectSections(sanitized),
      },
    ]
  }

  const chunks: ChunkPayload[] = []
  let start = 0

  while (start < sanitized.length) {
    const end = Math.min(start + OPENAI_CHUNK_SIZE, sanitized.length)
    const chunkText = sanitized.slice(start, end)
    chunks.push({
      text: chunkText,
      sections: detectSections(chunkText),
    })
    if (end === sanitized.length) break
    start = end - OPENAI_CHUNK_OVERLAP
  }

  return chunks
}

/**
 * Lightweight fallback in case GPT still refuses to return clauses for a chunk.
 * Splits the chunk into paragraphs so downstream steps never receive <1 clause.
 */
function heuristicClausesFromChunk(chunk: string, chunkIndex: number) {
  const paragraphs = chunk
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length >= OPENAI_MIN_CHARS_FOR_CHUNK)

  if (paragraphs.length === 0) {
    return []
  }

  return paragraphs.slice(0, 5).map((para) => ({
    content: para,
    clause_type: "general_terms",
    summary: para.slice(0, 180),
    confidence: 0.45,
    rag_status: "amber" as const,
    parsing_quality: 0.45,
    chunk_index: chunkIndex,
  }))
}

function normalizeContentFingerprint(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function dedupeClauses(clauses: ExtractedClause[]) {
  const seen = new Set<string>()

  return clauses.filter((clause) => {
    const fingerprint = normalizeContentFingerprint(clause.content.toLowerCase())

    if (!fingerprint) return false
    if (seen.has(fingerprint)) return false
    seen.add(fingerprint)
    return true
  })
}

async function callOpenAIForChunk({
  apiKey,
  chunkText,
  chunkIndex,
  totalChunks,
  sections,
}: {
  apiKey: string
  chunkText: string
  chunkIndex: number
  totalChunks: number
  sections: SectionInfo[]
}) {
  let attempt = 0
  let lastError: any = null

  while (attempt < OPENAI_MAX_ATTEMPTS) {
    attempt += 1

    try {
      const openaiResponse = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            temperature: attempt === 1 ? 0.2 : 0.1,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `You are the "ContractBuddy Clause Extractor", an AI paralegal specialised in commercial and influencer marketing agreements.

Your job:
- Read contract text.
- Identify sections and clauses.
- Output a clean, strictly valid JSON object describing clauses.

Global rules:
- You are conservative and literal: you only use information that is explicitly present in the text you are given.
- You never hallucinate new obligations, parties, dates, or numbers.
- You never invent section headings that are not provided.
- You never guess missing content: if content is not present in this chunk, treat it as absent and lower your confidence.
- You NEVER include explanations, commentary, markdown, or any text outside of the JSON object.
- All keys MUST be in double quotes, no trailing commas, and the JSON MUST be syntactically valid.

Semantics:
- A "clause" is a coherent block of obligation/rights/definition text under a given section heading.
- If a clause looks truncated at the start or end (chunk boundary), still return it but:
  - set a lower confidence (≤ 0.4)
  - mention "likely truncated at chunk boundary" in the summary.
- rag_status is a quick quality/risk indicator:
  - "green": clear, complete clause that reads as standard / low risk for this section.
  - "amber": ambiguous, incomplete, or partially present; content may be missing from this chunk.
  - "red": clearly risky, contradictory, or appears to omit something critical for this section.

If instructions in later messages conflict with these global rules, follow THESE global rules.`,
              },
              {
                role: "user",
                content: `You are processing chunk ${chunkIndex + 1} of ${totalChunks} for a contract document.
You MUST only use text from this chunk.

Section headings expected for this chunk (from document formatting):
${buildSectionOutline(sections)}

---

Your task:
Convert the chunk text below into a JSON object with a "clauses" array, following ALL rules here.

### 1. Output format (hard requirement)

Return ONLY a single JSON object:

{
  "clauses": [
    {
      "section_title": string,
      "content": string,
      "clause_type": string,
      "summary": string,
      "confidence": number,
      "rag_status": "green" | "amber" | "red",
      "start_page": number | null,
      "end_page": number | null
    }
  ]
}

No other fields. No extra top-level keys. No comments. No markdown.

### 2. Section / clause rules

1. For EVERY section heading listed above, you MUST create at least one clause object.
   - If there are ${sections.length} headings above, the "clauses" array MUST contain at least ${sections.length} distinct clause objects.
   - If a section has multiple distinct sub-paragraphs or subclauses in this chunk, create multiple clause objects with the SAME section_title.

2. section_title:
   - MUST be an exact string match to one of the listed headings.
   - NEVER invent new section titles.
   - NEVER combine multiple headings into a single clause.

3. Mapping content to headings:
   - Attach each paragraph or sentence to the nearest relevant heading that appears in this chunk.
   - If a heading from the list has no visible content in this chunk, still create a clause object with:
     {
       "section_title": heading,
       "content": "",
       "summary": "Section heading detected but content not present in this chunk.",
       "confidence": 0.0,
       "rag_status": "amber",
       "start_page": null,
       "end_page": null
     }

4. Chunk boundaries:
   - If a clause seems cut off at the start or end of the chunk, still output it.
   - Set confidence ≤ 0.4 and mention "likely truncated at chunk boundary" in the summary.

### 3. Field semantics

- content: Verbatim or lightly cleaned text from this chunk only (core clause body).
- clause_type (snake_case): e.g. "parties", "scope_of_work", "fees_and_payment", "term_and_termination", "usage_rights", "confidentiality", "miscellaneous".
- summary: 1–3 sentences, neutral and factual.
- confidence: 0.8–1.0 (clear), 0.5–0.79 (some ambiguity), 0.0–0.49 (incomplete/ambiguous/truncated).
- rag_status: "green", "amber", or "red" based only on this chunk.
- start_page / end_page: Use numbers if obvious, else null.

### 4. Validation checklist

Before returning the JSON, ensure:
- Top level is { "clauses": [ ... ] }.
- clauses.length ≥ ${sections.length}.
- EVERY heading from the list appears in at least one section_title.
- All required fields exist for every clause.
- rag_status ∈ { "green", "amber", "red" }.
- JSON is syntactically valid (no trailing commas/comments).

---

Chunk text (only source of truth):

${chunkText}`,
              },
            ],
          }),
        }
      )

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        throw new Error(
          `OpenAI API error (${openaiResponse.status}): ${errorText}`
        )
      }

      const openaiData = await openaiResponse.json()
      const content = openaiData.choices[0]?.message?.content

      if (!content) {
        throw new Error("No content returned from OpenAI")
      }

      const parsed = JSON.parse(content)
      const clausesArray = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.clauses)
          ? parsed.clauses
          : parsed?.content && parsed?.clause_type
            ? [parsed]
            : []

      let normalizedClauses: ExtractedClause[] = clausesArray.map((clause: any) => ({
        content: String(clause.content || clause.text || ""),
        clause_type: String(
          clause.clause_type || clause.type || "unknown"
        ).replace(/\s+/g, "_"),
        summary: String(clause.summary || ""),
        confidence: Number(clause.confidence || 0.7),
        rag_status: String(clause.rag_status || "amber").toLowerCase() as
          | "green"
          | "amber"
          | "red",
        start_page: clause.start_page || null,
        end_page: clause.end_page || null,
        parsing_quality: Number(clause.parsing_quality || clause.confidence || 0.7),
        section_title: clause.section_title || clause.heading || null,
        chunk_index: chunkIndex,
      }))

      if (
        normalizedClauses.length < OPENAI_MIN_CLAUSES_PER_CHUNK &&
        chunkText.length > OPENAI_MIN_CHARS_FOR_CHUNK
      ) {
        console.warn(
          `Chunk ${chunkIndex + 1}/${totalChunks} produced ${
            normalizedClauses.length
          } clause(s) on attempt ${attempt}, retrying`
        )
        lastError = new Error("Insufficient clauses returned")
        continue
      }

      if (normalizedClauses.length === 0) {
        normalizedClauses = heuristicClausesFromChunk(chunkText, chunkIndex)
      }

      return normalizedClauses
    } catch (error) {
      lastError = error
      console.error(
        `OpenAI chunk extraction failed (chunk ${chunkIndex + 1}/${
          totalChunks
        }, attempt ${attempt}):`,
        error
      )
    }
  }

  return heuristicClausesFromChunk(chunkText, chunkIndex)
}

interface QueueMessage {
  msg_id: number
  read_ct: number
  enqueued_at: string
  vt: string
  message: {
    document_id: string
    tenant_id: string
    object_path: string
    processing_type: string
    enqueued_at: string
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log("extract-clauses: Function invoked")

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body to check for direct invocation from worker
    let document_id: string
    let tenant_id: string
    let object_path: string
    let messageId: bigint | null = null

    const body = await req.json().catch(() => ({}))

    if (body.document_id) {
      // Direct invocation - may be ad-hoc retry
      console.log(`Direct invocation for document ${body.document_id}`)
      document_id = body.document_id

      // If tenant_id and object_path not provided, fetch from database
      if (!body.tenant_id || !body.object_path) {
        console.log(`Fetching metadata from document_repository...`)
        const { data: docMeta, error: metaError } = await supabase
          .from('document_repository')
          .select('tenant_id, object_path, processing_status')
          .eq('id', document_id)
          .single()

        if (metaError || !docMeta) {
          console.error(`Document ${document_id} not found:`, metaError)
          return new Response(
            JSON.stringify({
              success: false,
              error: `Document ${document_id} not found in repository`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 404,
            }
          )
        }

        // Check if document is still pending (not yet uploaded to storage)
        if (docMeta.processing_status === 'pending' && !docMeta.object_path) {
          console.error(`Document ${document_id} is still pending, no object_path`)
          return new Response(
            JSON.stringify({
              success: false,
              error: `Document ${document_id} is still pending upload, cannot retry yet`,
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            }
          )
        }

        tenant_id = docMeta.tenant_id
        object_path = docMeta.object_path
        console.log(`✅ Fetched metadata: tenant=${tenant_id}, path=${object_path}`)
      } else {
        tenant_id = body.tenant_id
        object_path = body.object_path
      }
    } else {
      // No document_id - poll queue for messages
      console.log("Checkpoint A: Polling document_processing_queue...")

      const { data: messages, error: queueError } = await supabase.rpc(
        "dequeue_document_processing",
        {
          batch_size: 1, // Process one at a time
        }
      )

      if (queueError) {
        console.error("Queue polling error:", queueError)
        throw queueError
      }

      if (!messages || messages.length === 0) {
        console.log("No messages in queue")
        return new Response(
          JSON.stringify({
            success: true,
            message: "No messages to process",
            processed: 0,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          }
        )
      }

      const message = messages[0] as QueueMessage
      console.log(`Processing message ${message.msg_id} for document ${message.message.document_id}`)

      document_id = message.message.document_id
      tenant_id = message.message.tenant_id
      object_path = message.message.object_path
      messageId = message.msg_id
    }

    // IDEMPOTENCY CHECK: Skip if document already has clauses
    const { data: existingClauses, error: checkError } = await supabase
      .from("clause_boundaries")
      .select("id")
      .eq("document_id", document_id)
      .limit(1)

    if (checkError) {
      console.error("Error checking for existing clauses:", checkError)
      // Don't throw - continue processing
    } else if (existingClauses && existingClauses.length > 0) {
      console.log(`⏩ Document ${document_id} already has clauses extracted, skipping...`)

      // Log skip event
      await supabase.from("edge_function_logs").insert({
        document_id,
        stage: "extract",
        status: "skipped",
        clause_count: 0,
        raw_payload: {
          reason: "idempotency_check_passed",
          message: "Document already processed"
        }
      })

      return new Response(
        JSON.stringify({
          success: true,
          message: "Document already processed (idempotent skip)",
          clauses_extracted: 0,
          skipped: true
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        }
      )
    }

    // Update document status to processing
    const { error: updateError } = await supabase
      .from("document_repository")
      .update({
        processing_status: "processing",
      })
      .eq("id", document_id)

    if (updateError) {
      console.error("Error updating document status:", updateError)
      // Don't throw - continue processing
    }

    // Checkpoint B: Download & text extraction
    console.log("Checkpoint B: Downloading document from storage...")
    console.log(`Storage path: ${object_path}`)

    let extractedText = ""
    let mime_type = ""

    try {
      // Download file from storage
      // Note: Files may be in 'documents' or 'contracts' bucket
      let fileData: Blob | null = null
      let downloadError: any = null

      // Try 'contracts' bucket first (newer uploads)
      const contractsDownload = await supabase.storage
        .from("contracts")
        .download(object_path)

      if (contractsDownload.error) {
        // Try 'documents' bucket (legacy/existing uploads)
        const documentsDownload = await supabase.storage
          .from("documents")
          .download(object_path)

        if (documentsDownload.error) {
          downloadError = documentsDownload.error
        } else {
          fileData = documentsDownload.data
        }
      } else {
        fileData = contractsDownload.data
      }

      if (!fileData || downloadError) {
        throw new Error(
          `Storage download failed: ${JSON.stringify(downloadError)}`
        )
      }

      // Get document metadata for mime type
      const { data: docMeta, error: metaError } = await supabase
        .from("document_repository")
        .select("mime_type, original_filename")
        .eq("id", document_id)
        .single()

      if (metaError) {
        console.warn("Could not fetch document metadata:", metaError)
        mime_type = "application/pdf" // default assumption
      } else {
        mime_type = docMeta.mime_type
      }

      console.log(`File downloaded: ${fileData.size} bytes, type: ${mime_type}`)

      // Extract text based on mime type
      if (mime_type === "application/pdf" || mime_type === "application/x-pdf") {
        // Import unpdf dynamically
        const { extractText } = await import("npm:unpdf@0.11.0")
        const arrayBuffer = await fileData.arrayBuffer()
        const result = await extractText(new Uint8Array(arrayBuffer))

        // unpdf can return different formats, normalize to string
        if (typeof result === 'string') {
          extractedText = result
        } else if (result && typeof result === 'object' && 'text' in result) {
          extractedText = String(result.text)
        } else {
          extractedText = String(result || '')
        }

        console.log(`PDF text extracted: ${extractedText.length} characters, type: ${typeof extractedText}`)
      } else if (
        mime_type ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        mime_type === "application/msword"
      ) {
        // Import mammoth dynamically
        const mammoth = await import("npm:mammoth@1.6.0")
        const arrayBuffer = await fileData.arrayBuffer()
        const result = await mammoth.extractRawText({ arrayBuffer })
        extractedText = result.value
        console.log(`DOCX text extracted: ${extractedText.length} characters`)
      } else if (mime_type === "text/plain") {
        // Plain text - just read directly
        extractedText = await fileData.text()
        console.log(`Plain text extracted: ${extractedText.length} characters`)
      } else {
        throw new Error(`Unsupported mime type: ${mime_type}`)
      }

      // Ensure extractedText is a string and has content
      extractedText = String(extractedText || '')
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from document")
      }
    } catch (extractError) {
      console.error("Checkpoint B failed:", extractError)

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `Text extraction failed: ${extractError.message}`,
        })
        .eq("id", document_id)

      throw extractError
    }

    // Checkpoint C: OpenAI clause extraction
    console.log("Checkpoint C: OpenAI clause extraction starting...")
    console.log(`Processing ${extractedText.length} characters of text`)

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")
    if (!openaiApiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for clause extraction"
      )
    }

    let extractedClauses: ExtractedClause[] = []
    const textChunks = chunkContractText(extractedText)

    if (textChunks.length === 0) {
      throw new Error("Unable to split contract text into chunks for OpenAI")
    }

    console.log(
      `Checkpoint C: OpenAI clause extraction starting with ${textChunks.length} chunk(s)`
    )

    try {
      for (let i = 0; i < textChunks.length; i++) {
        const chunkPayload = textChunks[i]
        console.log(
          `➡️  Processing chunk ${i + 1}/${textChunks.length} (${chunkPayload.text.length} chars)`
        )
        console.log(
          `   🔍 Sections detected in chunk ${i + 1}: ${chunkPayload.sections.length} section(s)`
        )
        if (chunkPayload.sections.length > 0) {
          console.log(`   📋 Section titles: ${chunkPayload.sections.map(s => s.title).join(', ')}`)
        }
        const chunkClauses = await callOpenAIForChunk({
          apiKey: openaiApiKey,
          chunkText: chunkPayload.text,
          chunkIndex: i,
          totalChunks: textChunks.length,
          sections: chunkPayload.sections,
        })

        console.log(
          `   ↳ Chunk ${i + 1} returned ${chunkClauses.length} clause(s)`
        )
        const coveredClauses = ensureSectionCoverage(
          chunkPayload.sections,
          chunkClauses,
          i
        )
        if (coveredClauses.length !== chunkClauses.length) {
          console.log(
            `   ✨ Backfilling added ${coveredClauses.length - chunkClauses.length} clause(s) for missing sections`
          )
        }
        extractedClauses.push(...coveredClauses)
      }

      const preDedupCount = extractedClauses.length
      extractedClauses = dedupeClauses(extractedClauses)

      if (extractedClauses.length !== preDedupCount) {
        console.log(
          `🧹 Dedupe removed ${preDedupCount - extractedClauses.length} overlapping clause(s)`
        )
      }

      if (extractedClauses.length === 0) {
        console.warn(
          `⚠️ All chunk attempts returned zero clauses for document ${document_id}`
        )
        await supabase.from("edge_function_logs").insert({
          document_id,
          stage: "extract",
          status: "fallback",
          clause_count: 1,
          raw_payload: {
            text_length: extractedText.length,
            chunk_count: textChunks.length,
            reason: "All chunks empty after retries",
          },
        })

        extractedClauses = [
          {
            content: extractedText.substring(0, 1000),
            clause_type: "general_terms",
            summary: "Full contract text (no clauses extracted)",
            confidence: 0.5,
            rag_status: "amber",
            parsing_quality: 0.5,
          },
        ]
      } else {
        await supabase.from("edge_function_logs").insert({
          document_id,
          stage: "extract",
          status: "success",
          clause_count: extractedClauses.length,
          raw_payload: {
            text_length: extractedText.length,
            chunk_count: textChunks.length,
            clause_types: extractedClauses.map((c) => c.clause_type),
            rag_distribution: {
              green: extractedClauses.filter((c) => c.rag_status === "green")
                .length,
              amber: extractedClauses.filter((c) => c.rag_status === "amber")
                .length,
              red: extractedClauses.filter((c) => c.rag_status === "red")
                .length,
            },
          },
        })
      }

      console.log(`✅ Extracted ${extractedClauses.length} clauses from OpenAI`)
      console.log(
        `RAG distribution: ${
          extractedClauses.filter((c) => c.rag_status === "green").length
        } green, ${
          extractedClauses.filter((c) => c.rag_status === "amber").length
        } amber, ${
          extractedClauses.filter((c) => c.rag_status === "red").length
        } red`
      )
    } catch (openaiError) {
      console.error("Checkpoint C failed:", openaiError)

      // Log error to database
      await supabase.from('edge_function_logs').insert({
        document_id,
        stage: 'extract',
        status: 'error',
        clause_count: 0,
        error_message: openaiError.message,
        raw_payload: {
          error_stack: openaiError.stack,
          error_name: openaiError.name
        }
      })

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `OpenAI clause extraction failed: ${openaiError.message}`,
        })
        .eq("id", document_id)

      throw openaiError
    }

    // Checkpoint D: Persistence
    console.log("Checkpoint D: Persisting clauses to database...")
    console.log(`Inserting ${extractedClauses.length} clauses into clause_boundaries`)

    try {
      // Prepare clause records for insertion
      const clauseRecords = extractedClauses.map((clause) => ({
        document_id,
        tenant_id,
        content: clause.content,
        clause_type: clause.clause_type,
        confidence: clause.confidence,
        start_page: clause.start_page,
        end_page: clause.end_page,
        parsing_quality: clause.parsing_quality || clause.confidence,
        section_title: clause.section_title || null,
        parsing_issues: clause.confidence < 0.7
          ? [{ issue: "low_confidence", score: clause.confidence }]
          : [],
      }))

      // Insert clauses into clause_boundaries
      const { data: insertedClauses, error: insertError } = await supabase
        .from("clause_boundaries")
        .insert(clauseRecords)
        .select("id, clause_type, confidence")

      if (insertError) {
        throw new Error(`Failed to insert clauses: ${insertError.message}`)
      }

      console.log(`✅ Inserted ${insertedClauses?.length || 0} clauses`)

      // Identify low-confidence clauses for admin review queue
      const lowConfidenceClauses = extractedClauses.filter(
        (clause) => clause.confidence < 0.7
      )

      if (lowConfidenceClauses.length > 0) {
        console.log(
          `Flagging ${lowConfidenceClauses.length} low-confidence clauses for review`
        )

        // Create admin review queue entries for low-confidence clauses
        const reviewQueueEntries = lowConfidenceClauses.map((clause, index) => {
          const correspondingClause = insertedClauses?.find(
            (ic, idx) => idx === extractedClauses.indexOf(clause)
          )

          return {
            document_id,
            clause_boundary_id: correspondingClause?.id || null,
            tenant_id,
            review_type: "low_confidence_clause",
            status: "pending",
            original_text: clause.content.substring(0, 500), // Limit to 500 chars
            original_clause_type: clause.clause_type,
            confidence_score: clause.confidence,
            issue_description: `Low confidence score (${clause.confidence.toFixed(2)}) - requires manual review`,
            priority: clause.confidence < 0.5 ? "high" : "medium",
            metadata: {
              rag_status: clause.rag_status,
              summary: clause.summary,
              extraction_source: "openai_gpt4o",
            },
          }
        })

        const { error: reviewQueueError } = await supabase
          .from("admin_review_queue")
          .insert(reviewQueueEntries)

        if (reviewQueueError) {
          console.error("Failed to insert review queue entries:", reviewQueueError)
          // Don't throw - this is non-critical
        } else {
          console.log(
            `✅ Added ${reviewQueueEntries.length} items to admin review queue`
          )
        }
      }

      // Update document status to clauses_extracted
      const { error: statusUpdateError } = await supabase
        .from("document_repository")
        .update({
          processing_status: "clauses_extracted",
          error_message: null, // Clear any previous errors
        })
        .eq("id", document_id)

      if (statusUpdateError) {
        console.error("Failed to update document status:", statusUpdateError)
        // Don't throw - clauses are already inserted
      } else {
        console.log(`✅ Updated document status to 'clauses_extracted'`)
      }

      console.log("Checkpoint D complete!")
    } catch (persistError) {
      console.error("Checkpoint D failed:", persistError)

      // Update document status to failed
      await supabase
        .from("document_repository")
        .update({
          processing_status: "failed",
          error_message: `Clause persistence failed: ${persistError.message}`,
        })
        .eq("id", document_id)

      throw persistError
    }

    // Delete the message from queue only if we dequeued it ourselves
    if (messageId) {
      const { data: deleted, error: deleteError } = await supabase.rpc(
        "delete_queue_message",
        {
          p_queue_name: "document_processing_queue",
          p_msg_id: messageId,
        }
      )

      if (deleteError) {
        console.error("Error deleting message from queue:", deleteError)
      } else {
        console.log(`Message ${messageId} processed and removed from queue`)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "All checkpoints complete - clauses extracted and persisted",
        document_id,
        msg_id: messageId,
        text_length: extractedText.length,
        mime_type,
        clauses_extracted: extractedClauses.length,
        low_confidence_count: extractedClauses.filter((c) => c.confidence < 0.7)
          .length,
        rag_distribution: {
          green: extractedClauses.filter((c) => c.rag_status === "green").length,
          amber: extractedClauses.filter((c) => c.rag_status === "amber").length,
          red: extractedClauses.filter((c) => c.rag_status === "red").length,
        },
        checkpoints: {
          a_queue_polling: "✅",
          b_text_extraction: "✅",
          c_openai_extraction: "✅",
          d_persistence: "✅",
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    )
  } catch (error) {
    console.error("extract-clauses error:", error)

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    )
  }
})
