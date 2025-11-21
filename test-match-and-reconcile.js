// Quick test script to invoke the match-and-reconcile edge function
const https = require('https');
const fs = require('fs');

// Read env file
const envContent = fs.readFileSync('.env.local', 'utf8');
const serviceKey = envContent.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1];

// Use the document_id from Phase 5/6 tests (86 clauses)
const data = JSON.stringify({
  document_id: "cca61f2b-57c2-4d69-9264-7b181b70d125"
});

const options = {
  hostname: 'qntawekxlcnlmppjsijc.supabase.co',
  port: 443,
  path: '/functions/v1/match-and-reconcile',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Invoking match-and-reconcile function...');
console.log('Document ID: cca61f2b-57c2-4d69-9264-7b181b70d125');
console.log('  (86 clauses from Phase 5, embeddings from Phase 6)');
console.log('');

const req = https.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);

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
        console.log(`   Clauses reconciled: ${parsed.clauses_reconciled}`);
        console.log(`   Virtual matches created: ${parsed.virtual_matches_created}`);
        console.log(`   Discrepancies created: ${parsed.discrepancies_created}`);
        console.log(`   P1 comparisons made: ${parsed.p1_comparisons_made}`);
        console.log(`   RAG distribution: ${parsed.rag_distribution.green} green, ${parsed.rag_distribution.amber} amber, ${parsed.rag_distribution.red} red`);
        console.log(`   Missing mandatory terms: ${parsed.missing_mandatory_terms}`);
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
