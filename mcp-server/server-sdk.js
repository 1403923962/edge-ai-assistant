#!/usr/bin/env node
/**
 * MCP Server for Edge AI Assistant (Using Official MCP SDK)
 * Exposes browser automation tools to AI via MCP protocol over SSE
 */

const http = require('http');
const https = require('https');
const url = require('url');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');

const NATIVE_HOST_URL = process.env.NATIVE_HOST_URL || 'http://localhost:9999';
const MCP_PORT = process.env.MCP_PORT || 3200;

// Store active transports
const transports = new Map();

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

// Handle tool calls
async function handleToolCall(toolName, args) {
  switch (toolName) {
    case 'edge_navigate':
      return await callNativeHost('navigate', { url: args.url, tabId: args.tabId });

    case 'edge_click':
      return await callNativeHost('click', { selector: args.selector });

    case 'edge_fill':
      return await callNativeHost('fill', {
        selector: args.selector,
        value: args.value
      });

    case 'edge_get_text': {
      const result = await callNativeHost('getText', { selector: args.selector });
      // Collapse large text data to save context window (unless full=true)
      if (!args.full && result.text && result.text.length > 50000) {
        const charCount = result.text.length;
        const preview = result.text.substring(0, 1000) + '...';
        return {
          success: true,
          message: 'Text retrieved successfully (collapsed)',
          charCount: charCount,
          preview: preview,
          note: '[Full text data omitted to save context - text is too large. Use full=true parameter to get complete text, or use a selector to target specific elements]'
        };
      }
      return result;
    }

    case 'edge_get_html': {
      const result = await callNativeHost('getHTML', { selector: args.selector });
      // Collapse large HTML data to save context window (unless full=true)
      if (!args.full && result.html && result.html.length > 50000) {
        const charCount = result.html.length;
        const preview = result.html.substring(0, 1000) + '...';
        return {
          success: true,
          message: 'HTML retrieved successfully (collapsed)',
          charCount: charCount,
          preview: preview,
          note: '[Full HTML data omitted to save context - HTML is too large. Use full=true parameter to get complete HTML, or use a selector to target specific elements]'
        };
      }
      return result;
    }

    case 'edge_screenshot': {
      const result = await callNativeHost('screenshot', { selector: args.selector });
      // Collapse large base64 data to save context window (unless full=true)
      if (!args.full && result.screenshot) {
        const base64Data = result.screenshot;
        const dataSize = Math.round(base64Data.length * 0.75 / 1024); // Approximate KB
        const preview = base64Data.substring(0, 50) + '...';
        return {
          success: true,
          message: `Screenshot captured successfully${args.selector ? ' (focused on selector)' : ''} (collapsed)`,
          dataSize: `${dataSize}KB`,
          preview: preview,
          note: '[Full base64 data omitted to save context. Use full=true parameter to get the complete screenshot base64 data]'
        };
      }
      return result;
    }

    case 'edge_evaluate':
      return await callNativeHost('evaluate', { code: args.code });

    case 'edge_get_tab_info':
      return await callNativeHost('getActiveTab');

    case 'edge_list_tabs':
      return await callNativeHost('listTabs');

    case 'edge_switch_tab':
      if (!args.tabId) {
        throw new Error('tabId is required');
      }
      return await callNativeHost('switchTab', { tabId: args.tabId });

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

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
    console.error('[Native Host SSE] Connected');

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
            console.error(`[Browser Event] ${eventType}:`, JSON.stringify(parsedData));
          } catch (e) {
            console.error('[Native Host SSE] Parse error:', e);
          }
        }
      });
    });

    res.on('end', () => {
      console.error('[Native Host SSE] Connection ended, reconnecting in 5s...');
      setTimeout(connectToNativeHostSSE, 5000);
    });
  });

  req.on('error', (error) => {
    console.error('[Native Host SSE] Connection error:', error.message);
    setTimeout(connectToNativeHostSSE, 5000);
  });
}

// Create MCP Server
function createMCPServer() {
  const server = new Server(
    {
      name: 'edge-ai-assistant',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'edge_navigate',
          description: 'Navigate to a URL in a browser tab. If tabId is not specified, navigates in the active tab',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'The URL to navigate to'
              },
              tabId: {
                type: 'number',
                description: 'Optional: The ID of the tab to navigate (get tab IDs using edge_list_tabs). If not specified, navigates in the active tab'
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
          description: 'Get text content from the page or a specific element. Large content (>50KB) is automatically collapsed unless full=true',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector (optional, gets all text if omitted)'
              },
              full: {
                type: 'boolean',
                description: 'Set to true to get full content even if large. Default: false (auto-collapse)'
              }
            }
          }
        },
        {
          name: 'edge_get_html',
          description: 'Get HTML content from the page or a specific element. Large content (>50KB) is automatically collapsed unless full=true',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector (optional, gets full HTML if omitted)'
              },
              full: {
                type: 'boolean',
                description: 'Set to true to get full HTML even if large. Default: false (auto-collapse)'
              }
            }
          }
        },
        {
          name: 'edge_screenshot',
          description: 'Take a screenshot of the current tab or a specific element. Screenshot data is automatically collapsed unless full=true',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector to focus on a specific element. If provided, only that element will be captured'
              },
              full: {
                type: 'boolean',
                description: 'Set to true to get full base64 screenshot data. Default: false (collapsed with size info and preview)'
              }
            }
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
        },
        {
          name: 'edge_list_tabs',
          description: 'Get a list of all open browser tabs',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'edge_switch_tab',
          description: 'Switch to a specific browser tab by ID',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'The ID of the tab to switch to (get tab IDs using edge_list_tabs)'
              }
            },
            required: ['tabId']
          }
        }
      ]
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await handleToolCall(request.params.name, request.params.arguments || {});

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error.message}`
          }
        ],
        isError: true
      };
    }
  });

  return server;
}

// Start Native Host SSE connection
connectToNativeHostSSE();

// HTTP Server for MCP SSE
const httpServer = http.createServer(async (req, res) => {
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
    console.error('[MCP] New SSE connection');

    const transport = new SSEServerTransport('/messages', res);
    const server = createMCPServer();

    // Store transport
    transports.set(transport.sessionId, transport);
    console.error(`[MCP] Client connected: ${transport.sessionId} (total: ${transports.size})`);

    // Connect MCP server to transport
    await server.connect(transport);

    // Cleanup on disconnect
    transport.onclose = () => {
      transports.delete(transport.sessionId);
      console.error(`[MCP] Client disconnected: ${transport.sessionId} (remaining: ${transports.size})`);
    };

    return;
  }

  // POST messages endpoint (required by SSE transport)
  if (pathname === '/messages' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const sessionId = parsedUrl.query.sessionId;
        if (!sessionId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing sessionId' }));
          return;
        }

        const transport = transports.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        const message = JSON.parse(body);
        await transport.handlePostMessage(req, res, message);
      } catch (error) {
        console.error('[MCP] Error handling message:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
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
      clients: transports.size
    }));
    return;
  }

  // Not found
  res.writeHead(404);
  res.end('Not Found');
});

// Listen on localhost only (matching memory-portal)
httpServer.listen(MCP_PORT, 'localhost', () => {
  console.error(`Edge AI Assistant MCP Server (SDK) listening on http://localhost:${MCP_PORT}`);
  console.error(`SSE endpoint: http://localhost:${MCP_PORT}/sse`);
});
