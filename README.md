# Edge AI Assistant

AI-powered Edge browser control using Native Messaging + MCP

## Architecture

```
AI (Claude)
  ↓ MCP Protocol (stdio)
MCP Server
  ↓ HTTP POST (commands) + SSE (events)
Native Messaging Host (Node.js)
  ↓ stdin/stdout (Native Messaging)
Edge Extension
  ↓ DOM API + Event Broadcasting
Browser Page
```

### Communication Flow
- **Commands**: MCP → HTTP POST → Native Host → Extension → Browser
- **Events**: Browser → Extension → Native Host → SSE → MCP
- **Real-time**: Extension broadcasts page loads, navigation, logs via SSE

## Components

- **native-host/**: Native Messaging host (Node.js)
- **extension/**: Edge browser extension
- **mcp-server/**: MCP server implementation

## Installation

1. Install dependencies: `npm install`
2. Install extension: `npm run install-extension`
3. Start native host: `npm start`

## Features

### Browser Control
- Click elements
- Fill forms
- Get page content (text/HTML)
- Take screenshots
- Navigate pages
- Execute JavaScript
- Get tab information

### Real-time Events (SSE)
- Page load notifications
- Tab activation events
- Navigation tracking
- Browser console logs
- Extension logs
