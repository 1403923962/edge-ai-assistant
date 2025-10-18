# Edge AI Assistant

AI-powered RPA execution engine for Edge browser using MCP protocol

⚠️ **Commercial Use Restricted** - See [License](#license) below

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

## License

This project is licensed under the **Business Source License 1.1**.

### What this means:

✅ **Allowed:**
- Personal, non-commercial use
- Internal business use (not as a service to others)
- Research and education
- Contributing back to the project

❌ **Not Allowed:**
- Commercial SaaS/hosted services
- Offering as a managed service
- Selling or sublicensing
- Building competing products

🔓 **Future:** This license will automatically convert to MIT License on **2029-01-18** (4 years).

📧 **Commercial Licensing:** For commercial use cases, please contact us for a commercial license.

See [LICENSE.md](LICENSE.md) for full details.

---

**Copyright © 2025 Edge AI Assistant**
