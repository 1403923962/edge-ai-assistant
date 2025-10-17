# Edge AI Assistant

AI-powered Edge browser control using Native Messaging + MCP

## Architecture

```
AI (Claude)
  ↓ MCP Protocol
MCP Server
  ↓ HTTP/JSON
Native Messaging Host (Node.js)
  ↓ stdin/stdout
Edge Extension
  ↓ DOM API
Browser Page
```

## Components

- **native-host/**: Native Messaging host (Node.js)
- **extension/**: Edge browser extension
- **mcp-server/**: MCP server implementation

## Installation

1. Install dependencies: `npm install`
2. Install extension: `npm run install-extension`
3. Start native host: `npm start`

## Features

- Click elements
- Fill forms
- Get page content
- Take screenshots
- Navigate pages
- Execute JavaScript
