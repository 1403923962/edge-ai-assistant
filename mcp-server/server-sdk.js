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
      return await callNativeHost('navigate', { url: args.url });

    case 'edge_click':
      return await callNativeHost('click', { selector: args.selector });

    case 'edge_fill':
      return await callNativeHost('fill', {
        selector: args.selector,
        value: args.value
      });

    case 'edge_press_key':
      return await callNativeHost('pressKey', {
        key: args.key,
        selector: args.selector
      });

    case 'edge_select':
      return await callNativeHost('select', {
        selector: args.selector,
        value: args.value
      });

    case 'edge_wait_for_element':
      return await callNativeHost('waitForElement', {
        selector: args.selector,
        timeout: args.timeout,
        interval: args.interval
      });

    case 'edge_wait_for_timeout':
      return await callNativeHost('waitForTimeout', {
        timeout: args.timeout
      });

    case 'edge_list_tabs':
      return await callNativeHost('listTabs');

    case 'edge_switch_tab':
      return await callNativeHost('switchTab', {
        tabId: args.tabId
      });

    case 'edge_new_tab':
      return await callNativeHost('newTab', {
        url: args.url
      });

    case 'edge_close_tab':
      return await callNativeHost('closeTab', {
        tabId: args.tabId
      });

    case 'edge_get_text': {
      const result = await callNativeHost('getText', { selector: args.selector });
      // Collapse large text data to save context window
      if (result.text && result.text.length > 50000) {
        const charCount = result.text.length;
        const preview = result.text.substring(0, 1000) + '...';
        return {
          success: true,
          message: 'Text retrieved successfully',
          charCount: charCount,
          preview: preview,
          note: '[Full text data omitted to save context - text is too large. Consider using a selector to target specific elements]'
        };
      }
      return result;
    }

    case 'edge_get_html': {
      const result = await callNativeHost('getHTML', { selector: args.selector });
      // Collapse large HTML data to save context window
      if (result.html && result.html.length > 50000) {
        const charCount = result.html.length;
        const preview = result.html.substring(0, 1000) + '...';
        return {
          success: true,
          message: 'HTML retrieved successfully',
          charCount: charCount,
          preview: preview,
          note: '[Full HTML data omitted to save context - HTML is too large. Consider using a selector to target specific elements]'
        };
      }
      return result;
    }

    case 'edge_screenshot': {
      const result = await callNativeHost('screenshot');
      // Collapse large base64 data to save context window
      if (result.screenshot) {
        const base64Data = result.screenshot;
        const dataSize = Math.round(base64Data.length * 0.75 / 1024); // Approximate KB
        const preview = base64Data.substring(0, 50) + '...';
        return {
          success: true,
          message: 'Screenshot captured successfully',
          dataSize: `${dataSize}KB`,
          preview: preview,
          note: '[Full base64 data omitted to save context - screenshot is available but collapsed]'
        };
      }
      return result;
    }

    case 'edge_evaluate':
      return await callNativeHost('evaluate', { code: args.code });

    case 'edge_get_tab_info':
      return await callNativeHost('getActiveTab');

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
        },
        {
          name: 'edge_press_key',
          description: 'Press a keyboard key (Enter, Tab, Escape, ArrowDown, etc.) on the active element or a specific element',
          inputSchema: {
            type: 'object',
            properties: {
              key: {
                type: 'string',
                description: 'Key to press (e.g., "Enter", "Tab", "Escape", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "a", "A", "1", etc.)'
              },
              selector: {
                type: 'string',
                description: 'Optional CSS selector for element to focus before pressing key. If omitted, uses currently focused element'
              }
            },
            required: ['key']
          }
        },
        {
          name: 'edge_select',
          description: 'Select an option from a dropdown <select> element',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector for the SELECT element'
              },
              value: {
                type: 'string',
                description: 'Value of the option to select (the value attribute, not the display text)'
              }
            },
            required: ['selector', 'value']
          }
        },
        {
          name: 'edge_wait_for_element',
          description: 'Wait for an element to appear on the page (useful for dynamic content)',
          inputSchema: {
            type: 'object',
            properties: {
              selector: {
                type: 'string',
                description: 'CSS selector for the element to wait for'
              },
              timeout: {
                type: 'number',
                description: 'Maximum time to wait in milliseconds (default: 30000)'
              },
              interval: {
                type: 'number',
                description: 'How often to check for the element in milliseconds (default: 500)'
              }
            },
            required: ['selector']
          }
        },
        {
          name: 'edge_wait_for_timeout',
          description: 'Wait for a specified amount of time (useful for pacing automation or waiting for animations)',
          inputSchema: {
            type: 'object',
            properties: {
              timeout: {
                type: 'number',
                description: 'Time to wait in milliseconds'
              }
            },
            required: ['timeout']
          }
        },
        {
          name: 'edge_list_tabs',
          description: 'List all tabs in the current browser window with their IDs, URLs, and titles',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'edge_switch_tab',
          description: 'Switch to (activate) a specific tab by its ID',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'ID of the tab to switch to (get this from edge_list_tabs)'
              }
            },
            required: ['tabId']
          }
        },
        {
          name: 'edge_new_tab',
          description: 'Create a new browser tab and optionally navigate to a URL',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to navigate to in the new tab (optional, defaults to blank page)'
              }
            }
          }
        },
        {
          name: 'edge_close_tab',
          description: 'Close a specific tab by its ID, or close the current active tab if no ID is provided',
          inputSchema: {
            type: 'object',
            properties: {
              tabId: {
                type: 'number',
                description: 'ID of the tab to close (optional, closes active tab if omitted)'
              }
            }
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
