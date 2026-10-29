// ============================================================
// 绑定脚本 v5.8 —— 五段式执行:
//
//   Phase 0    组件实例替换 + 实例文本替换 + 实例图标槽收割回填
//   Phase 0.5  图标槽位替换 (SVG 自建组件 + swapComponent)
//   Phase 0.6  C2D 实例文本槽修复 (Sidebar Item 重复填充)
//   Phase 1    Token 绑定 (v5.6 接口化映射 + 变量三层解析: import→byKey→byName)
//   Phase 2    按值绑定收尾 (v5.8: 兜无标记裸色 —— 标记绑定是权威语义,
//              先做完; 再用变量值反查表把剩余裸色绑上)
//
// ---------- Phase 0 组件实例替换 ----------
//   token-marker.js (随 zip 进 C2D) 给组件根贴 px-comp_<slug> 类,
//   C2D 把类名写进图层名 → 本脚本解析 → 按原节点父级/层级/坐标/尺寸
//   原位替换, 删除原子树。嵌套组件只换最外层。
//
//   实例创建双路径 (v5.5 翻转: import 为主, nodeId 兜底):
//   ① 主路径: 图层名里的 px-a_<key>_<value> 属性集(token-marker 对组件根
//      全部 data-* 盖章, 键去 data- 前缀、值 slug 化)整包 POST 给 8002
//      组件解析服务 → componentKey(发布库 guid) →
//      importComponentByKeyAsync 导入远端组件 → createInstance。
//      真实环境(组件已发布 + 真服务)此路直接通;
//      当前本地环境(mock 假 key + 本地组件)必然失败 → 回落 ②。
//   ② 兜底: 翻译表 COMP_TRANSLATION[slug].nodeId → getNodeByIdAsync →
//      createInstance (本地直取)。
//
// ---------- Phase 0 实例文本替换 ----------
//   删除原子树前收割其 TEXT 节点(characters+fontName, 深度优先序),
//   实例插入后同序收集实例内 TEXT 子节点,
//   数量一致 → loadFontAsync → 逐个写 .characters (自动成 override);
//   数量不一致 → 跳过并计入 textMismatch。
//
// ---------- Phase 0 实例图标槽收割回填 ----------
//   背景: createInstance() 出来的实例, 图标 INSTANCE_SWAP 槽一律是库默认
//   .highlight (星形)。原子树里的图标有两种形态 (2026-10-28 取证):
//   ① TUI-SVG / Text-to-UI Icon 实例 —— 少数 (报告里 alreadySvg 大头
//      其实是老画板的旧槽, 新导入的组件内 svg 并不会被 C2D 实例化)
//   ② 纯 svg 形状帧 —— 绝大多数: FRAME 名 "svg" + 自动命名形状
//      (矢量 31943/矩形 4620…), class 全被 C2D 吃掉, 图标别名零存活
//   做法: 删除原子树前收割两样:
//   ① 图标实例 → 别名 + 首笔 paint 快照
//   ② svg 形状帧 → 节点引用 + 形状签名(子形状[类型,宽,高,x,y]序列,
//      同源 svg 跨导入签名稳定) + 尺寸
//   新实例插入后按序回填图标槽:
//   ① 别名 → ensureSvgComponent (注册表/现建) + setProperties + 重涂色
//   ② svg 帧 → ensureAutoSvgComponent: 签名查自动注册表, 命中复用
//      (跨导入去重, 用户拍板"svg 一致就去重"); 未命中 createComponentFromNode
//      原地转组件挂库页 (组件内部就是原矢量原色, 免重涂) + 回写注册表
//   不需要任何静态映射表 (v5.2 的 0.7 映射层已按用户决定移除)。
//
// ---------- Phase 0.5 图标槽位替换 ----------
//   全部图标走 SVG 自建组件 (不依赖库里手工图标组件, 不做文档级缓存):
//   ① fetch icon-svg.json (由 SPA 图标工厂静态提取, 8001 服务)
//   ② 遍历全文档实例, 读 componentProperties 找 INSTANCE_SWAP 槽
//   ③ 通过内层节点的 componentPropertyReferences 定位槽位实例
//   ④ 从槽位实例 mainComponent.name 提取图标别名 (Text-to-UI Icon/<alias>)
//   ⑤ createNodeFromSvg → 挂 NewComponents 库页 → createComponentFromNode
//      → 组件命名 TUI-SVG/<alias>
//   ⑥ 槽位实例.swapComponent(svg组件), 并把原内层矢量的
//      strokes/fills 逐实例覆写回去 (保留各上下文颜色, currentColor
//      解析为纯黑, 不覆写会丢色彩语义)
//   重复运行幂等: 已换成 TUI-SVG/* 的槽位不再匹配 Text-to-UI Icon 前缀。
//   .highlight 填充的槽位 (库默认): Phase 0 收割回填已覆盖被替换实例;
//   C2D 自行实例化产生的残留默认槽不在本脚本处理范围。
//
// ---------- 顺序 ----------
//   预载 icon-svg → 组件替换(含文本回写+图标槽收割回填) → 图标槽位替换
//   → 文本槽修复 → 最后 token 绑定。
//   (被替换子树会删除, 先绑定等于白做; 图标槽位要在组件实例
//    全部就位后统一处理, 新建实例的内层图标同样是 Text-to-UI Icon/*。)
//
// ---------- 实测记录 (2026-10-28 沙箱验证) ----------
//   createNodeFromSvg: 返回 FRAME(名字"svg"), currentColor→纯黑描边
//   createComponentFromNode: 原地转组件并返回
//   swapComponent: 对实例内层(嵌套)实例可用
//   strokes 覆写: swap 后写内层矢量可生效且保留变量绑定
//   importComponentByKeyAsync: 本地组件不可用(仅发布库), 故主路径用 nodeId
//   setProperties({INSTANCE_SWAP槽key: 组件节点id}): 属性级换图标 (v5.2 实测)
//   setProperties({variant名: 值}): VARIANT 切换, 值为裸值如 "selected" (v5.2 实测)
// ============================================================

// ------------------------------------------------------------
// 配置区 (Phase 1) —— CSS 变量名 → Pixso 变量名
// ------------------------------------------------------------
// ------------------------------------------------------------
// 配置区 (Phase 1) —— Token 映射 (v5.6 起接口化, 无内嵌表)
// ------------------------------------------------------------
// 变量映射来源: GET 8002 /api/tokens → { "<cssVar>": {name, key} }
//   name = Pixso 变量名 (兜底匹配用)   key = 变量 key (主路径用)
// 预载段拉取后构建 TOKEN_NAME / TOKEN_KEY 两张表; 解析每个 token 时三层:
//   ① importVariableByKeyAsync(key) —— 正式环境主路径(用户实测可用);
//      本地 eval_script 沙箱无此 API(环境差异) → typeof+try/catch 包一层
//   ② byKey 本地直查 (变量自带 key, 与服务一致)
//   ③ byName 按名兜底
// 接口不可用 → 两表为空 → Phase 1 全 skipped (note 记录原因)。
const TOKENS_API = "http://127.0.0.1:8002/api/tokens";
const MARKER_RE = /px-(fill|color|stroke|radius|gap|padt|padb|padl|padr|fs|lh|font)_([a-zA-Z0-9-]+)/g;
const FIELD_MAP = { radius: "cornerRadius", fs: "fontSize", lh: "lineHeight", gap: "itemSpacing", padt: "paddingTop", padb: "paddingBottom", padl: "paddingLeft", padr: "paddingRight", font: "fontFamily" };
const TEXT_FIELD_MAP = { fs: "fontSize", lh: "lineHeight", font: "fontFamily" };

// ------------------------------------------------------------
// 配置区 (Phase 0) —— 组件解析服务 + slug 翻译表
// ------------------------------------------------------------
const COMPONENTS_API = "http://127.0.0.1:8002/api/components";

