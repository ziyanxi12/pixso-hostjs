// CM Token 绑定插件 v3
// 命令: minimal=最小测试 remote=执行远程脚本 bind=完整绑定 clean=仅清理 status=只读统计
// 开发模式说明: 每次点菜单都会从磁盘重新加载本文件，直接改代码即可执行新逻辑

const COLOR_TABLE = {
  "10,89,247": [[12, "brand/05"], [25, "brand/10"], [38, "brand/15"], [51, "brand/20"], [77, "brand/30"], [102, "brand/40"], [127, "brand/50"], [153, "brand/60"], [178, "brand/70"], [204, "brand/80"], [229, "brand/90"], [255, "brand/100"]],
  "0,0,0": [[12, "neutral-dark/05"], [25, "neutral-dark/10"], [38, "neutral-dark/15"], [51, "neutral-dark/20"], [77, "neutral-dark/30"], [102, "neutral-dark/40"], [127, "neutral-dark/50"], [153, "neutral-dark/60"], [178, "neutral-dark/70"], [204, "neutral-dark/80"], [229, "neutral-dark/90"], [255, "neutral-dark/100"]],
  "255,255,255": [[12, "neutral-light/05"], [25, "neutral-light/10"], [38, "neutral-light/15"], [51, "neutral-light/20"], [77, "neutral-light/30"], [102, "neutral-light/40"], [127, "neutral-light/50"], [153, "neutral-light/60"], [178, "neutral-light/70"], [204, "neutral-light/80"], [229, "neutral-light/90"], [255, "neutral-light/100"]],
  "100,187,92": [[25, "function/success/10"], [51, "function/success/20"], [255, "function/success/100"]],
  "237,111,33": [[25, "function/warning/10"], [51, "function/warning/20"], [255, "function/warning/100"]],
  "232,64,38": [[25, "function/danger/10"], [51, "function/danger/20"], [255, "function/danger/100"]],
  "86,74,247": [[255, "multi/01"]],
  "70,177,227": [[255, "multi/02"]],
  "97,207,190": [[255, "multi/03"]],
  "165,214,29": [[255, "multi/04"]],
  "172,73,245": [[255, "multi/05"]],
  "230,69,102": [[255, "multi/06"]],
  "249,160,30": [[255, "multi/07"]],
  "247,206,0": [[255, "multi/08"]]
};
const N_RADIUS = { "4": "radius/04", "6": "radius/06", "8": "radius/08", "12": "radius/12", "16": "radius/16", "999": "radius/full" };
const N_SPACE = { "2": "space/1", "4": "space/2", "8": "space/3", "12": "space/4", "16": "space/5", "24": "space/6", "32": "space/7" };
const N_FONT = { "10": "font/size/10", "12": "font/size/12", "14": "font/size/14", "16": "font/size/16", "18": "font/size/18", "20": "font/size/20", "24": "font/size/24" };
const SPACE_VALUES = { "space/0": 0, "space/1": 2, "space/2": 4, "space/3": 8, "space/4": 12, "space/5": 16, "space/6": 24, "space/7": 32 };
const RADIUS_VALUES = { "radius/0": 0, "radius/04": 4, "radius/06": 6, "radius/08": 8, "radius/12": 12, "radius/16": 16, "radius/full": 999 };
const FONT_SIZES = { "font/size/10": 10, "font/size/12": 12, "font/size/14": 14, "font/size/16": 16, "font/size/18": 18, "font/size/20": 20, "font/size/24": 24, "font/size/30": 30, "font/size/38": 38, "font/size/48": 48, "font/size/56": 56 };
const FONT_FAMILY_NAME = "font/family/sans";
const FONT_FAMILY_VALUE = "HarmonyOS Sans SC";

const log = (...a) => { try { console.log("[cm-bind]", ...a); } catch (e) {} };
const step = (name) => { log("STEP:", name); try { pixso.notify("▶ " + name, { timeout: 2000 }); } catch (e) {} };
const hexToRgba = (key, alpha255) => {
  const p = key.split(",").map(Number);
  return { r: p[0] / 255, g: p[1] / 255, b: p[2] / 255, a: alpha255 / 255 };
};

