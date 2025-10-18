#!/usr/bin/env node
/**
 * HTTP Server for Edge AI Assistant (Refactored)
 * Communicates with Edge extension via HTTP/SSE
 */

const http = require('http');
const url = require('url');
const path = require('path');

const Logger = require('./lib/logger');
const SSEManager = require('./lib/sse-manager');
const CommandHandler = require('./lib/command-handler');

// Initialize logger
const logger = new Logger(path.join(__dirname, 'debug.log'));
logger.log('=== Native Host Starting (HTTP mode) ===');

// Initialize managers
const sseManager = new SSEManager(logger);
const commandHandler = new CommandHandler(sseManager, logger);

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
    res.end(JSON.stringify({
      status: 'ok',
      service: 'edge-ai-assistant',
      clients: sseManager.getClientCount(),
      ...commandHandler.getQueueStatus()
    }));
    return;
  }

  // Poll endpoint for Extension (polling mode)
  if (pathname === '/poll' && req.method === 'GET') {
    const command = commandHandler.pollCommand();

    if (command) {
      // Return pending command
      res.writeHead(200);
      res.end(JSON.stringify(command));
    } else {
      // No pending commands - return 204 No Content
      res.writeHead(204);
      res.end();
    }
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

    res.write('event: connected\ndata: {"status":"connected","timestamp":' + Date.now() + '}\n\n');
    sseManager.addClient(res);

    req.on('close', () => sseManager.removeClient(res));
    return;
  }

  // Response endpoint for Extension
  if (pathname === '/response' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const response = JSON.parse(body);
        commandHandler.handleResponse(response);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        logger.log(`[Response] Error: ${error.message}`);
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
        logger.log(`[MCP] Command received: ${JSON.stringify(command).substring(0, 100)}`);

        const response = await commandHandler.sendCommand(command);
        res.writeHead(200);
        res.end(JSON.stringify(response));
      } catch (error) {
        logger.log(`[MCP] Error: ${error.message}`);
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
  logger.log(`Native host listening on http://localhost:${PORT}`);
  logger.log('Waiting for extension connection...');
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});
