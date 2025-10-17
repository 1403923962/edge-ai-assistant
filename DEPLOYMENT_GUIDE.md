# Edge AI Assistant - 部署指南

## 快速启动

### 1. 启动 Native Host 服务

#### Windows (PowerShell):
```powershell
cd C:\Users\1\edge-ai-assistant
$env:PORT=9999; node native-host/host.js
```

#### Git Bash / WSL:
```bash
cd /c/Users/1/edge-ai-assistant
./start-native-host.sh
```

或者：
```bash
cd /c/Users/1/edge-ai-assistant
PORT=9999 node native-host/host.js
```

### 2. 验证服务运行

```bash
curl http://localhost:9999/health
# 应该返回: {"status":"ok","service":"edge-ai-assistant"}
```

### 3. 检查端口
```bash
netstat -ano | findstr :9999
```

## MCP 配置

### 配置文件位置
`C:\Users\1\.claude.json`

### 配置内容 (第499行)
```json
"edge-ai-assistant": {
  "type": "stdio",
  "command": "node",
  "args": [
    "C:\\Users\\1\\edge-ai-assistant\\mcp-server\\server.js"
  ],
  "env": {
    "NATIVE_HOST_URL": "http://localhost:9999"
  }
}
```

### 验证配置
```bash
node -e "const config = require('C:/Users/1/.claude.json'); console.log(Object.keys(config.projects['C:\\\\Users\\\\1'].mcpServers));"
```

## 测试 MCP 服务器

```bash
cd /c/Users/1/edge-ai-assistant
node test-mcp.js
```

应该看到8个工具返回：
- edge_navigate
- edge_click
- edge_fill
- edge_get_text
- edge_get_html
- edge_screenshot
- edge_evaluate
- edge_get_tab_info

## 安装 Edge 扩展

```bash
cd /c/Users/1/edge-ai-assistant
npm run install-extension
```

按提示操作：
1. 打开 `edge://extensions`
2. 启用"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `C:\Users\1\edge-ai-assistant\extension` 文件夹
5. 复制扩展ID并输入到安装脚本

## 故障排除

### MCP 工具不可见
1. 确认 Native Host 正在运行（端口9999）
2. 重启 Claude Code
3. 检查 `~/.claude.json` 中的配置

### Native Host 启动失败
- **端口被占用**:
  ```bash
  netstat -ano | findstr :9999
  # 找到进程ID (PID)
  taskkill /F /PID <PID>
  ```

- **路径问题**: 确保在Git Bash中使用 `/c/Users/1/...` 格式

### Extension 无法连接
1. 确认扩展已加载并启用
2. 检查注册表配置
3. 查看扩展的Service Worker日志

## 架构

```
Claude Code
  ↓ stdio (MCP Protocol)
MCP Server (mcp-server/server.js)
  ↓ HTTP POST + SSE
Native Host (native-host/host.js) ← 端口9999
  ↓ Native Messaging (stdio)
Edge Extension
  ↓ DOM API
Browser
```

## 服务端点

- **Health Check**: http://localhost:9999/health
- **SSE Events**: http://localhost:9999/events
- **Commands**: http://localhost:9999 (POST)

## 环境变量

- `PORT`: Native Host监听端口 (默认: 9999)
- `NATIVE_HOST_URL`: MCP Server连接的Native Host URL

## 日志

### Native Host 日志
查看运行 Native Host 的终端输出

### MCP Server 日志
MCP Server 的 stderr 输出会显示：
- SSE 连接状态
- 浏览器事件
- 错误信息

### Extension 日志
1. 打开 `edge://extensions`
2. 找到 "Edge AI Assistant"
3. 点击 "详细信息"
4. 点击 "检查视图: Service Worker"
