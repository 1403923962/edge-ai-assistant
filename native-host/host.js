#!/usr/bin/env node
/**
 * Native Messaging Host for Edge AI Assistant
 * Communicates with Edge extension via stdin/stdout
 * Exposes HTTP API for MCP server
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Create log file
const logFile = path.join(__dirname, 'debug.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function debugLog(msg) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  logStream.write(line);
  console.error(msg); // Also to stderr
}

debugLog('=== Native Host Starting ===');

// Native Messaging Protocol
// IMPORTANT: Configure stdin FIRST before any data arrives

// On Windows, stdin defaults to text mode which corrupts binary data
// Set stdin to binary mode (critical for Native Messaging protocol)
if (process.platform === 'win32') {
  // Use setRawMode if available (not available in all environments)
  try {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      debugLog('stdin set to raw mode');
    }
  } catch (e) {
    debugLog('setRawMode not available: ' + e.message);
  }
}

process.stdin.setEncoding(null);
process.stdin.resume();

debugLog('stdin configured and resumed');

let inputBuffer = Buffer.alloc(0);
let messageLength = null;

// Send message to stdout (to extension)
function sendMessage(message) {
  const buffer = Buffer.from(JSON.stringify(message));
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32LE(buffer.length, 0);

  debugLog('[sendMessage] Sending to extension: ' + JSON.stringify(message).substring(0, 100));
  process.stdout.write(lengthBuffer);
  process.stdout.write(buffer);
}

// Message queue for responses
const responseQueue = {};
let messageId = 0;

// SSE clients
const sseClients = [];

// Broadcast event to all SSE clients
function broadcastSSE(eventType, data) {
  const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;

  sseClients.forEach((client, index) => {
    try {
      client.write(message);
    } catch (e) {
      // Remove dead clients
      sseClients.splice(index, 1);
    }
  });
}

// Handle messages from extension
process.stdin.on('readable', () => {
  debugLog('[stdin] readable event fired');
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    debugLog(`[stdin] received chunk, length: ${chunk ? chunk.length : 0}, inputBuffer before concat: ${inputBuffer.length}`);
    // Ensure chunk is a Buffer
    if (!Buffer.isBuffer(chunk)) {
      chunk = Buffer.from(chunk);
    }
    debugLog(`[stdin] chunk is Buffer: ${Buffer.isBuffer(chunk)}, chunk hex: ${chunk.toString('hex').substring(0, 50)}`);
    inputBuffer = Buffer.concat([inputBuffer, chunk]);

    // Process all complete messages in buffer
    debugLog(`[stdin] processing buffer, length: ${inputBuffer.length}, messageLength: ${messageLength}`);
    while (true) {
      // Need at least 4 bytes for length
      if (inputBuffer.length < 4) {
        debugLog(`[stdin] buffer too small (${inputBuffer.length} < 4), waiting for more data`);
        break;
      }

      // Read message length if not already read
      if (messageLength === null) {
        messageLength = inputBuffer.readUInt32LE(0);
        debugLog(`[stdin] read message length: ${messageLength}`);
      }

      // Check if we have the complete message
      if (inputBuffer.length < 4 + messageLength) {
        debugLog(`[stdin] incomplete message (${inputBuffer.length} < ${4 + messageLength}), waiting for more data`);
        break;
      }

      // Extract message
      const messageBuffer = inputBuffer.slice(4, 4 + messageLength);
      inputBuffer = inputBuffer.slice(4 + messageLength);
      messageLength = null;

      try {
        const message = JSON.parse(messageBuffer.toString());
        debugLog(`[stdin] parsed message: ${JSON.stringify(message).substring(0, 150)}`);

        if (message.type === 'response' && message.id) {
          // Store response for HTTP API
          debugLog(`[stdin] got response for id ${message.id}, hasCallback: ${!!responseQueue[message.id]}`);
          if (responseQueue[message.id]) {
            responseQueue[message.id](message);
            delete responseQueue[message.id];
            debugLog(`[stdin] response callback executed for id ${message.id}`);
          }
        } else if (message.type === 'event') {
          // Broadcast event to SSE clients
          broadcastSSE(message.eventType || 'message', message.data);
          console.error(`[Event] ${message.eventType}:`, message.data);
        } else if (message.type === 'log') {
          // Log from extension
          console.error('[Extension]', message.message);
          // Also broadcast as SSE event
          broadcastSSE('log', { message: message.message, timestamp: Date.now() });
        }
      } catch (e) {
        console.error('[Error] Failed to parse message:', e);
      }
    }
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

  // SSE endpoint for events
  if (pathname === '/events' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial connection message
    res.write('event: connected\ndata: {"status":"connected","timestamp":' + Date.now() + '}\n\n');

    // Add client to list
    sseClients.push(res);
    console.error(`[SSE] Client connected (total: ${sseClients.length})`);

    // Remove client on disconnect
    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index !== -1) {
        sseClients.splice(index, 1);
        console.error(`[SSE] Client disconnected (total: ${sseClients.length})`);
      }
    });

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

const PORT = process.env.PORT || 9999;
server.listen(PORT, () => {
  debugLog(`Native host listening on http://localhost:${PORT}`);
  debugLog('Waiting for extension connection...');
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});

// Handle stdin close
process.stdin.on('end', () => {
  console.error('[Info] stdin closed, exiting...');
  process.exit(0);
});

process.stdin.on('error', (error) => {
  console.error('[Error] stdin error:', error);
});