// 翻译表: slug → { component, variant, key, nodeId }
//   slug     —— token-marker 贴码用的规范化逻辑名/图标别名 (接头暗号)
//   component/variant —— 8002 服务的请求对, 命名与库内组件集一致
//   key      —— 当前文件里的真实 componentKey (发布库路径用)
//   nodeId   —— 当前文件里的组件节点 id (本地主路径)
// 数据来源: 库内 245 个组件的全量导出 (2026-10-28)
// 注: 标 ⚠ 的条目是推断映射(HTML 逻辑名与库命名不直接一致), 效果需人工核对
const COMP_TRANSLATION = {
  // ===== 组件 =====
  "button-primary-default":           { component: "Button", variant: "size=Medium, type=Primary, state=Default", key: "79640505a70e2bb3c6f6077e112aecf7002324bf", nodeId: "19:1379" },
  "button-secondary-default":         { component: "Button", variant: "size=Medium, type=Secondary, state=Default", key: "87965ea2d946786db926e434c33faeba59215f65", nodeId: "19:1381" },
  "button-ghost-default":             { component: "Button", variant: "size=Medium, type=Ghost, state=Default", key: "9f1eff7045ac7abc6a58fe82ad486c70caade4da", nodeId: "19:1388" },
  "button-danger-default":            { component: "Button", variant: "size=Medium, type=Danger, state=Default", key: "a9d8e594d96e0857cd87cd244301389403deee7d", nodeId: "19:1383" },
  "icon-button-ghost-default":        { component: "Icon Button", variant: "type=Ghost, size=Medium, state=Default", key: "cbb36fd38436357826986038ccd6b87b6d7d2766", nodeId: "22:113" },
  "icon-text-button-primary-default": { component: "icon-text", variant: "type=primary, size=Medium, state=Default, density=Default", key: "2045f1a66a6aab788d8f9ecaa934dcc3ab9d7348", nodeId: "19:1570" },
  "icon-text-button-secondary-default": { component: "icon-text", variant: "type=secondary, size=Medium, state=Default, density=Default", key: "56b018fed0159efc27e2f1629bed0b60f6fb965b", nodeId: "19:1572" },
  "icon-text-button-ghost-default":   { component: "icon-text", variant: "type=ghost, size=Medium, state=Default, density=Default", key: "0319c9b250e894ee738258df3b69f29b8e14e6ab", nodeId: "180:25" },
  "split-dropdown-button-icon-text-default": { component: "split-dropdown", variant: "type=ghost, state=Default, density=Default", key: "3102e62724c84f27c68e27524737d216fc86836a", nodeId: "192:14" },
  "split-dropdown-button-icon-only-default": { component: "split-dropdown", variant: "type=icon, state=Default, density=Default", key: "6a5a9f3b47f190b7e1437329a71a182646746362", nodeId: "192:300" },
  "chips-default":                    { component: "Chips", variant: "状态=Default", key: "c917cf608a883e22adfb08b1cc002c56f1e6f547", nodeId: "22:269" },
  "segmented-button-default":         { component: "Segmented Button", variant: "count=3", key: "63a586fa08ab95d3b66d86978fef127e3e9bfa03", nodeId: "230:32" }, // ⚠ 数量按 3 处理
  "titlebar-controls-normal":         { component: "control button", variant: "状态=Normal size", key: "67e1dd1fe0a6ea84eb58ae6906a900491b57148d", nodeId: "117:708" }, // ⚠ 推断映射
  "form-field-default":               { component: "Form Field", variant: "surface=White,state=Default", key: "5394dc3b95fc8be8d878c1170fd669a8efa35359", nodeId: "234:27" },
  "field-default":                    { component: "Form Field", variant: "surface=White,state=Default", key: "5394dc3b95fc8be8d878c1170fd669a8efa35359", nodeId: "234:27" }, // ⚠ 与 form-field 同库组件
  "input-white-surface-default":      { component: "Input", variant: "surface=bg-white, state=Default", key: "92d272c0461e6d69448ff31ed9408a9831b81dc3", nodeId: "22:2021" },
  "input-tag-entry-default":          { component: "Input/Tag Entry/Default", variant: "", key: "e6fc9c4d03454dbb2a1426329068a75c59539219", nodeId: "269:5" },
  "search-white-surface-default":     { component: "Search", variant: "surface=bg-white, state=Default", key: "e1936796569bc668141c66b26c745c6d020229d9", nodeId: "25:1069" },
  "search-scoped-default":            { component: ".Scoped", variant: "", key: "47a3c591aca3a4c92dfd0c341b991a64ea46fe1a", nodeId: "270:149" }, // ⚠ 推断映射
  "select-default":                   { component: "Selection Dropdown", variant: "size=Medium, state=Default", key: "afd525e2728c62444c8526b582f3b10d1561825a", nodeId: "22:178" }, // ⚠ 推断映射
  "combobox-default":                 { component: "Selection Dropdown", variant: "size=Medium, state=Default", key: "afd525e2728c62444c8526b582f3b10d1561825a", nodeId: "22:178" }, // ⚠ 推断映射
  "textarea-default":                 { component: "Textarea", variant: "surface=bg-white, state=Default", key: "f17446c95be58bde3c813e04d6073650b0e93879", nodeId: "205:740" },
  "menubar-default":                  { component: "Menubar", variant: "surface=bg-white, state=Default", key: "6050d157686e2c9814423b6073e05e5914f18943", nodeId: "222:478" }, // ⚠ 推断映射
  "slider-default":                   { component: "Slider", variant: "style=style-1", key: "55e105b7af78b9987f540c2724f4ae78e6679035", nodeId: "229:38" }, // ⚠ 默认 style-1
  "number-selector-default":          { component: "Number Selector/Default", variant: "", key: "fd3485365b113bbccdc9b78ab3200fe7339cc14d", nodeId: "225:1" },
  "alert-dialog-default":             { component: "Alert", variant: "属性 1=Neutral", key: "8956ddb864e9146ea1088f7e825d2fb22399bf05", nodeId: "226:380" }, // ⚠ 推断映射
  "dialog-default":                   { component: ".Dialog_Container", variant: "quantity=1_normal", key: "51e70cc08367a13f2d2676b6befd8db3af221b3a", nodeId: "22:3406" }, // ⚠ 推断映射
  // ===== 浏览器实测 SPA 运行时出现的逻辑名 (2026-10-28) =====
  "collapsible-default":              { component: "Collapsible", variant: "State=Expanded", key: "f6295687b916d889f6704011ad97fae3aa24664f", nodeId: "222:394" }, // DOM variant=open → Expanded
  "accordion-default":                { component: "Accordion", variant: "State=Expanded", key: "aba4c2365e90b101cd0c49d829339ab3e29f2f78", nodeId: "222:145" }, // DOM variant=open → Expanded
  "sidebar-item-default":             { component: "Sidebar Item", variant: "state=default", key: "f2f1f3571f107df74d7902f5aa042c8fa4a2aac1", nodeId: "117:5472" }, // ⚠ v1 限制: 已选中项(variant=selected)也会换成 default 态
  "dropdown-menu-default":            { component: "Context Menu", variant: "quantity=3", key: "ed5ad40d377da150eeb15c30b779614d858b9350", nodeId: "182:296" }, // ⚠ 推断映射: 搜索范围菜单 3 项
  // ===== 库中无对应组件的 slug(进 missing 报告, 走 Phase 1 绑定) =====
  // titlebar-default / primary-navigation-item-level-1
  // ===== 图标: Phase 0 不处理, 全部走 Phase 0.5 的 SVG 自建 =====
};

// 组件/图标标记解析正则 (图层名里的 px-comp_<slug> / px-icon_<slug>)
const COMP_RE = /px-(comp|icon)_([a-z0-9-]+)/g;

// 组件身份属性标记 (v5.5): token-marker 对组件根全部 data-* 盖章,
// 键去 data- 前缀、值 slug 化 → px-a_<key>_<value>。
// slug 化保证 key/value 不含下划线, 唯一下划线即分隔符, 解析无歧义。
const ATTR_RE = /px-a_([a-z0-9-]+)_([a-z0-9-]+)/g;

// 属性集签名 (排序 k=v 连接): 8002 请求去重 & apiKeys 索引键
function attrSig(attrs) {
  return Object.keys(attrs).sort().map((k) => k + "=" + attrs[k]).join("&");
}

