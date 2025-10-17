#!/usr/bin/env node
/**
 * MCP Server for Edge AI Assistant
 * Exposes browser automation tools to AI via MCP protocol
 */

const http = require('http');
const https = require('https');
const url = require('url');

const NATIVE_HOST_URL = process.env.NATIVE_HOST_URL || 'http://localhost:9999';

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
];

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
        const dataSize = Math.round(base64Data.length * 0.75 / 1024);
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

// Connect to SSE event stream
function connectSSE() {
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
    console.error('[SSE] Connected to event stream');

    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Process complete events
      const events = buffer.split('\n\n');
      buffer = events.pop() || ''; // Keep incomplete event in buffer

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
            handleSSEEvent(eventType, parsedData);
          } catch (e) {
            console.error('[SSE] Parse error:', e);
          }
        }
      });
    });

    res.on('end', () => {
      console.error('[SSE] Connection ended, reconnecting in 5s...');
      setTimeout(connectSSE, 5000);
    });
  });

  req.on('error', (error) => {
    console.error('[SSE] Connection error:', error.message);
    console.error('[SSE] Retrying in 5s...');
    setTimeout(connectSSE, 5000);
  });
}

// Handle SSE events
function handleSSEEvent(eventType, data) {
  switch (eventType) {
    case 'connected':
      console.error('[SSE] Connected:', data);
      break;

    case 'log':
      console.error('[Browser]', data.message);
      break;

    case 'page_load':
      console.error('[Browser] Page loaded:', data.url);
      break;

    case 'console':
      console.error(`[Browser Console] [${data.level}]`, data.message);
      break;

    default:
      console.error(`[SSE] ${eventType}:`, data);
  }
}

// Start SSE connection
connectSSE();

// MCP Server Protocol with proper buffering
let inputBuffer = '';

process.stdin.on('data', async (chunk) => {
  inputBuffer += chunk.toString();

  // Process complete lines (messages end with newline)
  let newlineIndex;
  while ((newlineIndex = inputBuffer.indexOf('\n')) !== -1) {
    const line = inputBuffer.slice(0, newlineIndex).trim();
    inputBuffer = inputBuffer.slice(newlineIndex + 1);

    if (!line) continue;

    try {
      const request = JSON.parse(line);

      let response;

      switch (request.method) {
        case 'initialize':
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result: {
              protocolVersion: '0.1.0',
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

      process.stdout.write(JSON.stringify(response) + '\n');
    } catch (error) {
      console.error('Error processing request:', error.message);
      console.error('Line:', line);
    }
  }
});

console.error('Edge AI Assistant MCP Server started');
