// Test MCP Server directly
const { spawn } = require('child_process');

console.log('Testing MCP Server...\n');

const mcp = spawn('node', ['mcp-server/server.js'], {
  env: {
    ...process.env,
    NATIVE_HOST_URL: 'http://localhost:9999'
  }
});

// Send MCP initialize request
setTimeout(() => {
  console.log('Sending initialize request...');
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {}
  };
  mcp.stdin.write(JSON.stringify(initRequest) + '\n');
}, 1000);

// Send tools/list request
setTimeout(() => {
  console.log('Sending tools/list request...');
  const toolsRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  };
  mcp.stdin.write(JSON.stringify(toolsRequest) + '\n');
}, 2000);

// Collect responses
mcp.stdout.on('data', (data) => {
  console.log('MCP Response:', data.toString());
});

mcp.stderr.on('data', (data) => {
  console.log('MCP Log:', data.toString());
});

// Cleanup after 5 seconds
setTimeout(() => {
  mcp.kill();
  process.exit(0);
}, 5000);
