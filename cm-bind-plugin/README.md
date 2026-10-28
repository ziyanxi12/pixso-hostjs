# CM Token 绑定插件

把导入的 Coremail 设计稿（名为 `html` 的顶层画板）里的颜色/字号/间距/圆角，
绑定到本地设计变量（Color / Spacing / Size & Layout / Typography 四个集合）。

## 使用步骤

1. **彻底退出 Pixso 客户端并重新打开**（如果之前引擎卡死过），打开目标设计文件
2. Pixso 客户端 → 插件/应用 → 开发（开发者模式）→ 加载插件 → 选择本目录 `cm-bind-plugin`
3. 在插件菜单中选择命令：
   - **查看统计（只读）**：先跑这个，看当前状态（有效/悬空/未绑定的数量）
   - **执行绑定（完整流程）**：清理悬空别名 → 颜色绑定 → 数值绑定，每个阶段独立提交撤销点
   - **仅清理悬空别名**：只做第一阶段
4. 进度通过 toast 通知显示；详细日志在插件开发控制台（console.log `[cm-bind]` 前缀）

## 绑定规则（与 token-runtime-map.json 对齐）

- **颜色**：RGB 精确匹配 + alpha ±2 容差（C2D 的 alpha 舍入偏差），填充和描边都绑，
  命中 `brand/neutral-dark/neutral-light/function-*` 等 token 色板
- **字号**：10/12/14/16/18/20/24 → `font/size/N`（11/13/28 等非 token 值跳过）
- **间距/内边距**：2/4/8/12/16/24/32 → `space/N`
- **圆角**：4/6/8/12/16/999 → `radius/04~full`
- 变量不存在时会自动补建（幂等），已存在的变量直接复用
- 已有效绑定的属性会跳过（幂等，可重复执行）

## 已知限制

- TEXT 节点的文字颜色：MCP 工具层面被拒（"TEXT does not support fillColor"），
  本插件直调 `setBoundVariableForPaint` 底层 API，在完整插件沙箱中大概率可用——
  如果 Phase 2 卡住请反馈，可退化为"仅清理"模式
- 220 处渐变填充不做绑定（多色渐变无法对应单色变量）