// ------------------------------------------------------------
// 配置区 (Phase 0.5) —— SVG 图标源
// ------------------------------------------------------------
// icon-svg.json: { "alias": "<svg ...>...</svg>" }
// 由 SPA 图标工厂(index-ji63qnwZ.js 的 z 映射)静态提取生成, 8001 服务提供。
// SVG 源里 stroke="currentColor", createNodeFromSvg 会解析成纯黑;
// 运行时用各槽位原图标的 strokes/fills 逐实例覆写还原颜色。
const ICON_SVG_URL = "http://127.0.0.1:8001/remote-scripts/icon-svg.json";

// ------------------------------------------------------------
// 配置区 (Phase 0/0.5) —— TUI-SVG 组件注册表
// ------------------------------------------------------------
// TUI-SVG 组件可能活在不可见内部画布 (C2D 自建的那些), 页面树遍历不可达,
// 但 getNodeByIdAsync 可达 → 用库页 pluginData 存 alias→组件id 注册表寻址。
const SVG_REGISTRY_KEY = "tui-svg-registry";
// 自动组件注册表: svg 形状帧签名 → 组件id (跨导入去重, 与 alias 表分开存)
const SVG_AUTO_REGISTRY_KEY = "tui-svg-auto-registry";

// ------------------------------------------------------------
// 工具: 全文档递归遍历
// ------------------------------------------------------------
function walkDeep(node, arr) {
  if (!node) return;
  arr.push(node);
  try { for (const c of (node.children || [])) walkDeep(c, arr); } catch (e) {}
}

// 收集节点子树里的全部 TEXT 节点(深度优先序), 用于文本替换的数量按序匹配
function collectTexts(node, arr) {
  if (!node) return;
  try { if (node.type === "TEXT") arr.push(node); } catch (e) {}
  try { for (const c of (node.children || [])) collectTexts(c, arr); } catch (e) {}
}

// ------------------------------------------------------------
// 共享基础设施: TUI-SVG 组件寻址 (Phase 0 收割回填 / 0.5 槽位替换共用)
// ------------------------------------------------------------
// 寻址优先级: 运行缓存 → 库页注册表(pluginData, 可跨会话存活) → 现建。
// 现建 = createNodeFromSvg → 挂库页 → createComponentFromNode → 回写注册表。
const svgComps = new Map();      // alias → component (运行期缓存)
const svgCompsNew = [];          // 本次运行新建的组件 (收尾校正只挪这批, 不动存量的)
const svgSourcing = { registry: 0, harvested: 0, created: 0, regWrite: 0, autoCreated: 0, autoReused: 0 };
let svgCreateCursor = 0;

function getLibPage() {
  return (pixso.root.children || []).find((p) => { try { return p.name === "NewComponents"; } catch (e) { return false; } }) || pixso.currentPage;
}

function readRegistry(libPage) {
  try { return JSON.parse(libPage.getPluginData(SVG_REGISTRY_KEY) || "{}"); } catch (e) { return {}; }
}

async function ensureSvgComponent(alias, iconSvg) {
  if (!alias) return null;
  if (svgComps.has(alias)) return svgComps.get(alias);
  const libPage = getLibPage();
  // ① 注册表
  const reg = readRegistry(libPage);
  if (reg[alias]) {
    try {
      const c = await pixso.getNodeByIdAsync(reg[alias]);
      if (c && c.type === "COMPONENT" && String(c.name) === "TUI-SVG/" + alias) {
        svgComps.set(alias, c); svgSourcing.registry++;
        return c;
      }
    } catch (e) {}
  }
  // ② 现建
  const svg = iconSvg && iconSvg[alias];
  if (!svg) return null;
  const node = pixso.createNodeFromSvg(svg);
  if (!node) return null;
  const i = svgCreateCursor++;
  try { node.x = (i % 12) * 48; node.y = 6000 + Math.floor(i / 12) * 48; } catch (e) {}
  libPage.appendChild(node);
  let comp = null;
  try { comp = pixso.createComponentFromNode(node); } catch (e) {}
  if (!comp && node.type === "COMPONENT") comp = node; // 兼容原地转换语义
  if (!comp) return null;
  try { comp.name = "TUI-SVG/" + alias; } catch (e) {}
  // createComponentFromNode 可能把组件放进内部画布 (Internal Only Canvas) —— 显式挂回库页
  try { libPage.appendChild(comp); } catch (e) {}
  svgComps.set(alias, comp);
  svgCompsNew.push(comp);
  svgSourcing.created++;
  // 回写注册表 (增量)
  const reg2 = readRegistry(libPage);
  reg2[alias] = comp.id;
  try { libPage.setPluginData(SVG_REGISTRY_KEY, JSON.stringify(reg2)); svgSourcing.regWrite++; } catch (e) {}
  return comp;
}

// 收割到存量 TUI-SVG 实例时把 alias→组件id 回写注册表 (自愈:
// 文档被回退/旧画板删光后, 注册表可从任何残存实例引用重建)
function registerAliasComp(alias, comp) {
  try {
    const libPage = getLibPage();
    const reg = readRegistry(libPage);
    if (!reg[alias]) {
      reg[alias] = comp.id;
      libPage.setPluginData(SVG_REGISTRY_KEY, JSON.stringify(reg));
      svgSourcing.regWrite++;
    }
  } catch (e) {}
}

// svg 形状帧判定: FRAME + 子节点全部是形状 + 无 TEXT/INSTANCE + ≤48px
// (C2D 对组件内 svg 的固定转换产物: 名 "svg", 子形状自动命名)
const SVG_SHAPE_TYPES = { VECTOR: 1, BOOLEAN_OPERATION: 1, ELLIPSE: 1, RECTANGLE: 1, LINE: 1, STAR: 1, POLYGON: 1 };
function looksLikeSvgFrame(n) {
  try {
    if (!n || n.type !== "FRAME") return false;
    const kids = n.children || [];
    if (!kids.length || kids.length > 24) return false;
    if (n.width <= 0 || n.height <= 0 || n.width > 48 || n.height > 48) return false;
    for (const c of kids) if (!SVG_SHAPE_TYPES[c.type]) return false;
    return true;
  } catch (e) { return false; }
}

// 形状签名: 帧尺寸 + 子形状 [类型,宽,高,x,y] 序列
// (同源 svg 的 C2D 转换是确定性的 → 跨导入签名稳定, 用于去重)
function sigOfSvgFrame(n) {
  const parts = [Math.round(n.width) + "x" + Math.round(n.height)];
  for (const c of (n.children || [])) {
    parts.push([c.type, Math.round(c.width), Math.round(c.height), Math.round(c.x), Math.round(c.y)].join(","));
  }
  return parts.join("|");
}

function readAutoRegistry(libPage) {
  try { return JSON.parse(libPage.getPluginData(SVG_AUTO_REGISTRY_KEY) || "{}"); } catch (e) { return {}; }
}

let autoCreateCursor = 0;
// svg 帧 → 图标组件 (签名寻址: 注册表命中复用 / 现建原地转组件挂库页)
// 惰性: 只在新实例确有图标槽时才调用; 组件内部即原矢量原色, 免重涂。
async function ensureAutoSvgComponent(sig, svgNode) {
  const libPage = getLibPage();
  const reg = readAutoRegistry(libPage);
  if (reg[sig]) {
    try {
      const c = await pixso.getNodeByIdAsync(reg[sig]);
      if (c && c.type === "COMPONENT") { svgSourcing.autoReused++; return c; }
    } catch (e) {}
  }
  let comp = null;
  try { comp = pixso.createComponentFromNode(svgNode); } catch (e) {}
  if (!comp && svgNode.type === "COMPONENT") comp = svgNode; // 兼容原地转换语义
  if (!comp) return null;
  const i = autoCreateCursor++;
  try { libPage.appendChild(comp); } catch (e) {}   // 从原子树脱钩 (子树删除不影响) + 防内部画布回收
  try { comp.name = "TUI-SVG/auto-" + String(sig).replace(/[^a-zA-Z0-9]/g, "").slice(-12); } catch (e) {}
  try { comp.x = (i % 12) * 48; comp.y = 6200 + Math.floor(i / 12) * 48; } catch (e) {}
  svgSourcing.autoCreated++;
  const reg2 = readAutoRegistry(libPage);
  reg2[sig] = comp.id;
  try { libPage.setPluginData(SVG_AUTO_REGISTRY_KEY, JSON.stringify(reg2)); } catch (e) {}
  return comp;
}

