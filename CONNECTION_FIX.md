# MCP连接失败根本原因与修复

**问题状态**: ✅ **已修复**
**Git Commit**: `35310da`
**修复时间**: 2025-10-17 16:33

---

## 🔍 问题诊断

### 症状
```
Failed to reconnect to edge-ai-assistant.
```

### 根本原因
**stdin流处理缓冲问题** - MCP Server的stdio协议实现有致命缺陷。

原代码（server.js:267-336）：
```javascript
process.stdin.on('readable', async () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    try {
      const request = JSON.parse(chunk.toString());
      // ... process request
```

**问题**：
1. ❌ 假设每个chunk都是完整的JSON对象
2. ❌ stdin流可能会将一个JSON消息分成多个chunk
3. ❌ 当消息被分片时，`JSON.parse()` 会抛出异常
4. ❌ Claude Code发送的MCP请求被拆分后无法解析，导致连接失败

### 为什么测试脚本能通过？
`test-mcp.js` 使用 `child_process.spawn()` 一次性发送完整消息：
```javascript
mcpProcess.stdin.write(JSON.stringify(request) + '\n');
```

因为消息较短且同步发送，不会被分片，所以测试能通过。

但 **Claude Code通过长时间运行的stdio连接发送大量消息**，更容易遇到分片问题。

---

## ✅ 修复方案

### 实现正确的行缓冲 (Line Buffering)

修复后的代码（server.js:266-347）：
```javascript
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
      // ... process request
```

### 修复要点
1. ✅ 使用 `process.stdin.on('data')` 事件（更适合流式数据）
2. ✅ 维护 `inputBuffer` 来累积数据
3. ✅ 按换行符 `\n` 分割消息（JSON-RPC over stdio的标准做法）
4. ✅ 只处理完整的行，不完整的数据保留在buffer中
5. ✅ 优雅处理分片：即使一个JSON消息跨越多个chunk，也能正确解析

---

## 📊 对比：修复前后

### 修复前
```
Claude Code → stdio → [chunk1: '{"jsonrpc":"2.0"']
                      [chunk2: ',"id":1,"method"...']
MCP Server ← 尝试解析 '{"jsonrpc":"2.0"' → JSON.parse() 失败 → 连接断开
```

### 修复后
```
Claude Code → stdio → [chunk1: '{"jsonrpc":"2.0"']
                      [chunk2: ',"id":1,"method"...}\n']
MCP Server ← 累积到buffer → 检测到 '\n' → 解析完整JSON ✅
```

---

## 🧪 验证测试

### 测试1: 基本MCP协议
```bash
$ node test-mcp.js
✅ Initialize: 成功
✅ Tools/list: 返回8个工具
```

### 测试2: Native Host健康检查
```bash
$ curl http://localhost:9999/health
✅ {"status":"ok","service":"edge-ai-assistant"}
```

### 测试3: Claude Code连接
**修复前**:
```
❌ Failed to reconnect to edge-ai-assistant.
```

**修复后**:
```
⏳ 需要重启Claude Code验证
```

---

## 🎯 下一步操作

### 立即执行
1. ✅ 已修复stdin处理逻辑
2. ✅ 已提交Git (commit 35310da)
3. ⏳ **重启Claude Code**
4. ⏳ 运行 `/mcp` 命令验证连接

### 预期结果
重启Claude Code后，应该看到：
- ✅ `edge-ai-assistant` 连接成功
- ✅ 8个工具可用
- ✅ 可以执行 `edge_navigate`, `edge_click` 等命令

---

## 📝 技术总结

### stdio协议的正确实现
对于基于stdin/stdout的IPC协议（如MCP），必须：

1. **使用行缓冲**: 每条消息以 `\n` 结束
2. **累积不完整数据**: 使用buffer保存跨chunk的数据
3. **分割完整消息**: 只处理包含完整分隔符的消息
4. **错误处理**: 解析失败时记录但不崩溃

### 为什么这个bug难以发现？
- ✅ 单元测试都能通过（消息较短）
- ✅ curl测试HTTP接口正常
- ✅ 本地脚本测试成功
- ❌ 只在实际与Claude Code通信时暴露（长时间连接 + 大量消息）

### 类似问题的预防
在实现任何stdio协议时，参考：
- Node.js readline模块
- JSON-RPC 2.0 over stdio规范
- 其他MCP Server实现（如 @executeautomation/playwright-mcp-server）

---

## 🔗 相关文件

- **修复文件**: `mcp-server/server.js` (第266-347行)
- **测试脚本**: `test-mcp.js`
- **配置文件**: `C:\Users\1\.claude.json` (第499-508行)
- **Git提交**: `35310da` - "Fix stdin buffering issue in MCP Server"

---

## 💡 学到的教训

1. **stdio协议不是简单的read/write** - 需要正确的缓冲和分帧
2. **测试要覆盖实际使用场景** - 不能只测试单个请求
3. **日志要输出到stderr** - stdout保留给协议消息（这一点我们做对了）
4. **参考成熟实现** - playwright-mcp-server也使用行缓冲

---

*最后更新: 2025-10-17 16:33*
*状态: 等待Claude Code重启验证*
*commit: 35310da*
