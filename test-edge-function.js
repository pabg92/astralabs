// Quick test script to invoke the extract-clauses edge function
const https = require('https');
const fs = require('fs');

// Read env file
const envContent = fs.readFileSync('.env.local', 'utf8');
const serviceKey = envContent.match(/^SUPABASE_SERVICE_ROLE_KEY=(.*)$/m)[1];

const data = JSON.stringify({});

const options = {
  hostname: 'qntawekxlcnlmppjsijc.supabase.co',
  port: 443,
  path: '/functions/v1/extract-clauses',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log('Invoking extract-clauses function...');

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
      console.log(JSON.stringify(JSON.parse(body), null, 2));
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