// 在实例子树里找引用了指定槽 key 的内层实例 (componentPropertyReferences 通道)
function findSlotChild(inst, slotKey) {
  let hit = null;
  const walk = (n) => {
    if (hit || !n) return;
    try {
      const r = n.componentPropertyReferences;
      if (n.type === "INSTANCE" && r && Object.values(r).indexOf(slotKey) >= 0) { hit = n; return; }
      for (const c of (n.children || [])) walk(c);
    } catch (e) {}
  };
  walk(inst);
  return hit;
}

// 找实例上的全部图标 INSTANCE_SWAP 槽 key (如 sidebar-icon#118:1 / icon#118:13)
function findIconSlotKeys(inst) {
  const keys = [];
  let cps = null;
  try { cps = inst.componentProperties; } catch (e) { return keys; }
  if (!cps) return keys;
  for (const k of Object.keys(cps)) {
    if (cps[k] && cps[k].type === "INSTANCE_SWAP" && /icon/i.test(k)) keys.push(k);
  }
  return keys;
}

// 快照槽位实例内层矢量的第一笔 paint (描边型在 strokes, 填充型在 fills;
// 可能带变量绑定, 原样传递)
function snapshotSlotPaint(slotChild) {
  try {
    const vec = (slotChild.children || []).find((c) => c.type === "VECTOR" || c.type === "BOOLEAN_OPERATION");
    if (vec) {
      if ((vec.strokes || []).length) return vec.strokes[0];
      if ((vec.fills || []).length) return vec.fills[0];
    }
  } catch (e) {}
  return null;
}

// 把 paint 涂到子树全部非空通道形状 (通道自适应; 多形状全涂, 保留绑定)
function paintSvgShapes(root, paint) {
  let painted = 0;
  const paintAll = (n) => {
    try {
      if (typeof n.strokes === "object" || typeof n.fills === "object") {
        if ((n.strokes || []).length) { n.strokes = [paint]; painted++; }
        else if ((n.fills || []).length) { n.fills = [paint]; painted++; }
      }
      for (const c of (n.children || [])) paintAll(c);
    } catch (e) {}
  };
  paintAll(root);
  return painted;
}

// ------------------------------------------------------------
// Phase 0 辅助: 实例文本替换 (数量一致按序)
// ------------------------------------------------------------
// origTexts: 原子树 TEXT 快照 [{chars, fontName}]; inst: 新建实例; slug: 用于 mismatch 明细
// 写实例内 TEXT 的 .characters 会自动形成实例 override
// 匹配策略(贪心前缀): 数量不一致时按序写 min(orig, inst) 个;
// 原文本为空的槽、实例多出的槽 → 写空格清除库默认占位(如数量徽标"2")
async function applyInstanceTexts(origTexts, inst, stats, slug) {
  const instTexts = [];
  collectTexts(inst, instTexts);
  if (!origTexts.length && !instTexts.length) return; // 双方都无文本, 不计数
  const mismatched = origTexts.length !== instTexts.length;
  if (mismatched) {
    stats.textMismatch++;
    stats.textMismatchList[slug] = (stats.textMismatchList[slug] || 0) + 1;
  }
  const n = Math.min(origTexts.length, instTexts.length);
  let written = 0, cleared = 0;
  for (let i = 0; i < instTexts.length; i++) {
    const t = instTexts[i];
    const o = i < n ? origTexts[i] : null;
    try {
      if (o && o.chars) {
        if (t.characters === o.chars) continue; // 已一致
        // 字体加载: 优先用原文本的 fontName, 取不到则用实例文本自己的
        let fn = (o.fontName && typeof o.fontName === "object") ? o.fontName : null;
        if (!fn) { try { fn = t.fontName; } catch (e) { fn = null; } }
        if (fn && typeof pixso.loadFontAsync === "function") {
          try { await pixso.loadFontAsync(fn); } catch (e) {}
        }
        t.characters = o.chars;
        written++;
      } else if (t.characters && String(t.characters).trim()) {
        // 原文本为空 / 实例多出的槽: 清空, 避免残留库默认值
        t.characters = " ";
        cleared++;
      }
    } catch (e) { stats.textWriteFail++; }
  }
  if (written || cleared) { stats.textReplaced++; stats.textNodesWritten += written; stats.textCleared += cleared; }
}

