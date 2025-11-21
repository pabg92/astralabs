#!/usr/bin/env tsx
/**
 * Upload Real Contract PDFs to Supabase Storage
 *
 * Uploads C14.pdf and C19.pdf to their correct object_path locations
 * so the PDF viewer and E2E tests can access real contract files.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local
config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface UploadTarget {
  localPath: string
  storagePath: string
  filename: string
  dealId: string
}

const uploads: UploadTarget[] = [
  {
    localPath: path.join(__dirname, '../Documentation/C19.pdf'),
    storagePath: '00000000-0000-0000-0000-000000000001/1d6b4c0a-7fe5-4aed-aa59-817d8ff86893/C19-POST-FIX.pdf',
    filename: 'C19.pdf',
    dealId: '1d6b4c0a-7fe5-4aed-aa59-817d8ff86893'
  },
  {
    localPath: path.join(__dirname, '../Documentation/C14.pdf'),
    storagePath: '00000000-0000-0000-0000-000000000001/7fe44d75-38df-4bc8-8c46-a6796a5344ed/C14.pdf',
    filename: 'C14.pdf',
    dealId: '7fe44d75-38df-4bc8-8c46-a6796a5344ed'
  }
]

async function uploadPDFs() {
  console.log('📤 Uploading Real Contract PDFs to Supabase Storage\n')

  let successCount = 0
  let failCount = 0

  for (const target of uploads) {
    try {
      console.log(`\n📄 Processing ${target.filename}...`)
      console.log(`   Local: ${target.localPath}`)
      console.log(`   Storage: contracts/${target.storagePath}`)

      // Check if file exists locally
      if (!fs.existsSync(target.localPath)) {
        console.error(`   ❌ File not found: ${target.localPath}`)
        failCount++
        continue
      }

      // Read file
      const fileBuffer = fs.readFileSync(target.localPath)
      const fileSizeKB = (fileBuffer.length / 1024).toFixed(1)
      console.log(`   Size: ${fileSizeKB} KB`)

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('contracts')
        .upload(target.storagePath, fileBuffer, {
          contentType: 'application/pdf',
          upsert: true // Overwrite if exists
        })

      if (error) {
        console.error(`   ❌ Upload failed:`, error.message)
        failCount++
        continue
      }

      console.log(`   ✅ Upload successful!`)
      console.log(`   Path: ${data.path}`)
      successCount++

    } catch (error) {
      console.error(`   ❌ Unexpected error:`, error)
      failCount++
    }
  }

  // Verify uploads by listing files
  console.log('\n\n📂 Verifying Uploads...\n')

  for (const target of uploads) {
    try {
      const folder = path.dirname(target.storagePath)
      const { data: files, error } = await supabase.storage
        .from('contracts')
        .list(folder)

      if (error) {
        console.error(`❌ Failed to list ${folder}:`, error.message)
        continue
      }

      const targetFilename = path.basename(target.storagePath)
      const foundFile = files?.find(f => f.name === targetFilename)

      if (foundFile) {
        const sizeKB = ((foundFile.metadata?.size || 0) / 1024).toFixed(1)
        console.log(`✅ ${targetFilename}: ${sizeKB} KB (verified in storage)`)
      } else {
        console.log(`⚠️  ${targetFilename}: Not found in storage listing`)
      }

    } catch (error) {
      console.error(`❌ Verification error:`, error)
    }
  }

  // Summary
  console.log('\n\n═══════════════════════════════════════')
  console.log('  Upload Summary')
  console.log('═══════════════════════════════════════')
  console.log(`✅ Successful: ${successCount}/${uploads.length}`)
  console.log(`❌ Failed: ${failCount}/${uploads.length}`)
  console.log('')

  if (failCount > 0) {
    process.exit(1)
  }
}

uploadPDFs()
