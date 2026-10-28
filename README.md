# pixso-hostjs

Pixso 设计稿 Token 绑定插件 + 远程脚本执行器。通过本地 HTTP 服务拉取远程脚本并在 Pixso 插件沙箱中执行,实现设计 Token(颜色 / 圆角 / 间距 / 字号 / 字体)与 Pixso 变量的批量绑定。

## 目录结构

```
pixso-hostjs/
├─ remote-scripts/
│  └─ plugin-script.js          # 远程执行脚本(v3,由插件 UI 经 HTTP 拉取)
├─ cm-bind-plugin/
│  ├─ manifest.json             # 插件清单(5 个菜单命令)
│  ├─ main.js                   # 插件主逻辑(含远程脚本执行器)
│  └─ ui.html                   # 插件 UI(拉取 / 执行 / 结果显示)
└─ ban-func/
   └─ banFunc.md                # 备忘:待测 API 清单
```

## 插件菜单命令

| 命令 | 菜单名 | 作用 |
|------|--------|------|
| `minimal` | 最小测试 | 建变量 → 建矩形 → 绑定,验证 API 可用性 |
| `remote` | 执行远程脚本 | 打开 UI,经 HTTP 拉取 plugin-script.js 并执行 |
| `bind` | 执行绑定(完整流程) | 清理悬空别名 → 颜色绑定 → 数值绑定 |
| `clean` | 仅清理悬空别名 | 移除指向已删除变量的绑定 |
| `status` | 查看统计(只读) | 统计有效 / 悬空 / 未绑 / 数值绑定数量 |

## 远程脚本机制

1. 插件 UI(ui.html)启动时自动 `fetch("http://127.0.0.1:8001/remote-scripts/plugin-script.js")`
2. 拉取到的代码文本经 `postMessage` 发给 main.js
3. main.js 用 `new Function("pixso", ...)` 包成 async IIFE 在主线程沙箱执行
4. 执行结果回传 UI 显示

## 本地 HTTP 服务

在仓库根目录启动:

```bash
python3 -m http.server 8001
```

服务根需指向 `pixso-hostjs/`,使 `/remote-scripts/plugin-script.js` 可访问。修改 `plugin-script.js` 后,点插件「执行远程脚本」菜单即可拉取最新版。

## 开发说明

- `plugin-script.js`:改完文件 → 点「执行远程脚本」菜单 → 自动拉取最新
- `main.js`:依赖 Pixso 编辑器开发模式热重载(不走 HTTP)
- 远程脚本顶层 `await` 可用,main.js 已包进 `async () => {...}` IIFE