// 跨页面查找导入的设计稿根节点（名为 html 的顶层 FRAME）
function findRoot() {
  const pages = (pixso.root && pixso.root.children) || [];
  for (const page of pages) {
    try {
      for (const c of page.children) {
        if (c.name === "html" && c.type === "FRAME") {
          if (page !== pixso.currentPage) pixso.currentPage = page;
          return c;
        }
      }
    } catch (e) { log("findRoot page err:", String(e && e.message ? e.message : e)); }
  }
  return pixso.getNodeById("30:15") || null;
}

function stripDangling(all, varIds) {
  let stripped = 0;
  for (const n of all) {
    for (const channel of ["fills", "strokes"]) {
      const paints = n[channel];
      if (!Array.isArray(paints) || !paints.length) continue;
      let changed = false;
      const out = paints.map(p => {
        const a = p && p.boundVariables && p.boundVariables.color;
        if (!a) return p;
        if (a.id && varIds.has(String(a.id))) return p;
        changed = true; stripped++;
        const fresh = { type: p.type };
        if (p.color) fresh.color = { r: p.color.r, g: p.color.g, b: p.color.b };
        if (p.opacity != null) fresh.opacity = p.opacity;
        if (p.visible === false) fresh.visible = false;
        return fresh;
      });
      if (changed) n[channel] = out;
    }
  }
  return stripped;
}

function bindColors(all, byName, varIds) {
  const stats = { fills: 0, strokes: 0, skipped: {} };
  for (const n of all) {
    for (const channel of ["fills", "strokes"]) {
      const paints = n[channel];
      if (!Array.isArray(paints) || !paints.length) continue;
      let changed = false;
      const out = paints.map(p => {
        if (!p || p.visible === false) return p;
        const existing = p.boundVariables && p.boundVariables.color;
        if (existing && existing.id && varIds.has(String(existing.id))) return p;
        if (p.type !== "SOLID" || !p.color) return p;
        const key = Math.round(p.color.r * 255) + "," + Math.round(p.color.g * 255) + "," + Math.round(p.color.b * 255);
        const alpha = Math.round((p.opacity == null ? 1 : p.opacity) * 255);
        const cands = COLOR_TABLE[key];
        const hit = cands && cands.find(c => Math.abs(c[0] - alpha) <= 2);
        if (!hit) { const k = key + "," + alpha; stats.skipped[k] = (stats.skipped[k] || 0) + 1; return p; }
        const v = byName.get(hit[1]);
        if (!v) return p;
        let fresh = { type: "SOLID", color: { r: p.color.r, g: p.color.g, b: p.color.b }, opacity: p.opacity == null ? 1 : p.opacity };
        try {
          if (pixso.variables && typeof pixso.variables.setBoundVariableForPaint === "function") {
            const bound = pixso.variables.setBoundVariableForPaint(fresh, "color", v);
            if (bound) fresh = bound;
          } else if (typeof pixso.createVariableAlias === "function") {
            fresh.boundVariables = { color: pixso.createVariableAlias(v) };
          } else {
            fresh.boundVariables = { color: { type: "VARIABLE_ALIAS", id: v.id } };
          }
        } catch (e) {
          log("bindColor err", n.id, String(e && e.message ? e.message : e));
          return p;
        }
        changed = true;
        stats[channel === "fills" ? "fills" : "strokes"]++;
        return fresh;
      });
      if (changed) n[channel] = out;
    }
  }
  return stats;
}

function bindNumerics(all, byName) {
  const stats = { radius: 0, fontSize: 0, itemSpacing: 0, padding: 0 };
  const bindField = (n, field, name) => {
    const v = byName.get(name);
    if (!v) return false;
    try {
      if (typeof n.setBoundVariable === "function") { n.setBoundVariable(field, v); return true; }
      if (typeof n.setBoundVariableAsync === "function") { n.setBoundVariableAsync(field, v); return true; }
    } catch (e) { log("bindField err", n.id, field, String(e && e.message ? e.message : e)); }
    return false;
  };
  for (const n of all) {
    let bv = null;
    try { bv = n.boundVariables; } catch (e) { bv = null; }
    if (typeof n.cornerRadius === "number" && n.cornerRadius > 0 && !(bv && bv.cornerRadius)) {
      const name = N_RADIUS[String(n.cornerRadius)];
      if (name && bindField(n, "cornerRadius", name)) stats.radius++;
    }
    if (n.type === "TEXT" && typeof n.fontSize === "number" && !(bv && bv.fontSize)) {
      const name = N_FONT[String(n.fontSize)];
      if (name && bindField(n, "fontSize", name)) stats.fontSize++;
    }
    if (typeof n.itemSpacing === "number" && n.itemSpacing > 0 && !(bv && bv.itemSpacing)) {
      const name = N_SPACE[String(n.itemSpacing)];
      if (name && bindField(n, "itemSpacing", name)) stats.itemSpacing++;
    }
    for (const f of ["paddingTop", "paddingBottom", "paddingLeft", "paddingRight"]) {
      const raw = n[f];
      if (typeof raw === "number" && raw > 0 && !(bv && bv[f])) {
        const name = N_SPACE[String(raw)];
        if (name && bindField(n, f, name)) stats.padding++;
      }
    }
  }
  return stats;
}

