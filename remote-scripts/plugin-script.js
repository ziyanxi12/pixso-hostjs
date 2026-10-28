// ===== 绑定脚本 v3: color 下传修复 + fill/stroke 直接绑 =====
const TOKEN_MAP = {"--color-neutral-light-100":"neutral-light/100","--color-neutral-dark-05":"neutral-dark/05","--color-neutral-dark-10":"neutral-dark/10","--color-neutral-dark-90":"neutral-dark/90","--space-4":"space/4","--space-6":"space/6","--font-sans":"font/family/sans","--radius-1":"radius/04","--font-size-16":"font/size/16","--line-height-20":"font/line-height/20","--radius-3":"radius/08","--space-2":"space/2","--space-3":"space/3","--color-neutral-dark-60":"neutral-dark/60","--font-size-14":"font/size/14","--line-height-16":"font/line-height/16","--space-5":"space/5","--color-brand-100":"brand/100","--space-1":"space/1","--color-brand-10":"brand/10","--color-neutral-dark-40":"neutral-dark/40","--font-size-20":"font/size/20","--line-height-24":"font/line-height/24","--font-size-12":"font/size/12","--line-height-14":"font/line-height/14","--color-function-success-100":"function/success/100","--radius-full":"radius/full","--color-brand-20":"brand/20","--color-neutral-dark-20":"neutral-dark/20","--space-7":"space/7"};
const MARKER_RE = /px-(fill|color|stroke|radius|gap|padt|padb|padl|padr|fs|lh|font)_([a-zA-Z0-9-]+)/g;
const FIELD_MAP = { radius: "cornerRadius", fs: "fontSize", lh: "lineHeight", gap: "itemSpacing", padt: "paddingTop", padb: "paddingBottom", padl: "paddingLeft", padr: "paddingRight", font: "fontFamily" };
const TEXT_FIELD_MAP = { fs: "fontSize", lh: "lineHeight", font: "fontFamily" };

const vars = await pixso.variables.getLocalVariablesAsync();
const byName = new Map();
for (const v of vars) if (!v.isSoftDeleted && !byName.has(v.name)) byName.set(v.name, v);

function walkDeep(node, arr) {
  if (!node) return;
  arr.push(node);
  try { for (const c of (node.children || [])) walkDeep(c, arr); } catch (e) {}
}
const allNodes = [];
for (const page of (pixso.root.children || [])) walkDeep(page, allNodes);

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

const stats = { found: 0, bound: 0, descended: 0, skipped: 0, renamed: 0, detail: {} };

for (const n of allNodes) {
  const name = String(n.name || "");
  if (name.indexOf("px-") < 0) continue;
  stats.found++;

  let m;
  MARKER_RE.lastIndex = 0;
  while ((m = MARKER_RE.exec(name)) !== null) {
    const kind = m[1];
    const cssVarName = "--" + m[2];
    const pixsoVarName = TOKEN_MAP[cssVarName];
    if (!pixsoVarName) { stats.skipped++; continue; }
    const v = byName.get(pixsoVarName);
    if (!v) { stats.skipped++; continue; }

    if (kind === "fill" || kind === "stroke") {
      // fill/stroke: 永远绑在当前节点（FRAME 的背景/描边）
      const channel = kind === "stroke" ? "strokes" : "fills";
      if (bindPaint(n, channel, v)) { stats.bound++; stats.detail[kind] = (stats.detail[kind] || 0) + 1; }
    } else if (kind === "color") {
      // color: 文字色——只在 TEXT 节点上直接绑；非 TEXT 一律下传
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
      // fs/lh/font: 文字属性——只在 TEXT 节点上直接绑；非 TEXT 下传
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
      // radius/gap/pad*: 布局属性——直接绑在当前节点
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

try { pixso.commitUndo(); } catch (e) {}

return { ok: true, ...stats };