// ------------------------------------------------------------
// Phase 0: 组件实例替换 (+ 实例文本替换)
// ------------------------------------------------------------
// 记账口径: found = replaced + nested + missing + errors (严格对平, 无未归类路径)
// ------------------------------------------------------------
async function replaceWithInstances(allNodes, iconSvg) {
  const stats = { found: 0, replaced: 0, nested: 0, missing: 0, missingList: {}, errors: [],
                  textReplaced: 0, textMismatch: 0, textMismatchList: {}, textWriteFail: 0, textNodesWritten: 0, textCleared: 0, byNodeId: 0, byKey: 0, apiQueried: 0,
                  iconHarvested: 0, iconSlotsRestored: 0, iconPainted: 0, iconNoSlot: 0, iconAutoCreated: 0, iconAutoReused: 0 };

  // 防御检查: 两条创建策略至少一条可用
  const hasNodeIdPath = typeof pixso.getNodeByIdAsync === "function";
  const hasKeyPath = typeof pixso.importComponentByKeyAsync === "function";
  if (!hasNodeIdPath && !hasKeyPath) {
    stats.skipped = "getNodeByIdAsync / importComponentByKeyAsync 均不可用, 跳过实例替换";
    return stats;
  }

  // ② 收集候选节点 (含 px-a_* 身份属性集)
  const candidates = [];
  for (const n of allNodes) {
    let name = "";
    try { name = String(n.name || ""); } catch (e) { continue; }
    COMP_RE.lastIndex = 0;
    const m = COMP_RE.exec(name);
    if (!m) continue;
    // 解析 px-a_<key>_<value> 属性集 (老画板无 px-a_ 时为空)
    const attrs = {};
    ATTR_RE.lastIndex = 0;
    let am = null;
    while ((am = ATTR_RE.exec(name)) !== null) attrs[am[1]] = am[2];
    // 兜底: 至少带逻辑名 (px-comp_ 的 slug 本来就是 logical-component 的 slug 形态)
    if (m[1] === "comp" && !attrs["logical-component"]) attrs["logical-component"] = m[2];
    candidates.push({ node: n, kind: m[1], slug: m[2], attrs: attrs });
    stats.found++;
  }
  if (!candidates.length) {
    stats.note = "未发现 px-comp_ 标记 (若无新 zip 导入属预期; 图标通道 Phase 0.5 不依赖标记)";
    return stats;
  }

  // ③ 8002 服务解析 key (v5.5 主路径: 属性集整包上送, 服务端做发布库匹配)
  //    请求: 去重后的属性对象数组 (键=data-*名去前缀, 值=slug 形态)
  //    响应: 与请求同序 [{success, componentKey}]; 假 key/未发布组件会在
  //    importComponentByKeyAsync 处失败并回落 nodeId 兜底 —— 属预期
  const apiKeys = {};
  {
    const seen = {};
    const req = [];
    for (const c of candidates) {
      if (!c.attrs || !Object.keys(c.attrs).length) continue;
      const sig = attrSig(c.attrs);
      if (!seen[sig]) { seen[sig] = 1; req.push(c.attrs); }
    }
    stats.apiQueried = req.length;
    if (req.length) {
      try {
        const r = await fetch(COMPONENTS_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
        const arr = await r.json();
        if (Array.isArray(arr)) {
          for (let i = 0; i < Math.min(arr.length, req.length); i++) {
            const item = arr[i];
            if (item && item.success && item.componentKey) apiKeys[attrSig(req[i])] = item.componentKey;
          }
        }
        stats.apiResolved = Object.keys(apiKeys).length;
      } catch (e) { stats.apiError = String(e && e.message ? e.message : e); }
    }
  }

  // 组件节点缓存 (同一 nodeId 只查一次)
  const compCache = new Map();
  // v5.5: import 远端组件为主路径 (真实环境: 已发布组件 + 8002 真服务),
  // nodeId 本地直取为兜底 (当前本地环境: mock 假 key → import 失败 → 走兜底)
  async function createInstanceFor(entry, attrs) {
    // ① 主路径: 发布库 import —— 服务解析的 key 优先, 翻译表 key 次之
    const sig = attrs ? attrSig(attrs) : "";
    const key = (sig && apiKeys[sig]) || entry.key || null;
    if (key && hasKeyPath) {
      try {
        const comp = await pixso.importComponentByKeyAsync(key);
        if (comp && typeof comp.createInstance === "function") {
          let inst = comp.createInstance();
          if (inst && typeof inst.then === "function") inst = await inst;
          if (inst) { stats.byKey++; return inst; }
        }
      } catch (e) {}
    }
    // ② 兜底: 本地 nodeId 直取
    if (entry.nodeId && hasNodeIdPath) {
      let comp = compCache.get(entry.nodeId);
      if (comp === undefined) {
        try { comp = await pixso.getNodeByIdAsync(entry.nodeId); } catch (e) { comp = null; }
        compCache.set(entry.nodeId, comp);
      }
      if (comp && comp.type === "COMPONENT" && typeof comp.createInstance === "function") {
        try {
          let inst = comp.createInstance();
          if (inst && typeof inst.then === "function") inst = await inst;
          if (inst) { stats.byNodeId++; return inst; }
        } catch (e) {}
      }
    }
    return null;
  }

  // ④ 深度升序 (外层优先)
  const safeParent = (n) => { try { return n.parent || null; } catch (e) { return null; } };
  const depthOf = (n) => { let d = 0, p = safeParent(n); while (p) { d++; p = safeParent(p); } return d; };
  for (const c of candidates) c.depth = depthOf(c.node);
  candidates.sort((a, b) => a.depth - b.depth);

  // ⑤ 逐个替换
  const replacedIds = new Set();
  for (const c of candidates) {
    // 先查父级: 节点若已随祖先替换被删除, parent 读取会抛错/为空 → 计入 nested
    // (必须放在 name 读取之前, 否则已删除节点读 name 抛错会被漏记)
    const parent = safeParent(c.node);
    if (!parent) { stats.nested++; continue; }

    let name = "";
    try { name = String(c.node.name || ""); } catch (e) { stats.nested++; continue; } // 已删除节点兜底

    let p = parent, nested = false;
    while (p) { if (replacedIds.has(p.id)) { nested = true; break; } p = safeParent(p); }
    if (nested) { stats.nested++; continue; }               // 嵌套组件由库组件内部接管

    const entry = COMP_TRANSLATION[c.slug];
    if (!entry) {
      // 翻译表未收录: 剥掉 comp/icon 标记, 保留 px-* token 标记走 Phase 1
      stats.missing++;
      stats.missingList[c.slug] = (stats.missingList[c.slug] || 0) + 1;
      try {
        const tokens = name.split(/\s+/).filter((t) => !/^\.?px-(comp|icon|a)_/.test(t));
        const clean = tokens.join(" ").trim();
        if (clean && clean !== name) c.node.name = clean;
      } catch (e) {}
      continue;
    }

    // 几何快照
    let x = 0, y = 0, w = 0, h = 0, index = -1;
    try {
      x = c.node.x; y = c.node.y;
      w = c.node.width; h = c.node.height;
      index = (parent.children || []).indexOf(c.node);
    } catch (e) {}

    // 文本快照 (删除原子树前收割)
    const origTextNodes = [];
    collectTexts(c.node, origTextNodes);
    const origTexts = origTextNodes.map((t) => {
      let chars = "", fontName = null;
      try { chars = String(t.characters || ""); } catch (e) {}
      try { fontName = t.fontName; } catch (e) {}
      return { chars, fontName };
    });

    // 图标快照 (收割原子树里的图标, 两种形态, 按 DOM 序混排):
    //   ① TUI-SVG / Text-to-UI Icon 实例 → 别名 + 首笔 paint 快照
    //   ② 纯 svg 形状帧 → 节点引用 + 形状签名 + 尺寸 (绝大多数)
    const origIcons = [];
    {
      const walkIcons = (n) => {
        if (!n) return;
        try {
          if (n.type === "INSTANCE") {
            const cn = String((n.mainComponent || {}).name || "");
            if (cn.indexOf("TUI-SVG/") === 0) {
              const alias = cn.slice("TUI-SVG/".length);
              if (alias) {
                if (!svgComps.has(alias)) { try { svgComps.set(alias, n.mainComponent); svgSourcing.harvested++; registerAliasComp(alias, n.mainComponent); } catch (e) {} }
                origIcons.push({ alias: alias, paint: snapshotSlotPaint(n) });
                return; // 不深入图标内部
              }
            }
            if (cn.indexOf("Text-to-UI Icon/") === 0) {
              origIcons.push({ alias: cn.slice("Text-to-UI Icon/".length), paint: snapshotSlotPaint(n) });
              return;
            }
          } else if (looksLikeSvgFrame(n)) {
            origIcons.push({ svgNode: n, sig: sigOfSvgFrame(n), w: n.width, h: n.height });
            return; // 不深入形状帧内部
          }
        } catch (e) {}
        try { for (const ch of (n.children || [])) walkIcons(ch); } catch (e) {}
      };
      walkIcons(c.node);
      if (origIcons.length) stats.iconHarvested += origIcons.length;
    }

    try {
      const inst = await createInstanceFor(entry, c.attrs);
      if (!inst) throw new Error("两条策略均未能创建实例 (nodeId=" + (entry.nodeId || "无") + ")");

      // 尺寸对齐
      try {
        if (w > 0 && h > 0) {
          if (typeof inst.resizeWithoutConstraints === "function") inst.resizeWithoutConstraints(w, h);
          else inst.resize(w, h);
        }
      } catch (e2) {}

      // 插入原父级原层级
      let inserted = false;
      try { parent.insertChild(inst, index); inserted = true; } catch (e3) {
        try { parent.insertChild(index, inst); inserted = true; } catch (e4) {
          try { parent.appendChild(inst); inserted = true; } catch (e5) {}
        }
      }
      if (!inserted) throw new Error("实例无法插入父级");

      // 位置对齐 (auto-layout 父级会忽略 x/y, 属预期)
      try { inst.x = x; inst.y = y; } catch (e6) {}

      // 实例文本替换 (数量一致按序; 失败不影响结构替换)
      try { await applyInstanceTexts(origTexts, inst, stats, c.slug); } catch (eT) {}

      // 图标槽收割回填 (按序: 收割的第 i 个图标 → 新实例第 i 个图标 INSTANCE_SWAP 槽)
      //   alias 形态: ensureSvgComponent + setProperties + 重涂色
      //   svg 帧形态: ensureAutoSvgComponent (签名去重) + setProperties,
      //               组件内部即原矢量原色免重涂, 槽内实例 resize 到原帧尺寸
      if (origIcons.length) {
        const slotKeys = findIconSlotKeys(inst);
        if (!slotKeys.length) {
          stats.iconNoSlot += origIcons.length;   // 新实例无图标槽 (如 Accordion 库内自带 chevron)
        } else {
          for (let i = 0; i < Math.min(slotKeys.length, origIcons.length); i++) {
            const oi = origIcons[i];
            try {
              if (oi.alias) {
                const comp = await ensureSvgComponent(oi.alias, iconSvg);
                if (!comp) continue;
                await inst.setProperties({ [slotKeys[i]]: comp.id });
                if (oi.paint) {
                  const child = findSlotChild(inst, slotKeys[i]);
                  if (child && paintSvgShapes(child, oi.paint)) stats.iconPainted++;
                }
                stats.iconSlotsRestored++;
              } else if (oi.svgNode) {
                const comp = await ensureAutoSvgComponent(oi.sig, oi.svgNode);
                if (!comp) continue;
                await inst.setProperties({ [slotKeys[i]]: comp.id });
                const child = findSlotChild(inst, slotKeys[i]);
                if (child && oi.w > 0 && oi.h > 0) {
                  try { child.resize(oi.w, oi.h); } catch (eR) { try { child.resizeWithoutConstraints(oi.w, oi.h); } catch (eR2) {} }
                }
                stats.iconSlotsRestored++;
              }
            } catch (eI) { /* 单槽失败不影响其余 */ }
          }
        }
      }

      // 删除原子树
      replacedIds.add(c.node.id);
      try { c.node.remove(); } catch (e7) { try { c.node.visible = false; } catch (e8) {} }
      stats.replaced++;
    } catch (e) {
      stats.errors.push(c.slug + ": " + String(e && e.message ? e.message : e));
    }
  }

  // 自动组件计数 (svgSourcing 为全局累计, 此时 0.5 尚未运行, 数值即本段用量)
  stats.iconAutoCreated = svgSourcing.autoCreated;
  stats.iconAutoReused = svgSourcing.autoReused;
  return stats;
}

// ------------------------------------------------------------
// Phase 0.5: 图标槽位替换 (SVG 自建组件 + swapComponent)
// ------------------------------------------------------------
// 图标组件寻址: 共享 svgComps (运行缓存 + 注册表 + 现建, 见 ensureSvgComponent);
// 遍历时顺带收割文档中已有 TUI-SVG 实例的 mainComponent (C2D 自建的组件
// 活在内部画布, 页面树遍历不到, 但通过实例引用可以拿到)。
// 重复运行幂等: 已换成 TUI-SVG/* 的槽位不再匹配 Text-to-UI Icon 前缀。
// 非 Text-to-UI Icon 填充的槽位(如 .highlight)不在此处理 —— 被替换实例的图标
// 已由 Phase 0 的收割回填恢复; C2D 自行实例化产生的残留默认槽不在处理范围。
// ------------------------------------------------------------
async function swapIconsWithSvg(iconSvg) {
  const stats = { slots: 0, swapped: 0, alreadySvg: 0, skippedFill: {}, missingSvg: {}, createdComps: 0, componentMoved: 0, colorKept: 0, colorFail: 0, errors: [] };

  // ① 图标源由主流程预载 (iconSvg 为 null 时跳过, 原因见主流程)
  if (!iconSvg || typeof iconSvg !== "object") { stats.skipped = "icon-svg.json 未加载 (fetch 不可用或失败)"; return stats; }

  // ② 遍历全文档实例 (含嵌套实例; 库页面上的组件定义不是 INSTANCE 不会误入)
  const all = [];
  for (const page of (pixso.root.children || [])) walkDeep(page, all);
  const instances = all.filter((n) => { try { return n.type === "INSTANCE"; } catch (e) { return false; } });

  // ③ 逐实例处理 INSTANCE_SWAP 槽位
  for (const inst of instances) {
    let cps = null;
    try { cps = inst.componentProperties; } catch (e) { continue; }
    if (!cps) continue;
    const swapKeys = Object.keys(cps).filter((k) => cps[k] && cps[k].type === "INSTANCE_SWAP");
    if (!swapKeys.length) continue;

    // 定位引用了槽位属性的内层实例 (componentPropertyReferences)
    const slotChildren = [];
    const findRefs = (n) => {
      try {
        const r = n.componentPropertyReferences;
        if (n.type === "INSTANCE" && r && swapKeys.some((k) => Object.values(r).indexOf(k) >= 0)) slotChildren.push(n);
        for (const c of (n.children || [])) findRefs(c);
      } catch (e) {}
    };
    findRefs(inst);

    for (const child of slotChildren) {
      stats.slots++;
      const compName = String((child.mainComponent || {}).name || "");
      if (compName.indexOf("TUI-SVG/") === 0) {
        stats.alreadySvg++;
        // 收割: C2D 自建的 TUI-SVG 组件经实例引用登记进共享缓存 + 注册表自愈回写
        const alias = compName.slice("TUI-SVG/".length);
        if (!svgComps.has(alias)) { try { svgComps.set(alias, child.mainComponent); svgSourcing.harvested++; registerAliasComp(alias, child.mainComponent); } catch (e) {} }
        continue; // 重复运行幂等
      }
      if (compName.indexOf("Text-to-UI Icon/") !== 0) {
        // 非 Text-to-UI Icon 填充(如 .highlight): 别名推导不出, Phase 0 收割回填已覆盖被替换实例
        stats.skippedFill[compName] = (stats.skippedFill[compName] || 0) + 1;
        continue;
      }
      const alias = compName.slice("Text-to-UI Icon/".length);

      // 原内层矢量颜色快照
      const origPaint = snapshotSlotPaint(child);

      // 取/建 SVG 组件 (共享寻址)
      const comp = await ensureSvgComponent(alias, iconSvg);
      if (!comp) { stats.missingSvg[alias] = (stats.missingSvg[alias] || 0) + 1; continue; }

      // swap + 颜色还原
      try {
        child.swapComponent(comp);
        if (origPaint) {
          if (paintSvgShapes(child, origPaint)) stats.colorKept++; else stats.colorFail++;
        }
        stats.swapped++;
      } catch (e) {
        stats.errors.push(alias + " swap: " + String(e && e.message ? e.message : e));
      }
    }
  }
  stats.createdComps = svgSourcing.created;
  stats.sourcing = svgSourcing;

  // 收尾校正: 本次新建的组件若被引擎挪走, 再挂一次并计数 (存量组件不动)
  const libPage = getLibPage();
  for (const comp of svgCompsNew) {
    try {
      if (!comp.parent || comp.parent.id !== libPage.id) {
        libPage.appendChild(comp);
        stats.componentMoved++;
      }
    } catch (e) {}
  }

  return stats;
}

// ------------------------------------------------------------
// Phase 2: 按值绑定收尾 (v5.8, 泛化自 v5.7 的 0.55)
// ------------------------------------------------------------
// 背景: C2D 转换不产生变量绑定 → 三类裸色 Phase 1(标记绑定)管不到:
//   ① 库页母版内部的裸色(.bg 组件、control button 边框、TUI-SVG 图标…)
//   ② 导入画板上的裸节点(未替换结构的 svg 矢量、装饰矩形…)
//   ③ 图标按钮的色彩本就无标记(svg 靠 currentColor 继承, 文字类标记
//      只贴有直接文本的元素 → 色彩通道对 icon-only 组件隐形)
// 修复: 文件 COLOR 变量的「值」本身就是现成的 色值→变量 反查表 ——
//   把未绑定 SOLID paint 按 rgb 精确 + alpha ±2 容差匹配绑回。
// 顺序: 在 Phase 1 之后(标记绑定是权威语义, 先做完; 已绑定的逐项跳过)。
// 范围: 库页全部 COMPONENT 母版 + 导入画板(targetBoard);
//   统一剪枝: 遇 INSTANCE 不深入 —— 不给实例造 override,
//   实例内部靠它的母版被单独扫到而自动继承(.bg 组件被绑 → 全部实例生效)。
// 幂等: 已绑定跳过; 无匹配(如透明 mask)保持原值计入 noMatch。
// ------------------------------------------------------------
async function bindValuePaints(targetBoard) {
  const stats = { vars: 0, comps: 0, nodes: 0, bound: 0, noMatch: 0, targetBoard: targetBoard ? String(targetBoard.id) : null, note: "" };

  // ① 值→变量表: COLOR 类型变量的 valuesByMode → {"r,g,b": [{a255, v}]}
  const byRgb = new Map();
  try {
    const vars = await pixso.variables.getLocalVariablesAsync();
    for (const v of vars) {
      if (v.isSoftDeleted) continue;
      let isColor = false;
      try { isColor = (v.resolvedType === "COLOR") || (v.type === "COLOR"); } catch (e) {}
      if (!isColor) continue;
      let modes = null;
      try { modes = v.valuesByMode; } catch (e) { modes = null; }
      if (!modes) continue;
      for (const mk of Object.keys(modes)) {
        const c = modes[mk];
        if (!c || typeof c !== "object" || c.r == null) continue;
        const key = Math.round(c.r * 255) + "," + Math.round(c.g * 255) + "," + Math.round(c.b * 255);
        const a = Math.round((c.a == null ? 1 : c.a) * 255);
        if (!byRgb.has(key)) byRgb.set(key, []);
        byRgb.get(key).push({ a: a, v: v });
        stats.vars++;
      }
    }
  } catch (e) { stats.note = "读变量失败: " + String(e && e.message || e); return stats; }
  if (!byRgb.size) { stats.note = "无 COLOR 变量可建表"; return stats; }

  // ② 统一 walker: 遇 INSTANCE 剪枝(不造 override; 实例内部靠母版继承)
  const walkPruned = (n, arr) => {
    if (!n) return;
    try { if (n.type === "INSTANCE") return; } catch (e) {}
    arr.push(n);
    try { for (const c of (n.children || [])) walkPruned(c, arr); } catch (e) {}
  };

  // ③ 扫描集: 库页全部 COMPONENT + 导入画板子树
  const libPage = getLibPage();
  const compNodes = [];   // 母版们(各子树分别扫)
  const boardNodes = [];  // 画板裸节点
  try {
    for (const c of (libPage.children || [])) {
      try { if (c.type === "COMPONENT") { compNodes.push(c); stats.comps++; } } catch (e) {}
    }
  } catch (e) {}
  if (targetBoard) {
    walkPruned(targetBoard, boardNodes);
  } else {
    stats.note = stats.note || "未指定导入画板, 仅扫库页母版";
  }

  // ④ 逐项绑定: fills/strokes 数组逐项(不只 [0]), 未绑定 SOLID → 值匹配
  const bindNode = (n, isBoard) => {
    let touched = false;
    for (const channel of ["strokes", "fills"]) {
      try {
        const ps = n[channel];
        if (!Array.isArray(ps) || !ps.length) continue;
        let changed = false;
        const out = ps.map((p) => {
          if (!p || p.type !== "SOLID" || !p.color) return p;
          if (p.boundVariables && p.boundVariables.color) return p;   // 已绑定
          touched = true;
          const key = Math.round(p.color.r * 255) + "," + Math.round(p.color.g * 255) + "," + Math.round(p.color.b * 255);
          const list = byRgb.get(key);
          const a = Math.round((p.opacity == null ? 1 : p.opacity) * 255);
          const hit = list && list.find((x) => Math.abs(x.a - a) <= 2);
          if (!hit) { stats.noMatch++; return p; }
          const fresh = { type: "SOLID", color: { r: p.color.r, g: p.color.g, b: p.color.b }, opacity: p.opacity == null ? 1 : p.opacity };
          const bound = pixso.variables.setBoundVariableForPaint(fresh, "color", hit.v);
          changed = true;
          stats.bound++;
          return bound || fresh;
        });
        if (changed) n[channel] = out;
      } catch (e) {}
    }
    if (isBoard && touched) stats.nodes++;
  };

  for (const comp of compNodes) {
    const arr = [];
    walkPruned(comp, arr);
    for (const n of arr) bindNode(n, false);
  }
  for (const n of boardNodes) bindNode(n, true);
  return stats;
}

// ------------------------------------------------------------
// Phase 0.6: C2D 实例文本槽修复
// ------------------------------------------------------------
// 现象: C2D 实例化 Sidebar Item 时会把同一个 DOM label 同时填进
// 「文本」和「数量」两个 TEXT 槽 (如 未读邮件|未读邮件)。
// 启发式: 两个文本槽内容相同且非纯数字 → 视为重复填充, 清掉数量槽;
// 优先把 quantity BOOLEAN 槽设 false (连数量徽标一起隐藏), 失败退回写空格。
// 幂等: 修复后只剩 1 个文本槽(texts.length !== 2), 重复运行自动跳过。
// ------------------------------------------------------------
async function fixDuplicatedTextSlots() {
  const stats = { found: 0, fixed: 0, byBoolean: 0, byBlank: 0 };
  const all = [];
  for (const page of (pixso.root.children || [])) walkDeep(page, all);
  for (const inst of all) {
    let isSidebar = false;
    try { isSidebar = inst.type === "INSTANCE" && (inst.mainComponent || {}).name === "state=default"; } catch (e) { continue; }
    if (!isSidebar) continue;
    const texts = [];
    collectTexts(inst, texts);
    if (texts.length !== 2) continue;
    const a = String(texts[0].characters || "");
    const b = String(texts[1].characters || "");
    // 相同、非空、非纯数字 → 重复填充
    if (!a.trim() || a !== b || /^\d+$/.test(a.trim())) continue;
    stats.found++;

    // 优先 BOOLEAN 槽(quantity): 设 false 隐藏数量徽标
    let boolKey = null;
    try {
      const cps = inst.componentProperties || {};
      for (const k of Object.keys(cps)) {
        if (cps[k] && cps[k].type === "BOOLEAN" && /quantity|数量/i.test(k)) { boolKey = k; break; }
      }
    } catch (e) {}
    if (boolKey) {
      try {
        await inst.setProperties({ [boolKey]: false });
        stats.byBoolean++; stats.fixed++;
        continue;
      } catch (e) {}
    }
    // 退回: 第二个文本槽(数量)写空格
    try {
      if (String(texts[1].characters || "").trim()) {
        let fn = null; try { fn = texts[1].fontName; } catch (e) {}
        if (fn && typeof pixso.loadFontAsync === "function") { try { await pixso.loadFontAsync(fn); } catch (e) {} }
        texts[1].characters = " ";
        stats.byBlank++; stats.fixed++;
      }
    } catch (e) {}
  }
  return stats;
}

// ------------------------------------------------------------
// Phase 1: Token 绑定 (v3 原有逻辑, 未改动)
// ------------------------------------------------------------
const vars = await pixso.variables.getLocalVariablesAsync();
const byName = new Map();
const byKey = new Map();
for (const v of vars) {
  if (v.isSoftDeleted) continue;
  if (!byName.has(v.name)) byName.set(v.name, v);
  if (v.key && !byKey.has(v.key)) byKey.set(v.key, v);
}

const bindPaint = (node, channel, varObj) => {
  try {
    const paints = node[channel];
    if (!Array.isArray(paints) || !paints.length) return false;
    const out = paints.map((p, idx) => {
      if (idx > 0 || !p || p.type !== "SOLID" || !p.color) return p;
      const fresh = { type: "SOLID", color: { r: p.color.r, g: p.color.g, b: p.color.b }, opacity: p.opacity == null ? 1 : p.opacity };
      const bound = pixso.variables.setBoundVariableForPaint(fresh, "color", varObj);
      return bound || fresh;
    });
    node[channel] = out;
    return true;
  } catch (e) { return false; }
};

const findTextChildren = (node) => {
  const texts = [];
  try {
    for (const c of (node.children || [])) {
      if (c.type === "TEXT") texts.push(c);
      if (texts.length < 10) {
        for (const gc of (c.children || [])) {
          if (gc.type === "TEXT") texts.push(gc);
        }
      }
    }
  } catch (e) {}
  return texts;
};

const stats = { found: 0, bound: 0, descended: 0, skipped: 0, renamed: 0, detail: {}, keyImportResolved: 0, keyLocalResolved: 0, nameResolved: 0 };
// token → 变量对象解析 (三层, 逐 token 缓存):
//   ① importVariableByKeyAsync(服务 key) —— 正式环境主路径(用户实测可用);
//     本地 eval_script 沙箱无此 API(环境差异) → typeof+try/catch 包一层, 静默滑落
//   ② byKey 本地直查 (变量对象自带 key, 与 /api/tokens 的 key 一致)
//   ③ byName 按名兜底
const varCache = new Map();    // cssVar → 变量对象 | null (每 token 只解析一次)
const importCache = new Map(); // 变量 key → Promise (同 key 别名如 --radius-1/-radius-04 只导一次)
async function resolveTokenVar(cssVarName) {
  if (varCache.has(cssVarName)) return varCache.get(cssVarName) || null;
  let v = null;
  const key = TOKEN_KEY[cssVarName];
  if (key) {
    // ① 主路径: 按 key 导入远端变量 (包一层: API 不存在/抛错/返回空 → 滑落 ②③)
    if (typeof pixso.importVariableByKeyAsync === "function") {
      let p = importCache.get(key);
      if (!p) {
        p = (async () => { try { const x = await pixso.importVariableByKeyAsync(key); return x || null; } catch (e) { return null; } })();
        importCache.set(key, p);
      }
      const imp = await p;
      if (imp) { v = imp; stats.keyImportResolved++; }
    }
    // ② 兜底A: 本地变量按 key 直查
    if (!v) {
      const hit = byKey.get(key);
      if (hit) { v = hit; stats.keyLocalResolved++; }
    }
  }
  // ③ 兜底B: key 不对/缺失 → 按名查
  if (!v) {
    const nm = TOKEN_NAME[cssVarName];
    if (nm) {
      const hit = byName.get(nm);
      if (hit) { v = hit; stats.nameResolved++; }
    }
  }
  varCache.set(cssVarName, v || null);
  return v;
}

// ------------------------------------------------------------
// 主流程
// ------------------------------------------------------------

// [预载] icon-svg.json (Phase 0 图标回填与 0.5 共用; 失败不阻断, 各自降级:
//        Phase 0 的收割回填退化为只用注册表/已收割组件, 0.5 整段跳过)
let iconSvg = null;
let phase0IconNote = "";
{
  let err = null;
  if (typeof fetch !== "function") err = "沙箱无 fetch";
  else {
    try {
      const r = await fetch(ICON_SVG_URL);
      iconSvg = await r.json();
      if (!iconSvg || typeof iconSvg !== "object") { iconSvg = null; err = "icon-svg.json 格式异常"; }
    } catch (e) { err = "拉取 icon-svg.json 失败: " + String(e && e.message ? e.message : e); }
  }
  if (err) phase0IconNote = err; else phase0IconNote = "svgLoaded=" + Object.keys(iconSvg).length;
}

// [预载] 变量映射 /api/tokens (v5.6 接口化, 无内嵌表)
//        响应 { "<cssVar>": {name, key} } → TOKEN_NAME(兜底按名) + TOKEN_KEY(主路径按 key)
//        失败 → 两表为空 → Phase 1 全 skipped (tokensNote 记录原因)
const TOKEN_NAME = {};
const TOKEN_KEY = {};
let tokensNote = "";
{
  let err = null;
  if (typeof fetch !== "function") err = "沙箱无 fetch";
  else {
    try {
      const r = await fetch(TOKENS_API);
      const obj = await r.json();
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const k of Object.keys(obj)) {
          const e = obj[k];
          if (e && typeof e === "object") { if (e.name) TOKEN_NAME[k] = e.name; if (e.key) TOKEN_KEY[k] = e.key; }
          else if (typeof e === "string") TOKEN_NAME[k] = e;   // 兼容纯字符串形态
        }
        tokensNote = "apiTokens=" + Object.keys(TOKEN_NAME).length;
      } else err = "/api/tokens 响应格式异常";
    } catch (e) { err = "拉取 /api/tokens 失败: " + String(e && e.message ? e.message : e); }
  }
  if (err) tokensNote = err;
}

