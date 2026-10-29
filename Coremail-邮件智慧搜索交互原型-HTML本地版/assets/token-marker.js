// token-marker.js — 在 C2D 引擎浏览器内自动执行：溯源 + 贴码
// 此脚本会在 SPA 渲染完成后自动运行，为每个元素的 token 属性注入 px-* 标记类
// 标记类会被 C2D 引擎保留在节点名中，供后续绑定脚本解析
(function () {
  "use strict";

  // ---------- 配置 ----------
  var SH_PROBE = ["background", "border", "border-top", "border-right", "border-bottom", "border-left",
    "border-color", "border-radius", "gap", "padding", "padding-inline", "padding-block", "font", "row-gap", "column-gap",
    "border-inline", "border-block", "border-inline-start", "border-inline-end", "border-block-start", "border-block-end"];
  var INHERITED = { color: 1, fs: 1, lh: 1, font: 1 };
  function propKind(prop) {
    if (prop === "background-color") return "fill";
    if (prop === "color") return "color";
    if (/^border-(top|right|bottom|left)-color$/.test(prop)) return "stroke";
    if (prop === "border-radius") return "radius";
    if (prop === "row-gap" || prop === "column-gap") return "gap";
    if (/^padding-(top|bottom|left|right)$/.test(prop)) return "pad" + prop.split("-")[1][0];
    if (prop === "font-size") return "fs";
    if (prop === "line-height") return "lh";
    if (prop === "font-family") return "font";
    return null;
  }
  var SHORTHAND = {
    "background": ["background-color"], "background-color": ["background-color"], "color": ["color"],
    "border": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    "border-top": ["border-top-color"], "border-right": ["border-right-color"],
    "border-bottom": ["border-bottom-color"], "border-left": ["border-left-color"],
    "border-top-color": ["border-top-color"], "border-right-color": ["border-right-color"],
    "border-bottom-color": ["border-bottom-color"], "border-left-color": ["border-left-color"],
    "border-radius": ["border-radius"],
    "border-inline": ["border-left-color", "border-right-color"],
    "border-block": ["border-top-color", "border-bottom-color"],
    "border-inline-start": ["border-left-color"],
    "border-inline-end": ["border-right-color"],
    "border-block-start": ["border-top-color"],
    "border-block-end": ["border-bottom-color"],
    "gap": ["row-gap", "column-gap"], "row-gap": ["row-gap"], "column-gap": ["column-gap"],
    "padding": ["padding-top", "padding-bottom", "padding-left", "padding-right"],
    "padding-inline": ["padding-left", "padding-right"],
    "padding-block": ["padding-top", "padding-bottom"],
    "padding-top": ["padding-top"], "padding-bottom": ["padding-bottom"],
    "padding-left": ["padding-left"], "padding-right": ["padding-right"],
    "font": ["font-size", "line-height", "font-family"],
    "font-size": ["font-size"], "line-height": ["line-height"], "font-family": ["font-family"]
  };

  // ---------- 值归一化 ----------
  function normColor(s) {
    s = String(s).trim();
    if (s === "transparent" || s === "rgba(0, 0, 0, 0)") return "0,0,0,0";
    var hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
    if (hex) {
      var h = hex[1];
      return parseInt(h.substr(0, 2), 16) + "," + parseInt(h.substr(2, 2), 16) + "," + parseInt(h.substr(4, 2), 16) + "," + (h.length === 8 ? parseInt(h.substr(6, 2), 16) : 255);
    }
    var rgb = /rgba?\(([^)]+)\)/.exec(s);
    if (rgb) {
      var p = rgb[1].split(",").map(function (x) { return parseFloat(x); });
      return Math.round(p[0]) + "," + Math.round(p[1]) + "," + Math.round(p[2]) + "," + Math.round((p[3] == null ? 1 : p[3]) * 255);
    }
    return null;
  }
  function normLen(s) {
    var m = /^(-?[\d.]+)px$/.exec(String(s).trim());
    return m ? String(Math.round(parseFloat(m[1]))) : null;
  }
  function normFont(s) {
    return String(s).replace(/["']/g, "").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ").trim();
  }
  function normValue(kind, v) {
    if (kind === "fill" || kind === "color" || kind === "stroke") return normColor(v);
    if (kind === "font") return normFont(v);
    return normLen(v);
  }

  // ---------- 选择器工具 ----------
  function stripState(sel) {
    return sel.replace(/::[a-zA-Z-]+/g, "").replace(/:(hover|focus|focus-visible|focus-within|active|visited|target|disabled|checked|placeholder-shown|first-child|last-child|nth-child\([^)]*\)|not\([^)]*\))/g, "").trim();
  }
  function specOf(sel) {
    var ids = (sel.match(/#[a-zA-Z0-9_-]+/g) || []).length;
    var cls = (sel.match(/\.[a-zA-Z0-9_-]+/g) || []).length + (sel.match(/\[[^\]]+\]/g) || []).length;
    return ids * 1000 + cls * 10 + 1;
  }
  function extractVars(v) {
    var re = /var\((--[a-zA-Z0-9-]+)/g, arr = [], m;
    while ((m = re.exec(v))) arr.push(m[1]);
    return arr;
  }

  // ---------- :root 变量图 + 链解析 ----------
  function buildRootVars() {
    var rv = {};
    for (var si = 0; si < document.styleSheets.length; si++) {
      var sheet = document.styleSheets[si];
      var rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      for (var ri = 0; ri < rules.length; ri++) {
        var rule = rules[ri];
        if (!rule.selectorText || !rule.style) continue;
        if (rule.selectorText.indexOf(":root") < 0) continue;
        for (var pi = 0; pi < rule.style.length; pi++) {
          var pn = rule.style[pi];
          if (pn.indexOf("--") === 0) rv[pn] = rule.style.getPropertyValue(pn);
        }
      }
    }
    return rv;
  }
  function makeTerminalOf(rootVars) {
    return function terminalOf(name, seen) {
      var v = rootVars[name];
      if (v == null) return null;
      if (seen[name]) return null;
      seen[name] = 1;
      var m = /var\((--[a-zA-Z0-9-]+)/.exec(v);
      if (m) return terminalOf(m[1], seen);
      return { name: name, value: v.trim() };
    };
  }

  // ---------- 候选声明收集 ----------
  function collectCandidates(el, sheets) {
    var candidates = [];
    var i, pn, pv;
    for (i = 0; i < el.style.length; i++) {
      pn = el.style[i];
      if (pn.indexOf("--") === 0) continue;
      pv = el.style.getPropertyValue(pn);
      if (pv.indexOf("var(--") >= 0) candidates.push({ prop: pn, vars: extractVars(pv), score: 1000000 });
    }
    for (var sp = 0; sp < SH_PROBE.length; sp++) {
      try { pv = el.style.getPropertyValue(SH_PROBE[sp]); } catch (e) { pv = ""; }
      if (pv && pv.indexOf("var(--") >= 0) candidates.push({ prop: SH_PROBE[sp], vars: extractVars(pv), score: 1000000 });
    }
    for (var s2 = 0; s2 < sheets.length; s2++) {
      var rl = sheets[s2].rules;
      for (var r2 = 0; r2 < rl.length; r2++) {
        var ru = rl[r2];
        if (!ru.selectorText || !ru.style) continue;
        var parts = ru.selectorText.split(",");
        var matchedSpec = -1;
        for (var pt = 0; pt < parts.length; pt++) {
          if (parts[pt].indexOf("::") >= 0) continue;
          var s = stripState(parts[pt]);
          if (!s || s === ":root") continue;
          var hit = false;
          try { hit = el.matches(s); } catch (e) { continue; }
          if (hit) { var sc = specOf(s); if (sc > matchedSpec) matchedSpec = sc; }
        }
        if (matchedSpec < 0) continue;
        var score = matchedSpec * 100 + s2 * 10 + r2 * 0.001;
        for (i = 0; i < ru.style.length; i++) {
          pn = ru.style[i];
          if (pn.indexOf("--") === 0) continue;
          pv = ru.style.getPropertyValue(pn);
          if (pv.indexOf("var(--") >= 0) candidates.push({ prop: pn, vars: extractVars(pv), score: score });
        }
        for (sp = 0; sp < SH_PROBE.length; sp++) {
          try { pv = ru.style.getPropertyValue(SH_PROBE[sp]); } catch (e) { pv = ""; }
          if (pv && pv.indexOf("var(--") >= 0) candidates.push({ prop: SH_PROBE[sp], vars: extractVars(pv), score: score });
        }
      }
    }
    return candidates;
  }

  // ---------- 组件实例标记 ----------
  // 目的: 让 C2D 转换后的 Pixso 图层能被识别为「应替换为组件实例」的节点。
  // 通道: 类名 —— C2D 会把 tag + 所有 class 拼进图层名, 而 data-* 属性会全部丢失,
  //       所以组件身份信息必须编码成类名才能存活到 Pixso 侧。
  // 规则:
  //   [data-logical-component] 元素 → px-comp_<slug>
  //       slug = 逻辑名规范化, 如 Button/Ghost/Default → button-ghost-default
  //   svg[data-icon-alias]     元素 → px-icon_<slug>
  //       slug = 图标别名规范化, 如 navigation/chevron-down → navigation-chevron-down
  //   组件根的全部 data-* 属性 → px-a_<key>_<slugValue>   (v5.5 新增)
  //       key 去 data- 前缀, 值 slug 化(小写、非字母数字→横线, 与 px-comp 同规则);
  //       超长值(>48)跳过, 防图层名爆长。例:
  //       data-variant="primary" → px-a_variant_primary
  //       供 8002 组件解析服务整包上送做发布库匹配。
  // 嵌套组件(如 Titlebar 内的 Button)全部标记, 由插件侧按「最外层优先」处理。
  // slug 是确定性的(同一逻辑名永远生成同一 slug), 是 DOM 与 Pixso 图层之间的接头暗号。
  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function markComponents() {
    var stats = { components: 0, icons: 0, attrs: 0, logicalNames: [], iconAliases: [] };
    var logicalSeen = {}, iconSeen = {};

    // 1. 组件根元素: TUI 组件工厂函数生成的 data-logical-component 属性
    var comps = document.querySelectorAll("[data-logical-component]");
    for (var i = 0; i < comps.length; i++) {
      var el = comps[i];
      // 与 token 贴码一致: 跳过不可见元素(C2D 不会为它们生成图层)
      var cs = getComputedStyle(el);
      if (cs.display === "none" || el.hasAttribute("hidden")) continue;
      var logical = (el.getAttribute("data-logical-component") || "").trim();
      if (!logical) continue;
      var slug = slugify(logical);
      if (!slug) continue;
      el.classList.add("px-comp_" + slug);
      stats.components++;
      logicalSeen[logical] = 1;

      // 1b. 组件根的全部 data-* 属性 → px-a_<key>_<slug> (v5.5)
      //     key/value 经 slug 化后不含下划线, 与分隔符不冲突, 解析无歧义
      for (var ai = 0; ai < el.attributes.length; ai++) {
        var at = el.attributes[ai];
        if (at.name.indexOf("data-") !== 0) continue;
        var akey = slugify(at.name.slice(5));
        var aval = slugify(at.value || "");
        if (!akey || !aval || aval.length > 48) continue;
        el.classList.add("px-a_" + akey + "_" + aval);
        stats.attrs++;
      }
    }

    // 2. 图标: 图标工厂函数生成的 svg[data-icon-alias]
    var icons = document.querySelectorAll("svg[data-icon-alias]");
    for (var j = 0; j < icons.length; j++) {
      var svg = icons[j];
      var alias = (svg.getAttribute("data-icon-alias") || "").trim();
      if (!alias) continue;
      var islug = slugify(alias);
      if (!islug) continue;
      // SVGElement.classList 在 C2D 的 Chromium 内核里可用
      svg.classList.add("px-icon_" + islug);
      stats.icons++;
      iconSeen[alias] = 1;
    }

    // 3. 汇总运行时实际出现的逻辑名/图标别名 —— 用于核对插件侧翻译表的覆盖面
    stats.logicalNames = Object.keys(logicalSeen);
    stats.iconAliases = Object.keys(iconSeen);
    return stats;
  }

  // ---------- 主逻辑 ----------
  function injectMarkers() {
    var rootVars = buildRootVars();
    var terminalOf = makeTerminalOf(rootVars);
    var sheets = [];
    for (var si = 0; si < document.styleSheets.length; si++) {
      var sheet = document.styleSheets[si];
      var rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      if (!rules) continue;
      sheets.push({ rules: rules, si: si });
    }

    function findToken(cands, kind, targetProp, cNorm, computed) {
      var best = null;
      for (var c = 0; c < cands.length; c++) {
        var targets = SHORTHAND[cands[c].prop];
        if (!targets || targets.indexOf(targetProp) < 0) continue;
        for (var v = 0; v < cands[c].vars.length; v++) {
          var t = terminalOf(cands[c].vars[v], {});
          if (!t) continue;
          var tNorm = normValue(kind, t.value);
          if (tNorm == null) continue;
          if (tNorm === cNorm || (kind === "font" && normFont(computed).indexOf(normFont(t.value).split(",")[0]) >= 0)) {
            if (!best || cands[c].score > best.score) best = { name: t.name, score: cands[c].score };
          }
        }
      }
      return best;
    }

    var DPROPS = ["background-color", "color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
      "border-radius", "row-gap", "column-gap", "padding-top", "padding-bottom", "padding-left", "padding-right",
      "font-size", "line-height", "font-family"];

    var allEls = document.querySelectorAll("body *");
    var stats = { elements: 0, marked: 0, markers: 0 };
    var candCache = new Map();

    for (var ei = 0; ei < allEls.length; ei++) {
      var el = allEls[ei];
      var cs = getComputedStyle(el);
      if (cs.display === "none" || el.hasAttribute("hidden")) continue;
      var rect = el.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0 && cs.display !== "contents") continue;
      stats.elements++;

      if (!candCache.has(el)) candCache.set(el, collectCandidates(el, sheets));
      var ownCands = candCache.get(el);
      var hits = {};

      for (var d = 0; d < DPROPS.length; d++) {
        var prop = DPROPS[d];
        var kind = propKind(prop);
        if (!kind) continue;
        var computed = cs.getPropertyValue(prop);
        if (computed == null || computed === "") continue;
        if (kind === "stroke") {
          var side = prop.split("-")[1];
          if (parseFloat(cs.getPropertyValue("border-" + side + "-width")) <= 0) continue;
        }
        var cNorm = normValue(kind, computed);
        if (cNorm == null || cNorm === "") continue;
        if ((kind === "color" || kind === "stroke") && cNorm === "0,0,0,0") continue;
        if (kind !== "fill" && kind !== "font" && kind !== "color" && kind !== "stroke" && cNorm === "0") continue;
        var best = findToken(ownCands, kind, prop, cNorm, computed);
        if (!best && INHERITED[kind]) {
          var anc = el.parentElement, depth = 0;
          while (anc && anc.nodeType === 1 && depth < 12) {
            if (!candCache.has(anc)) candCache.set(anc, collectCandidates(anc, sheets));
            var ab = findToken(candCache.get(anc), kind, prop, cNorm, computed);
            if (ab) { best = ab; break; }
            anc = anc.parentElement; depth++;
          }
        }
        if (best && !hits[kind]) hits[kind] = best.name;
      }

      // 检查元素是否有直接文本内容（非空白 text node 子节点）
      var hasDirectText = false;
      for (var cn = el.firstChild; cn; cn = cn.nextSibling) {
        if (cn.nodeType === 3 && cn.textContent.trim()) { hasDirectText = true; break; }
      }
      // 文字类属性（color/fs/lh/font）只贴在有直接文本的元素上
      // 容器元素（无直接文本）不贴——避免 C2D 转成 FRAME 后绑定失败
      var TEXT_KINDS = { color: 1, fs: 1, lh: 1, font: 1 };

      var classes = [];
      for (var hk in hits) {
        if (TEXT_KINDS[hk] && !hasDirectText) continue; // 跳过容器上的文字属性标记
        classes.push("px-" + hk + "_" + hits[hk].replace(/^--/, ""));
        stats.markers++;
      }
      if (classes.length) {
        el.classList.add.apply(el.classList, classes);
        stats.marked++;
      }
    }

    // ---------- 组件/图标实例标记 ----------
    // 在 token 贴码之后执行, 与 token 标记互不干扰(两者走同一个类名通道)
    var compStats = markComponents();

    console.log("[token-marker] 完成:", JSON.stringify(stats),
      "组件标记:", JSON.stringify({ components: compStats.components, icons: compStats.icons, attrs: compStats.attrs }),
      "逻辑名清单:", JSON.stringify(compStats.logicalNames),
      "图标别名清单:", JSON.stringify(compStats.iconAliases));
  }

  // ---------- 启动 ----------
  function ready() {
    // 等一下让 JS 渲染稳定
    setTimeout(function () {
      try { injectMarkers(); } catch (e) { console.error("[token-marker] 出错:", e); }
    }, 600);
  }
  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready);
})();
