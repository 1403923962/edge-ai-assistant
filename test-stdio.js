// Simple stdio MCP test
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

console.error('[Test MCP] Starting...');
console.error('[Test MCP] Waiting for input...');

rl.on('line', (line) => {
  try {
    const request = JSON.parse(line);
    console.error('[Test MCP] Received:', request.method);
    
    let response;
    if (request.method === 'initialize') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          protocolVersion: '0.1.0',
          serverInfo: { name: 'test-mcp', version: '1.0.0' },
          capabilities: { tools: {} }
        }
      };
    } else if (request.method === 'tools/list') {
      response = {
        jsonrpc: '2.0',
        id: request.id,
        result: {
          tools: [{
            name: 'test_tool',
            description: 'Test tool',
            inputSchema: { type: 'object', properties: {} }
          }]
        }
      };
    }
    
    if (response) {
      console.log(JSON.stringify(response));
    }
  } catch (e) {
    console.error('[Test MCP] Error:', e.message);
  }
});

console.error('[Test MCP] Ready');