// [预载] 识别导入画板 (v5.8 Phase 2 的画板作用域):
//        顶层名"html"且带 px-comp/px-a 标记 → 本轮目标
//        (标记每轮被消费, 带标记的必然是刚导入的; 幂等重跑无标记时
//         回退取 id 最大者; 一块都没有 → 只扫库页母版)
let targetBoard = null;
let targetBoardNote = "";
{
  const htmlBoards = [];
  let markerBoard = null;
  for (const p of (pixso.root.children || [])) {
    try {
      for (const c of (p.children || [])) {
        try { if (c.type === "FRAME" && c.name === "html") htmlBoards.push(c); } catch (e) {}
      }
    } catch (e) {}
  }
  const idKey = (n) => { const m = /(\d+):(\d+)/.exec(String(n.id)); return m ? Number(m[1]) * 1e9 + Number(m[2]) : 0; };
  for (const b of htmlBoards) {
    const all = [];
    walkDeep(b, all);
    let hasMarker = false;
    for (const n of all) {
      try { if (/px-(comp|icon|a)_/.test(String(n.name || ""))) { hasMarker = true; break; } } catch (e) {}
    }
    if (hasMarker && (!markerBoard || idKey(b) > idKey(markerBoard))) markerBoard = b;
  }
  if (markerBoard) targetBoard = markerBoard;
  else if (htmlBoards.length) {
    targetBoard = htmlBoards.reduce((a, b) => (idKey(b) > idKey(a) ? b : a));
    targetBoardNote = "无带标记画板, 回退取 id 最大者(幂等重跑)";
  } else targetBoardNote = "未找到 html 画板, 仅扫库页母版";
}

