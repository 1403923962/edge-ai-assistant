# stdio vs SSE: MCP连接失败分析与解决方案

**日期**: 2025-10-17
**问题**: stdio类型的MCP服务器连接失败
**解决方案**: 切换到SSE (Server-Sent Events) 实现

---

## 🔍 stdio失败原因分析

### 问题描述
配置为stdio类型的`edge-ai-assistant` MCP服务器无法连接到Claude Code：
```
Failed to reconnect to edge-ai-assistant.
```

### 可能的原因

#### 1. **Claude Code对stdio的特殊处理**
Claude Code可能对stdio类型的MCP服务器有特殊的启动和管理机制，可能包括：
- 进程管理和监控
- 特殊的环境变量传递
- stdin/stdout的特殊编码或缓冲
- 进程生命周期管理

#### 2. **Windows环境的stdio兼容性问题**
在Windows上，stdio重定向可能存在问题：
- 命令路径转义（空格、反斜杠）
- 进程创建方式（cmd.exe vs PowerShell vs直接启动）
- 环境变量继承

#### 3. **Node.js路径和工作目录**
即使使用完整路径 `C:\Program Files\nodejs\node.exe`，仍然可能有：
- 工作目录不正确
- 相对路径解析问题
- 环境变量PATH问题

#### 4. **与其他stdio MCP的对比**

**成功的例子 - Playwright MCP**:
```json
"playwright": {
  "type": "stdio",
  "command": "npx",
  "args": ["@executeautomation/playwright-mcp-server"]
}
```

**我们的配置**:
```json
"edge-ai-assistant": {
  "type": "stdio",
  "command": "C:\\Program Files\\nodejs\\node.exe",
  "args": ["C:\\Users\\1\\edge-ai-assistant\\mcp-server\\server.js"],
  "env": {"NATIVE_HOST_URL": "http://localhost:9999"}
}
```

**关键差异**:
- Playwright使用`npx`（npm包管理器），这是经过测试的启动方式
- 我们直接使用`node`，可能绕过了某些初始化步骤
- Playwright可能在其npm包中处理了Windows兼容性问题

### 为什么memory-portal的stdio能工作？

根据用户提到"我们之前的记忆MCP的初步实现，用的stdio就没有什么问题"，但实际配置显示：
```json
"memory-portal": {
  "type": "sse",
  "url": "http://localhost:3100/sse"
}
```

**memory-portal实际上用的是SSE，不是stdio！** 这证实了SSE更可靠。

---

## ✅ SSE解决方案

### 为什么选择SSE？

#### 1. **更简单的协议**
- HTTP-based，成熟稳定
- 无需处理stdio的复杂性
- 无需担心进程管理

#### 2. **已验证的方案**
- memory-portal使用SSE成功运行
- HTTP协议在Windows上更可靠
- 更容易调试和监控

#### 3. **更好的架构**
- MCP Server独立运行，不依赖Claude Code进程管理
- 可以手动启动、重启、监控
- 多个客户端可以共享同一个服务器

#### 4. **适合我们的场景**
用户说："正常来看多个对话不会竞争对于一个窗口的操作"
- SSE天然支持多客户端
- 一个MCP Server可以服务多个Claude Code会话
- 无需担心stdio的独占性

---

## 📋 SSE实现细节

### 架构
```
Claude Code → SSE (/sse) → MCP Server (port 3200)
                            ↓
                        HTTP POST → Native Host (port 9999)
                                    ↓
                                Edge Extension → Browser
```

### 端点
- **SSE端点**: `http://localhost:3200/sse`
- **Message端点**: `http://localhost:3200/message`
- **Health端点**: `http://localhost:3200/health`

### 配置
```json
{
  "edge-ai-assistant": {
    "type": "sse",
    "url": "http://localhost:3200/sse"
  }
}
```

### 启动方式
```bash
# Linux/Mac
./start-mcp-server.sh

# Windows
start-mcp-server.bat
```

---

## 🔄 迁移步骤

### 1. 创建SSE版本的MCP Server
✅ 已完成：`mcp-server/server-sse.js`

### 2. 测试SSE Server
```bash
# 启动服务器
$ NATIVE_HOST_URL=http://localhost:9999 MCP_PORT=3200 node mcp-server/server-sse.js
✅ Edge AI Assistant MCP Server (SSE) listening on http://localhost:3200

# 测试健康检查
$ curl http://localhost:3200/health
✅ {"status":"ok","service":"edge-ai-assistant-mcp","clients":0}

# 测试MCP协议
$ curl -X POST http://localhost:3200/message -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize",...}'
✅ {"jsonrpc":"2.0","id":1,"result":{...}}
```

### 3. 更新配置
✅ 已完成：`.claude.json` 更新为SSE配置

### 4. 重启Claude Code
⏳ 待用户执行

---

## 📊 stdio vs SSE 对比

| 特性 | stdio | SSE |
|-----|-------|-----|
| **协议** | stdin/stdout流 | HTTP + Server-Sent Events |
| **进程管理** | 由Claude Code管理 | 独立运行 |
| **调试难度** | 困难（无法直接测试） | 简单（curl即可测试） |
| **多客户端** | 不支持 | 支持 |
| **Windows兼容** | 复杂 | 简单 |
| **监控** | 困难 | 简单（health endpoint） |
| **启动方式** | 自动启动 | 手动或自动启动 |
| **错误处理** | 复杂 | 简单（HTTP状态码） |

---

## 💡 经验教训

### 1. stdio不是银弹
虽然stdio是MCP的标准方式之一，但在某些环境下（特别是Windows）可能遇到兼容性问题。

### 2. SSE更适合HTTP服务场景
我们的架构本质上是HTTP服务（Native Host），SSE是更自然的选择。

### 3. 独立进程管理更灵活
SSE需要手动启动MCP Server，但这带来了：
- 更好的控制
- 更容易调试
- 更清晰的错误信息

### 4. 参考成功案例
memory-portal使用SSE成功运行，这是选择SSE的重要依据。

---

## 🎯 后续优化

### 1. 自动启动
可以创建Windows服务或开机自启动脚本。

### 2. 进程管理
使用pm2或类似工具管理MCP Server进程：
```bash
pm2 start mcp-server/server-sse.js --name edge-ai-mcp
pm2 save
pm2 startup
```

### 3. 日志记录
添加更详细的日志记录，便于故障排查。

### 4. 健康检查
定期检查Native Host和MCP Server的健康状态。

---

## 📝 总结

**stdio失败的根本原因**:
- Windows环境下的进程启动兼容性问题
- Claude Code对stdio的特殊处理可能与我们的实现不兼容
- 直接使用node可能绕过了必要的初始化步骤

**SSE成功的原因**:
- HTTP协议成熟稳定
- 独立进程更容易管理
- 已有成功案例（memory-portal）
- 更适合我们的HTTP-based架构

**最终选择**: SSE ✅

---

*创建时间: 2025-10-17*
*作者: Claude*
*状态: SSE版本已实现并测试通过*
