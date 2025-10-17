#!/usr/bin/env node
/**
 * MCP Server for Edge AI Assistant (SSE Version)
 * Exposes browser automation tools to AI via MCP protocol over SSE
 */

const http = require('http');
const https = require('https');
const url = require('url');

const NATIVE_HOST_URL = process.env.NATIVE_HOST_URL || 'http://localhost:9999';
const MCP_PORT = process.env.MCP_PORT || 3200;

// MCP Protocol Implementation
async function callNativeHost(action, params = {}) {
  try {
    const response = await fetch(NATIVE_HOST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, params })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }

    return data.result;
  } catch (error) {
    throw new Error(`Native host error: ${error.message}`);
  }
}

// MCP Tools
const tools = [
  {
    name: 'edge_navigate',
    description: 'Navigate to a URL in the active Edge tab',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'edge_click',
    description: 'Click an element on the current page',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the element to click'
        }
      },
      required: ['selector']
    }
  },
  {
    name: 'edge_fill',
    description: 'Fill an input field with text',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector for the input element'
        },
        value: {
          type: 'string',
          description: 'Text to fill into the input'
        }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'edge_get_text',
    description: 'Get text content from the page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector (optional, gets all text if omitted)'
        }
      }
    }
  },
  {
    name: 'edge_get_html',
    description: 'Get HTML content from the page or a specific element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector (optional, gets full HTML if omitted)'
        }
      }
    }
  },
  {
    name: 'edge_screenshot',
    description: 'Take a screenshot of the current tab',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'edge_evaluate',
    description: 'Execute JavaScript code in the page context',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute'
        }
      },
      required: ['code']
    }
  },
  {
    name: 'edge_get_tab_info',
    description: 'Get information about the active tab',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Handle tool calls
async function handleToolCall(toolName, args) {
  switch (toolName) {
    case 'edge_navigate':
      return await callNativeHost('navigate', { url: args.url });

    case 'edge_click':
      return await callNativeHost('click', { selector: args.selector });

    case 'edge_fill':
      return await callNativeHost('fill', {
        selector: args.selector,
        value: args.value
      });

    case 'edge_get_text':
      return await callNativeHost('getText', { selector: args.selector });

    case 'edge_get_html':
      return await callNativeHost('getHTML', { selector: args.selector });

    case 'edge_screenshot':
      return await callNativeHost('screenshot');

    case 'edge_evaluate':
      return await callNativeHost('evaluate', { code: args.code });

    case 'edge_get_tab_info':
      return await callNativeHost('getActiveTab');

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// SSE clients for MCP protocol
const mcpClients = [];

// Connect to Native Host SSE for browser events
function connectToNativeHostSSE() {
  const eventsUrl = new URL('/events', NATIVE_HOST_URL);
  const protocol = eventsUrl.protocol === 'https:' ? https : http;

  const req = protocol.get({
    hostname: eventsUrl.hostname,
    port: eventsUrl.port,
    path: eventsUrl.pathname,
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  }, (res) => {
    console.log('[Native Host SSE] Connected');

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      events.forEach((eventData) => {
        if (!eventData.trim()) return;

        const lines = eventData.split('\n');
        let eventType = 'message';
        let data = '';

        lines.forEach((line) => {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            data = line.substring(5).trim();
          }
        });

        if (data) {
          try {
            const parsedData = JSON.parse(data);
            handleBrowserEvent(eventType, parsedData);
          } catch (e) {
            console.error('[Native Host SSE] Parse error:', e);
          }
        }
      });
    });

    res.on('end', () => {
      console.log('[Native Host SSE] Connection ended, reconnecting in 5s...');
      setTimeout(connectToNativeHostSSE, 5000);
    });
  });

  req.on('error', (error) => {
    console.error('[Native Host SSE] Connection error:', error.message);
    setTimeout(connectToNativeHostSSE, 5000);
  });
}

function handleBrowserEvent(eventType, data) {
  console.log(`[Browser Event] ${eventType}:`, JSON.stringify(data));
  // Forward browser events to MCP clients if needed
  // For now, just log them
}

// Start Native Host SSE connection
connectToNativeHostSSE();

// HTTP Server for MCP SSE
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // SSE endpoint for MCP
  if (pathname === '/sse' && req.method === 'GET') {
    console.log('[MCP SSE] Client connected');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    // Store client
    mcpClients.push(res);

    // Send initial endpoint message (MCP SSE protocol)
    const endpoint = {
      jsonrpc: '2.0',
      method: 'endpoint',
      params: {
        endpoint: `http://localhost:${MCP_PORT}/message`
      }
    };
    res.write(`data: ${JSON.stringify(endpoint)}\n\n`);

    // Handle client disconnect
    req.on('close', () => {
      const index = mcpClients.indexOf(res);
      if (index > -1) {
        mcpClients.splice(index, 1);
      }
      console.log('[MCP SSE] Client disconnected');
    });

    return;
  }

  // Message endpoint for MCP requests
  if (pathname === '/message' && req.method === 'POST') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const request = JSON.parse(body);
        console.log('[MCP Request]', request.method);

        let response;

        switch (request.method) {
          case 'initialize':
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                protocolVersion: request.params.protocolVersion || '2024-11-05',
                serverInfo: {
                  name: 'edge-ai-assistant',
                  version: '1.0.0'
                },
                capabilities: {
                  tools: {}
                }
              }
            };
            break;

          case 'notifications/initialized':
            // Client sends this after receiving initialize response
            // No response needed for notifications
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', result: {} }));
            return;

          case 'tools/list':
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: { tools }
            };
            break;

          case 'tools/call':
            const result = await handleToolCall(
              request.params.name,
              request.params.arguments || {}
            );
            response = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(result, null, 2)
                  }
                ]
              }
            };
            break;

          default:
            response = {
              jsonrpc: '2.0',
              id: request.id,
              error: {
                code: -32601,
                message: 'Method not found'
              }
            };
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      } catch (error) {
        console.error('[MCP Error]', error);
        const errorResponse = {
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32603,
            message: error.message
          }
        };
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorResponse));
      }
    });

    return;
  }

  // Health check
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'edge-ai-assistant-mcp',
      clients: mcpClients.length
    }));
    return;
  }

  // Not found
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(MCP_PORT, () => {
  console.log(`Edge AI Assistant MCP Server (SSE) listening on http://localhost:${MCP_PORT}`);
  console.log(`SSE endpoint: http://localhost:${MCP_PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${MCP_PORT}/message`);
});