async function loadVariables() {
  const list = await pixso.variables.getLocalVariablesAsync();
  const byName = new Map();
  for (const v of list) if (!v.isSoftDeleted && !byName.has(v.name)) byName.set(v.name, v);
  log("本地变量:", byName.size);
  return byName;
}

async function ensureVariables(byName) {
  const collections = await pixso.variables.getLocalVariableCollectionsAsync();
  const colByName = new Map();
  for (const c of collections) colByName.set(c.name, c);
  const ensureCol = async (name) => {
    let c = colByName.get(name);
    if (!c) { c = await pixso.variables.createVariableCollection(name); colByName.set(name, c); log("建集合:", name); }
    return c;
  };
  const ensureVar = (name, col, modeId, type, value) => {
    if (byName.has(name)) return;
    try {
      const v = pixso.variables.createVariable(name, col, type);
      v.setValueForMode(modeId, value);
      byName.set(name, v);
    } catch (e) { log("建变量失败:", name, String(e && e.message ? e.message : e)); }
  };
  const colorCol = await ensureCol("Color");
  const cm = colorCol.modes[0].modeId;
  try { colorCol.renameMode(cm, "Light"); } catch (e) {}
  const seen = new Set();
  for (const key of Object.keys(COLOR_TABLE)) {
    for (const [alpha, name] of COLOR_TABLE[key]) {
      if (seen.has(name)) continue;
      seen.add(name);
      ensureVar(name, colorCol, cm, "COLOR", hexToRgba(key, alpha));
    }
  }
  const spCol = await ensureCol("Spacing");
  const sm = spCol.modes[0].modeId;
  try { spCol.renameMode(sm, "Compact"); } catch (e) {}
  for (const name of Object.keys(SPACE_VALUES)) ensureVar(name, spCol, sm, "FLOAT", SPACE_VALUES[name]);
  const rdCol = await ensureCol("Size & Layout");
  const rm = rdCol.modes[0].modeId;
  try { rdCol.renameMode(rm, "Desktop"); } catch (e) {}
  for (const name of Object.keys(RADIUS_VALUES)) ensureVar(name, rdCol, rm, "FLOAT", RADIUS_VALUES[name]);
  const ftCol = await ensureCol("Typography");
  const fm = ftCol.modes[0].modeId;
  try { ftCol.renameMode(fm, "HarmonyOS Sans"); } catch (e) {}
  for (const name of Object.keys(FONT_SIZES)) ensureVar(name, ftCol, fm, "FLOAT", FONT_SIZES[name]);
  ensureVar(FONT_FAMILY_NAME, ftCol, fm, "STRING", FONT_FAMILY_VALUE);
  return byName;
}

