#!/usr/bin/env node
/**
 * Native Messaging Host for Edge AI Assistant
 * Communicates with Edge extension via stdin/stdout
 * Exposes HTTP API for MCP server
 */

const http = require('http');
const url = require('url');

// Native Messaging Protocol
let port = null;

// Read message from stdin (from extension)
function readMessage() {
  const lengthBuffer = Buffer.alloc(4);
  process.stdin.read(lengthBuffer);
  const length = lengthBuffer.readUInt32LE(0);

  const messageBuffer = Buffer.alloc(length);
  process.stdin.read(messageBuffer);

  return JSON.parse(messageBuffer.toString());
}

// Send message to stdout (to extension)
function sendMessage(message) {
  const buffer = Buffer.from(JSON.stringify(message));
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);

  process.stdout.write(lengthBuffer);
  process.stdout.write(buffer);
}

// Message queue for responses
const responseQueue = {};
let messageId = 0;

// Handle messages from extension
process.stdin.on('readable', () => {
  try {
    const message = readMessage();

    if (message.type === 'response' && message.id) {
      // Store response for HTTP API
      if (responseQueue[message.id]) {
        responseQueue[message.id](message);
        delete responseQueue[message.id];
      }
    } else if (message.type === 'log') {
      // Log from extension
      console.error('[Extension]', message.message);
    }
  } catch (e) {
    // End of stream or parse error
  }
});

// Send command to extension and wait for response
async function sendCommand(command) {
  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const timeout = setTimeout(() => {
      delete responseQueue[id];
      reject(new Error('Command timeout'));
    }, 30000);

    responseQueue[id] = (response) => {
      clearTimeout(timeout);
      resolve(response);
    };

    sendMessage({ id, ...command });
  });
}

// HTTP API Server
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Health check
  if (pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', service: 'edge-ai-assistant' }));
    return;
  }

  // Handle commands
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const command = JSON.parse(body);
        const response = await sendCommand(command);

        res.writeHead(200);
        res.end(JSON.stringify(response));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 9876;
server.listen(PORT, () => {
  console.error(`Native host listening on http://localhost:${PORT}`);
  console.error('Waiting for extension connection...');
});

// Keep stdin open
process.stdin.resume();
