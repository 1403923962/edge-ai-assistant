#!/usr/bin/env node
/**
 * HTTP Server for Edge AI Assistant
 * Communicates with Edge extension via HTTP/SSE (no Native Messaging)
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

debugLog('=== Native Host Starting (HTTP mode) ===');

// Message queue for responses
const responseQueue = {};
let messageId = 0;

// SSE clients (Extension connections)
const sseClients = [];

// Send command to extension via SSE
function sendCommandToExtension(command) {
  const message = `data: ${JSON.stringify(command)}\n\n`;

  debugLog(`[SSE] Broadcasting command to ${sseClients.length} clients: ${JSON.stringify(command).substring(0, 100)}`);

  sseClients.forEach((client, index) => {
    try {
      client.write(message);
    } catch (e) {
      debugLog(`[SSE] Failed to send to client ${index}: ${e.message}`);
      // Remove dead clients
      sseClients.splice(index, 1);
    }
  });
}

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

    sendCommandToExtension({ id, ...command });
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
    res.end(JSON.stringify({ status: 'ok', service: 'edge-ai-assistant', clients: sseClients.length }));
    return;
  }

  // SSE endpoint for Extension
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
    debugLog(`[SSE] Extension connected (total: ${sseClients.length})`);

    // Remove client on disconnect
    req.on('close', () => {
      const index = sseClients.indexOf(res);
      if (index !== -1) {
        sseClients.splice(index, 1);
        debugLog(`[SSE] Extension disconnected (total: ${sseClients.length})`);
      }
    });

    return;
  }

  // Response endpoint for Extension
  if (pathname === '/response' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const response = JSON.parse(body);
        debugLog(`[Response] Received from extension: ${JSON.stringify(response).substring(0, 150)}`);

        if (response.id && responseQueue[response.id]) {
          responseQueue[response.id](response);
          delete responseQueue[response.id];
        }

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        debugLog(`[Response] Error: ${error.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  // Handle commands from MCP Server
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const command = JSON.parse(body);
        debugLog(`[MCP] Command received: ${JSON.stringify(command).substring(0, 100)}`);

        const response = await sendCommand(command);

        res.writeHead(200);
        res.end(JSON.stringify(response));
      } catch (error) {
        debugLog(`[MCP] Error: ${error.message}`);
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
