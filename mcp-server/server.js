#!/usr/bin/env node
/**
 * MCP Server for Edge AI Assistant
 * Exposes browser automation tools to AI via MCP protocol
 */

const NATIVE_HOST_URL = process.env.NATIVE_HOST_URL || 'http://localhost:9876';

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

// MCP Server Protocol
process.stdin.on('readable', async () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    try {
      const request = JSON.parse(chunk.toString());

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
      console.error('Error:', error);
    }
  }
});

console.error('Edge AI Assistant MCP Server started');
