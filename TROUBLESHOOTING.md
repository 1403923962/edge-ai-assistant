# Edge AI Assistant MCP 故障排查指南

**当前时间**: 2025-10-17 17:03
**状态**: MCP Server运行正常，但Claude Code显示连接失败

---

## 📊 当前服务状态

### MCP Server (端口 3200)
```
✅ 运行中 (PID 140656)
✅ 监听: 0.0.0.0:3200 和 [::]:3200
✅ 客户端: 1个已连接
✅ Health check: {"status":"ok","service":"edge-ai-assistant-mcp","clients":1}
```

### Native Host (端口 9999)
```
✅ 运行中 (PID 632)
⚠️ SSE连接错误（不影响MCP主功能）
```

### 配置文件
```json
// C:\Users\1\.claude.json (行499-502)
"edge-ai-assistant": {
  "type": "sse",
  "url": "http://localhost:3200/sse"
}
```

### 对比 memory-portal (工作正常)
```json
"memory-portal": {
  "type": "sse",
  "url": "http://localhost:3100/sse"
}
```

**配置格式完全一致！**

---

## 🔍 可能的问题

### 问题1: Claude Code配置缓存
**症状**: 配置已更新，但Claude Code仍然使用旧配置
**解决**:
1. 完全退出Claude Code（所有窗口）
2. 确认所有进程已关闭
3. 重新启动Claude Code

### 问题2: 端口竞争
**症状**: 多个MCP Server实例尝试绑定同一端口
**检查**:
```bash
netstat -ano | findstr :3200
```
**解决**: 只保留一个MCP Server实例

### 问题3: MCP Server启动时序
**症状**: Claude Code在MCP Server启动前尝试连接
**解决**: 先启动MCP Server，等待3秒，再启动Claude Code

### 问题4: 防火墙/权限
**症状**: Windows防火墙阻止localhost连接
**检查**:
```bash
curl http://localhost:3200/health
```
**解决**: 如果curl失败，检查防火墙设置

---

## 🎯 标准诊断流程

### 步骤1: 验证MCP Server运行
```bash
# 检查进程
netstat -ano | findstr :3200

# 测试health endpoint
curl http://localhost:3200/health
# 期望输出: {"status":"ok","service":"edge-ai-assistant-mcp","clients":N}

# 测试SSE endpoint
curl -v http://localhost:3200/sse 2>&1 | head -20
# 期望: HTTP/1.1 200 OK, Content-Type: text/event-stream
```

### 步骤2: 验证配置文件
```bash
# 查看配置
cat ~/.claude.json | grep -A 4 edge-ai-assistant

# 确认格式
# - type: "sse"
# - url: "http://localhost:3200/sse"
# - 没有多余的逗号或引号
```

### 步骤3: 完全重启Claude Code
```
1. 关闭所有Claude Code窗口
2. 打开任务管理器，确认没有 "Claude Code" 进程
3. 等待5秒
4. 重新启动Claude Code
5. 等待10秒，让MCP初始化
```

### 步骤4: 验证连接
在Claude Code中：
```
# 方法1: 查看MCP状态
运行 /mcp 命令

# 方法2: 尝试列出资源
运行 ListMcpResourcesTool

# 方法3: 直接使用工具
试着说: "使用edge_get_tab_info获取当前标签页信息"
```

---

## 🔧 手动测试MCP协议

### 测试Initialize
```bash
curl -X POST http://localhost:3200/messages?sessionId=test123 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "clientInfo": {"name": "test", "version": "1.0.0"},
      "capabilities": {}
    }
  }'
```

**注意**: SSE传输使用 `/messages?sessionId=XXX` 端点，不是 `/message`！

### 测试Tools List
```bash
curl -X POST http://localhost:3200/messages?sessionId=test123 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }'
```

期望输出: 8个工具的列表

---

## 📋 与memory-portal的完整对比

### memory-portal (工作)
- **实现**: TypeScript + @modelcontextprotocol/sdk
- **端口**: 3100
- **监听**: [::1]:3100 (IPv6)
- **PID**: 107152
- **连接**: 1个活跃连接
- **启动方式**: 独立进程，后台运行

### edge-ai-assistant (当前)
- **实现**: JavaScript + @modelcontextprotocol/sdk ✅
- **端口**: 3200 ✅
- **监听**: 0.0.0.0:3200 + [::]:3200 ✅
- **PID**: 140656 ✅
- **连接**: 1个客户端 ✅
- **启动方式**: 后台进程 ✅

**所有关键参数都匹配！**

---

## 🚨 紧急修复步骤

如果上述所有步骤都失败，尝试：

### 方案A: 使用不同的端口
```bash
# 停止当前MCP Server
# 使用端口3201
MCP_PORT=3201 node mcp-server/server-sdk.js
```

然后更新配置：
```json
"edge-ai-assistant": {
  "type": "sse",
  "url": "http://localhost:3201/sse"
}
```

### 方案B: 完全模仿memory-portal
```bash
# 只监听IPv6 localhost
# 修改server-sdk.js中的listen()调用
httpServer.listen(MCP_PORT, '::1', () => {
  // ...
});
```

### 方案C: 添加详细日志
在`.claude.json`中没有日志选项，但可以：
1. 查看Claude Code的日志文件
2. 在MCP Server中添加更详细的日志

---

## 📞 需要提供的信息

如果问题仍然存在，请提供：

1. **Claude Code的MCP连接错误信息**
   - 运行 `/mcp` 的输出
   - 是否显示 "connecting", "failed", 或其他状态

2. **MCP Server日志**
   ```bash
   # 查看最近的日志
   tail -20 [MCP Server输出]
   ```

3. **网络连接**
   ```bash
   netstat -ano | findstr :3200
   netstat -ano | findstr :3100
   ```

4. **测试结果**
   ```bash
   curl http://localhost:3200/health
   curl http://localhost:3100/health
   ```

5. **是否有任何错误弹窗或通知**

---

## 💡 最可能的原因

根据当前症状（服务器运行正常，有客户端连接，但显示fail）：

**最可能**: Claude Code缓存了旧的配置或连接状态

**解决**:
1. 完全退出Claude Code
2. 等待10秒
3. 重新启动
4. 等待15秒让所有MCP服务器初始化

---

*创建时间: 2025-10-17 17:03*
*MCP Server PID: 140656*
*配置文件: C:\Users\1\.claude.json:499-502*