// ============ 命令: 最小测试（建变量 → 建矩形 → 绑定） ============
async function runMinimalTest() {
  step("最小测试: 准备颜色变量（幂等）");
  const cols = await pixso.variables.getLocalVariableCollectionsAsync();
  let col = cols.find(c => c.name === "cm-min-test");
  if (!col) { col = await pixso.variables.createVariableCollection("cm-min-test"); log("① 新建集合 id=" + col.id); }
  else log("① 复用集合 id=" + col.id);
  const modeId = col.modes[0].modeId;
  const existingVars = await pixso.variables.getLocalVariablesAsync();
  const setIdOf = (x) => String(x.variableCollectionId || x.variableSetID || "");
  let v = existingVars.find(x => x.name === "cm/test-color" && !x.isSoftDeleted && setIdOf(x) === String(col.id));
  if (v) {
    try { v.setValueForMode(modeId, { r: 0.04, g: 0.35, b: 0.97, a: 1 }); } catch (e) { log("值写入跳过:", String(e)); }
    log("① 复用已有变量 id=" + v.id);
  } else {
    v = pixso.variables.createVariable("cm/test-color", col, "COLOR");
    v.setValueForMode(modeId, { r: 0.04, g: 0.35, b: 0.97, a: 1 });
    log("① 变量已创建 id=" + v.id + " 集合=" + col.id);
  }

  step("最小测试: 创建矩形");
  const rect = pixso.createRectangle();
  rect.resize(120, 60);
  const sameName = pixso.currentPage.children.filter(c => c.name === "cm-min-test-rect");
  rect.x = 0;
  rect.y = sameName.length * 70;
  rect.name = "cm-min-test-rect";
  pixso.currentPage.appendChild(rect);
  log("② 矩形已创建 id=" + rect.id + " 位置 y=" + rect.y);

  step("最小测试: 绑定颜色到变量");
  const paint = { type: "SOLID", color: { r: 0.04, g: 0.35, b: 0.97 }, opacity: 1 };
  const bound = pixso.variables.setBoundVariableForPaint(paint, "color", v);
  rect.fills = [bound];
  const after = rect.fills[0];
  const alias = after && after.boundVariables && after.boundVariables.color;
  const aliasId = alias ? String(alias.id) : "无";
  log("③ 绑定完成 别名id=" + aliasId);

  try { pixso.commitUndo(); } catch (e) { log("commitUndo err", String(e)); }
  const ok = alias && String(alias.id) === String(v.id);
  const msg = (ok ? "✅" : "⚠️") + " 最小测试 · 变量 " + v.id + " · 矩形 " + rect.id + " · 别名 " + aliasId;
  log(msg);
  pixso.notify(msg, { timeout: 8000 });
  pixso.closePlugin();
}

// ============ 命令: 执行远程脚本（通用 JS 执行器） ============
async function runRemoteScript() {
  pixso.showUI(__html__, { title: "远程脚本执行器", width: 460, height: 380 });
  pixso.ui.onmessage = async (msg) => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "close") { pixso.closePlugin(); return; }
    if (msg.type !== "run-script" || typeof msg.code !== "string") return;
    log("远程脚本执行 (" + msg.code.length + " 字符)");
    try {
      const fn = new Function("pixso", '"use strict"; return (async () => {\n' + msg.code + "\n})();");
      const result = await fn(pixso);
      const text = result === undefined ? "(无返回值)" : safeJson(result);
      log("远程脚本结果:", text.slice(0, 1500));
      pixso.ui.postMessage({ type: "result", ok: true, text: text });
      try { pixso.commitUndo(); } catch (e) {}
    } catch (e) {
      const text = String(e && e.message ? e.message : e);
      log("远程脚本出错:", text);
      pixso.ui.postMessage({ type: "result", ok: false, text: text });
    }
  };
}

function safeJson(v) {
  try {
    return JSON.stringify(v, null, 1).slice(0, 3000);
  } catch (e) {
    return String(v);
  }
}

// 纯绑定模式所需的全部变量名清单
function expectedVariableNames() {
  const names = new Set();
  for (const key of Object.keys(COLOR_TABLE)) for (const pair of COLOR_TABLE[key]) names.add(pair[1]);
  for (const n of Object.keys(SPACE_VALUES)) names.add(n);
  for (const n of Object.keys(RADIUS_VALUES)) names.add(n);
  for (const n of Object.keys(FONT_SIZES)) names.add(n);
  names.add(FONT_FAMILY_NAME);
  return [...names];
}

