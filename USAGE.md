# Edge AI Assistant - 使用指南

## 快速开始

### 1. 安装依赖
```bash
npm install
```

### 2. 安装扩展
```bash
npm run install-extension
```
按照脚本提示操作：
1. 打开 `edge://extensions`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extension` 文件夹
5. 复制扩展ID并输入到脚本中

### 3. 启动Native Host
```bash
npm start
```

### 4. 配置MCP（在Claude Desktop）
在 Claude Desktop 配置文件中添加：
```json
{
  "mcpServers": {
    "edge-ai-assistant": {
      "command": "node",
      "args": ["C:\\Users\\1\\edge-ai-assistant\\mcp-server\\server.js"]
    }
  }
}
```

## 可用工具

### edge_navigate
导航到指定URL
```javascript
edge_navigate({ url: "https://example.com" })
```

### edge_click
点击元素
```javascript
edge_click({ selector: "button.submit" })
```

### edge_fill
填写表单
```javascript
edge_fill({
  selector: "input[name='email']",
  value: "test@example.com"
})
```

### edge_get_text
获取页面文本
```javascript
edge_get_text({ selector: ".content" })  // 获取特定元素
edge_get_text({})  // 获取整个页面
```

### edge_get_html
获取页面HTML
```javascript
edge_get_html({ selector: ".content" })
edge_get_html({})
```

### edge_screenshot
截图当前页面
```javascript
edge_screenshot({})
```

### edge_evaluate
执行JavaScript
```javascript
edge_evaluate({ code: "document.title" })
```

### edge_get_tab_info
获取标签页信息
```javascript
edge_get_tab_info({})
```

## 架构说明

```
AI (Claude Code)
  ↓ MCP Protocol
MCP Server (Node.js)
  ↓ HTTP JSON
Native Messaging Host (Node.js)
  ↓ stdin/stdout
Edge Extension
  ↓ DOM API
Browser Page
```

## 调试

### 查看扩展日志
1. 打开 `edge://extensions`
2. 找到 "Edge AI Assistant"
3. 点击 "详细信息" → "检查视图: Service Worker"

### 查看Native Host日志
查看运行 `npm start` 的终端输出

### 测试连接
```bash
curl -X POST http://localhost:8765/health
```

## 故障排除

### 扩展无法连接Native Host
1. 确认Native Host正在运行 (`npm start`)
2. 检查注册表: `HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.edge.ai.assistant`
3. 检查扩展ID是否正确配置在 `native-host/manifest.json`

### MCP工具不可用
1. 确认Native Host API可访问: `http://localhost:8765/health`
2. 重启Claude Desktop
3. 检查MCP服务器配置路径
