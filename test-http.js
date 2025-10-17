// Test script for Native Host HTTP API
const http = require('http');

const NATIVE_HOST_URL = 'http://localhost:8765';

async function testAPI(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, NATIVE_HOST_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('Testing Native Host HTTP API...\n');

  try {
    // Test 1: Health check
    console.log('1. Testing /health endpoint...');
    const health = await testAPI('/health');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response:`, health.data);

    if (health.status === 200 && health.data.status === 'ok') {
      console.log('   ✓ Health check passed\n');
    } else {
      console.log('   ✗ Health check failed\n');
      return;
    }

    // Test 2: Command (will fail without extension, but tests HTTP layer)
    console.log('2. Testing command endpoint (will timeout without extension)...');
    console.log('   Sending test command...');

    const command = await testAPI('/', 'POST', {
      action: 'getActiveTab'
    });

    console.log(`   Status: ${command.status}`);
    console.log(`   Response:`, command.data);

    if (command.status === 500 && command.data.error.includes('timeout')) {
      console.log('   ✓ HTTP layer working (timeout expected without extension)\n');
    } else {
      console.log('   ? Unexpected response\n');
    }

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('✗ Cannot connect to native host.');
      console.error('  Make sure to run: npm start\n');
    } else {
      console.error('✗ Error:', error.message, '\n');
    }
  }
}

// Check if native host is running
console.log('Edge AI Assistant - HTTP API Test');
console.log('==================================\n');
console.log('Make sure the native host is running:');
console.log('  cd edge-ai-assistant && npm start\n');

setTimeout(runTests, 1000);
