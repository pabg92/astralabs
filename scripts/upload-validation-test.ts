#!/usr/bin/env tsx
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const tenantId = '70aa3530-1b71-4342-8108-79fa049d2071';
const dealId = 'b2c27d2f-ff47-467d-a748-184c4a47c9ba';
const storagePath = `${tenantId}/${dealId}/C14.pdf`;

async function uploadAndCreateDoc() {
  console.log('📤 Uploading C14.pdf to validation test tenant...');

  const fileBuffer = fs.readFileSync('/Users/work/Downloads/C14.pdf');

  // Upload to storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('contracts')
    .upload(storagePath, fileBuffer, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError);
    process.exit(1);
  }

  console.log('✅ File uploaded:', uploadData.path);

  // Create document_repository entry (triggers pgmq enqueue)
  const { data: docData, error: docError } = await supabase
    .from('document_repository')
    .insert({
      tenant_id: tenantId,
      deal_id: dealId,
      object_path: storagePath,
      original_filename: 'C14.pdf',
      mime_type: 'application/pdf',
      size_bytes: fileBuffer.length,
      processing_status: 'pending',
      created_by: '00000000-0000-0000-0000-000000000002'
    })
    .select()
    .single();

  if (docError) {
    console.error('❌ Document creation failed:', docError);
    process.exit(1);
  }

  console.log('✅ Document created:', docData.id);
  console.log('📨 Document enqueued for processing via trigger');
  console.log('\n📊 Test IDs:');
  console.log(`   Tenant: ${tenantId}`);
  console.log(`   Deal: ${dealId}`);
  console.log(`   Document: ${docData.id}`);
}

uploadAndCreateDoc();
