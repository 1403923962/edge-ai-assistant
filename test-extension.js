/**
 * Test script to directly test Extension via Native Host
 */

const http = require('http');

const NATIVE_HOST_URL = 'http://localhost:9999';

async function testCommand(action, params = {}) {
  console.log(`\nTesting: ${action}`);
  console.log('Params:', JSON.stringify(params));

  try {
    const response = await fetch(NATIVE_HOST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params })
    });

    const result = await response.json();
    console.log('Result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  }
}

async function main() {
  console.log('=== Testing Edge AI Assistant Extension ===\n');

  // Test 1: Get active tab
  await testCommand('getActiveTab');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Test 2: Navigate
  // await testCommand('navigate', { url: 'https://example.com' });

  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