// [Phase 0] 组件实例替换 + 文本替换 + 图标槽收割回填
let allNodes = [];
for (const page of (pixso.root.children || [])) walkDeep(page, allNodes);
const phase0 = await replaceWithInstances(allNodes, iconSvg);

// [Phase 0.5] 图标槽位替换 (组件实例全部就位后统一处理)
const phase0Icons = await swapIconsWithSvg(iconSvg);
phase0Icons.note = phase0IconNote;

// [Phase 0.6] C2D 实例文本槽修复 (Sidebar Item 重复填充)
const phase0TextFix = await fixDuplicatedTextSlots();

// [Phase 1] Token 绑定 (重新遍历, 拿到替换后的干净节点表)
allNodes = [];
for (const page of (pixso.root.children || [])) walkDeep(page, allNodes);

for (const n of allNodes) {
  const name = String(n.name || "");
  if (name.indexOf("px-") < 0) continue;
  stats.found++;

  let m;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(name)) !== null) {
    const kind = m[1];
    const cssVarName = "--" + m[2];
    const v = await resolveTokenVar(cssVarName);
    if (!v) { stats.skipped++; continue; }

    if (kind === "fill" || kind === "stroke") {
      const channel = kind === "stroke" ? "strokes" : "fills";
      if (bindPaint(n, channel, v)) { stats.bound++; stats.detail[kind] = (stats.detail[kind] || 0) + 1; }
    } else if (kind === "color") {
      if (n.type === "TEXT") {
        if (bindPaint(n, "fills", v)) { stats.bound++; stats.detail.color_text = (stats.detail.color_text || 0) + 1; }
      } else {
        const texts = findTextChildren(n);
        let any = false;
        for (const t of texts) {
          if (bindPaint(t, "fills", v)) { any = true; stats.descended++; }
        }
        if (any) { stats.bound++; stats.detail.color_descend = (stats.detail.color_descend || 0) + 1; }
      }
    } else if (kind === "fs" || kind === "lh" || kind === "font") {
      const field = TEXT_FIELD_MAP[kind];
      if (n.type === "TEXT") {
        try { n.setBoundVariable(field, v); stats.bound++; stats.detail[kind + "_text"] = (stats.detail[kind + "_text"] || 0) + 1; } catch (e) { stats.skipped++; }
      } else {
        const texts = findTextChildren(n);
        let any = false;
        for (const t of texts) {
          try { t.setBoundVariable(field, v); any = true; stats.descended++; } catch (e) {}
        }
        if (any) { stats.bound++; stats.detail[kind + "_descend"] = (stats.detail[kind + "_descend"] || 0) + 1; }
      }
    } else {
      const field = FIELD_MAP[kind];
      if (field) {
        try { n.setBoundVariable(field, v); stats.bound++; stats.detail[kind] = (stats.detail[kind] || 0) + 1; } catch (e) { stats.skipped++; }
      }
    }
  }
  MARKER_RE.lastIndex = 0;

  const clean = name.replace(/\s*px-[a-zA-Z]+_[^\s]+/g, "").trim();
  if (clean !== name && clean.length > 0) { try { n.name = clean; stats.renamed++; } catch (e) {} }
  else if (clean.length === 0) { try { n.name = "layer"; stats.renamed++; } catch (e) {} }
  MARKER_RE.lastIndex = 0;
}

// [Phase 2] 按值绑定收尾 (v5.8): Phase 1 标记绑定已完成(权威语义),
// 用变量值反查表把剩余裸色绑上 —— 库页全部母版 + 导入画板, 遇 INSTANCE 剪枝
const phase2ValueBind = await bindValuePaints(targetBoard);
phase2ValueBind.note = (targetBoardNote ? targetBoardNote + "; " : "") + (phase2ValueBind.note || "");

try { pixso.commitUndo(); } catch (e) {}

// 汇总报告
return { ok: true, phase0: phase0, phase0Icons: phase0Icons, phase2ValueBind: phase2ValueBind, phase0TextFix: phase0TextFix, phase1: { found: stats.found, bound: stats.bound, descended: stats.descended, skipped: stats.skipped, renamed: stats.renamed, detail: stats.detail, keyImportResolved: stats.keyImportResolved, keyLocalResolved: stats.keyLocalResolved, nameResolved: stats.nameResolved, tokensNote: tokensNote } };
