// Quick test script to invoke the generate-embeddings edge function
const https = require('https');
const fs = require('fs');

// Read env file
const envContent = fs.readFileSync('.env.local', 'utf8');
const serviceKey = envContent.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1];

// Use the document_id from Phase 5 test (86 clauses)
const data = JSON.stringify({
  document_id: "cca61f2b-57c2-4d69-9264-7b181b70d125"
});

const options = {
  hostname: 'qntawekxlcnlmppjsijc.supabase.co',
  port: 443,
  path: '/functions/v1/generate-embeddings',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Invoking generate-embeddings function...');
console.log('Document ID: cca61f2b-57c2-4d69-9264-7b181b70d125 (86 clauses from Phase 5)');
console.log('');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log('Headers:', JSON.stringify(res.headers, null, 2));

  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });

  res.on('end', () => {
    console.log('\nResponse:');
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify(parsed, null, 2));

      if (parsed.success) {
        console.log('\n✅ SUCCESS!');
        console.log(`   Embeddings generated: ${parsed.embeddings_generated}`);
        console.log(`   Matches created: ${parsed.matches_created}`);
        console.log(`   Total time: ${parsed.total_time_ms}ms (${(parsed.total_time_ms / 1000).toFixed(1)}s)`);
        console.log(`   Avg per clause: ${parsed.avg_time_per_clause_ms}ms`);
      }
    } catch (e) {
      console.log(body);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error);
});

req.write(data);
req.end();