// ============ 命令: status / bind / clean ============
async function run(command) {
  log("run(), command =", command, "apiVersion =", pixso.apiVersion, "page =", pixso.currentPage.name);
  if (!pixso.variables) {
    log("❌ pixso.variables 不存在");
    pixso.notify("❌ 此环境没有 pixso.variables API", { error: true, timeout: 8000 });
    pixso.closePlugin();
    return;
  }
  if (command === "minimal") { await runMinimalTest(); return; }
  if (command === "remote") { await runRemoteScript(); return; }

  const root = findRoot();
  if (!root) {
    const msg = "❌ 所有页面均未找到名为 html 的顶层画板（当前页: " + pixso.currentPage.name + "）";
    log(msg);
    pixso.notify(msg, { error: true, timeout: 6000 });
    pixso.closePlugin();
    return;
  }
  const all = [root, ...root.findAll(() => true)];
  log("root:", root.id, "nodes:", all.length);

  let byName = await loadVariables();
  const varIds = new Set();
  for (const v of byName.values()) varIds.add(String(v.id));

  if (command === "status") {
    let valid = 0, dangling = 0, unbound = 0, numeric = 0;
    for (const n of all) {
      for (const channel of ["fills", "strokes"]) {
        const ps = n[channel];
        if (!Array.isArray(ps)) continue;
        for (const p of ps) {
          if (!p || p.type !== "SOLID") continue;
          const a = p.boundVariables && p.boundVariables.color;
          if (!a) unbound++;
          else if (a.id && varIds.has(String(a.id))) valid++;
          else dangling++;
        }
      }
      const bv = n.boundVariables;
      if (bv) for (const k of Object.keys(bv)) if (k !== "fills" && k !== "strokes") numeric++;
    }
    const msg = "节点 " + all.length + " · 有效 " + valid + " · 悬空 " + dangling + " · 未绑 " + unbound + " · 数值 " + numeric;
    log("status:", msg);
    pixso.notify(msg, { timeout: 8000 });
    pixso.closePlugin();
    return;
  }

  // 纯绑定模式：不创建任何变量，缺失的 token 对应属性自动跳过
  const expected = expectedVariableNames();
  const missing = expected.filter(n => !byName.has(n));
  const hit = expected.length - missing.length;
  const report = "变量匹配: 命中 " + hit + " / 期望 " + expected.length + (missing.length ? "（缺失 " + missing.length + " 个，对应属性跳过）" : " ✓ 全部就绪");
  log(report, missing.length ? "缺失: " + missing.slice(0, 12).join(", ") + (missing.length > 12 ? " ... 共" + missing.length : "") : "");
  pixso.notify(report, { timeout: 4000 });

  step("清理悬空别名");
  const stripped = stripDangling(all, varIds);
  try { pixso.commitUndo(); } catch (e) { log("commitUndo err", String(e)); }
  log("phase1 清理:", stripped);
  pixso.notify("① 清理完成: " + stripped + " 处", { timeout: 3000 });
  if (command === "clean") { pixso.closePlugin("清理完成"); return; }

  step("颜色绑定");
  const c = bindColors(all, byName, varIds);
  try { pixso.commitUndo(); } catch (e) { log("commitUndo err", String(e)); }
  log("phase2:", c);
  pixso.notify("② 颜色: 填充 " + c.fills + " + 描边 " + c.strokes, { timeout: 3000 });

  step("数值绑定");
  const n3 = bindNumerics(all, byName);
  try { pixso.commitUndo(); } catch (e) { log("commitUndo err", String(e)); }
  log("phase3:", n3);
  pixso.notify("③ 数值: 圆角 " + n3.radius + " · 字号 " + n3.fontSize + " · 间距 " + n3.itemSpacing + " · 内边距 " + n3.padding, { timeout: 3000 });

  pixso.notify("✅ 完成 · 节点 " + all.length + " · 颜色 " + (c.fills + c.strokes) + " · 数值 " + (n3.radius + n3.fontSize + n3.itemSpacing + n3.padding), { icon: "SUCCESS", timeout: 8000 });
  pixso.closePlugin("CM Token 绑定完成");
}

let started = false;

function bootstrap(evt) {
  if (started) return;
  started = true;
  let command = null;
  if (typeof evt === "string") command = evt;
  else if (evt && typeof evt === "object" && typeof evt.command === "string") command = evt.command;
  if (!command) { try { command = pixso.command || null; } catch (e) {} }
  if (!command) command = "bind";
  log("bootstrap, command =", command);
  run(command).catch(e => {
    const msg = e && e.message ? e.message : String(e);
    log("FATAL:", msg);
    pixso.notify("❌ 出错: " + msg, { error: true, timeout: 10000 });
    pixso.closePlugin();
  });
}

try { pixso.on("run", bootstrap); } catch (e) { log("on(run) err:", String(e)); }
setTimeout(() => { if (!started) bootstrap(null); }, 300);
