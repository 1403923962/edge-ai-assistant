# Claude Code MCP 配置指南

## Claude Code vs Claude Desktop

**重要**: 您使用的是 **Claude Code**（CLI工具），不是Claude Desktop桌面应用。

## 配置方法

### 方式1：全局MCP配置（推荐）

Claude Code的MCP配置文件位置：
- **Windows**: `%APPDATA%\Claude\mcp_config.json`
- **macOS**: `~/Library/Application Support/Claude/mcp_config.json`
- **Linux**: `~/.config/claude/mcp_config.json`

创建或编辑该文件：

```json
{
  "mcpServers": {
    "edge-ai-assistant": {
      "command": "node",
      "args": [
        "C:\\Users\\1\\edge-ai-assistant\\mcp-server\\server.js"
      ],
      "env": {
        "NATIVE_HOST_URL": "http://localhost:9876"
      }
    }
  }
}
```

### 方式2：项目级配置

在您的项目根目录创建 `.claude/mcp.json`:

```json
{
  "mcpServers": {
    "edge-ai-assistant": {
      "command": "node",
      "args": [
        "C:\\Users\\1\\edge-ai-assistant\\mcp-server\\server.js"
      ]
    }
  }
}
```

## 验证配置

1. 重启Claude Code
2. 运行命令查看可用工具：
   ```bash
   claude mcp list
   ```

3. 应该能看到8个edge_*工具：
   - edge_navigate
   - edge_click
   - edge_fill
   - edge_get_text
   - edge_get_html
   - edge_screenshot
   - edge_evaluate
   - edge_get_tab_info

## 使用示例

在Claude Code中直接询问：
```
使用edge_navigate打开 https://github.com
```

或
```
帮我在当前页面点击selector为"button.submit"的按钮
```

## 注意事项

1. **确保Native Host正在运行**:
   ```bash
   cd C:\Users\1\edge-ai-assistant
   npm start
   ```
   输出应显示: `Native host listening on http://localhost:9876`

2. **确保Edge扩展已安装**:
   ```bash
   npm run install-extension
   ```

3. **检查连接状态**:
   - 打开Edge扩展图标
   - 应该显示"Connected to Native Host"

## 故障排除

### MCP工具不可见
- 检查配置文件路径是否正确
- 确认JSON格式无误
- 重启Claude Code

### 工具调用失败
- 确认Native Host正在运行（9876端口）
- 确认Edge扩展已连接
- 查看Native Host日志输出

### 扩展无法连接
- 检查注册表配置
- 确认扩展ID正确
- 重新运行 `npm run install-extension`
