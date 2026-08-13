const state = { data: null, dataView: "notify", tableSort: {} };
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "notify_sheet_urls";
const ALL = "__ALL__";
const NONE = "__NONE__";

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = "none"; }, 4500);
}
function setStatus(text, cls) {
  const el = $("statusPill");
  el.className = "pill " + (cls || "");
  el.textContent = text;
}
function asRate(v) {
  if (v === undefined || v === null || v === "") return 0;
  const s = String(v).trim().replace(/,/g, "");
  if (!s) return 0;
  if (s.endsWith("%")) {
    const n = Number(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function tableSortState(scope) {
  return state.tableSort[scope] || { key: null, dir: "desc" };
}

function toggleTableSort(scope, key) {
  const cur = tableSortState(scope);
  if (cur.key === key) {
    state.tableSort[scope] = { key, dir: cur.dir === "desc" ? "asc" : "desc" };
  } else {
    state.tableSort[scope] = { key, dir: "desc" };
  }
}

function applyTableSort(list, scope, getters) {
  const { key, dir } = tableSortState(scope);
  const get = key && getters[key];
  if (!get) return list || [];
  const mul = dir === "asc" ? 1 : -1;
  return [...(list || [])].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (typeof va === "string" || typeof vb === "string") {
      return mul * String(va ?? "").localeCompare(String(vb ?? ""), "zh");
    }
    return mul * ((Number(va) || 0) - (Number(vb) || 0));
  });
}

function sortableTh(scope, key, label) {
  const cur = tableSortState(scope);
  const mark = cur.key === key ? (cur.dir === "asc" ? " ▲" : " ▼") : "";
  const cls = cur.key === key ? "sortable is-sorted" : "sortable";
  return `<th class="${cls}" data-sort-scope="${scope}" data-sort-key="${key}" title="点击排序">${label}${mark}</th>`;
}

function adAvgShow(r) {
  if (r["人均展示成功数"] !== undefined && r["人均展示成功数"] !== null && r["人均展示成功数"] !== "") {
    return Number(r["人均展示成功数"]) || 0;
  }
  return Number(r["人均展示次数"]) || 0;
}

function isAllToken(v) {
  const s = String(v == null ? "" : v).trim();
  return !s || s === ALL || s === "全部" || s === "跟随全局" || s.toLowerCase() === "all";
}

function isDay0Label(day) {
  const s = String(day || "").trim();
  return /^day\s*0$/i.test(s) || s === "0" || s === "D0";
}

function fillSelect(el, values, keep) {
  if (!el) return;
  const prev = keep ? el.value : "";
  el.innerHTML = "";
  const seen = new Set();
  values.forEach((item) => {
    let value;
    let label;
    if (item && typeof item === "object") {
      value = String(item.value);
      label = String(item.label);
    } else {
      value = String(item);
      label = String(item);
    }
    const dedupeKey = `${value}||${label}`;
    if (seen.has(dedupeKey)) return;
    if (isAllToken(label) || isAllToken(value)) {
      if (seen.has("__LABEL_ALL__")) return;
      seen.add("__LABEL_ALL__");
      value = ALL;
      label = "全部";
    }
    seen.add(dedupeKey);
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    el.appendChild(opt);
  });
  const ok = [...el.options].some((o) => o.value === prev);
  if (prev && ok) el.value = prev;
}

/** 勾选多选状态：id -> Set of values；含 ALL 表示「全部」 */
const multiState = {
  project: new Set([ALL]),
  version: new Set([ALL]),
  country: new Set([ALL]),
  brand: new Set([ALL]),
  period: new Set([ALL]),
  sceneBars: new Set([ALL]),
  copyBars: new Set([ALL]),
  sceneTable: new Set([ALL]),
  copyTable: new Set([ALL])
};

const MS_IDS = ["project", "version", "country", "brand", "period", "sceneBars", "copyBars", "sceneTable", "copyTable"];

function msToggleId(id) { return id + "Toggle"; }
function msPanelId(id) { return id + "Panel"; }

function formatMsSummary(id) {
  const set = multiState[id] || new Set([ALL]);
  const vals = [...set];
  if (!vals.length || vals.some(isAllToken)) return "全部";
  if (vals.length <= 2) return vals.join("、");
  return `${vals.slice(0, 2).join("、")}等${vals.length}项`;
}

function updateMsToggleLabel(id) {
  const btn = $(msToggleId(id));
  if (!btn) return;
  const text = formatMsSummary(id);
  btn.textContent = text;
  btn.title = [...(multiState[id] || [])].some(isAllToken)
    ? "全部"
    : [...(multiState[id] || [])].join("、");
}

function closeAllMsPanels(exceptId) {
  MS_IDS.forEach((id) => {
    if (exceptId && id === exceptId) return;
    const panel = $(msPanelId(id));
    const btn = $(msToggleId(id));
    if (panel) panel.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  });
}

function fillMultiSelect(id, values, keep) {
  const panel = $(msPanelId(id));
  const btn = $(msToggleId(id));
  if (!panel || !btn) return;

  const prev = keep ? new Set(multiState[id] || []) : new Set([ALL]);
  const opts = [];
  const seen = new Set();
  (values || []).forEach((item) => {
    let value;
    let label;
    if (item && typeof item === "object") {
      value = String(item.value);
      label = String(item.label);
    } else {
      value = String(item);
      label = String(item);
    }
    if (isAllToken(label) || isAllToken(value)) {
      if (seen.has("__LABEL_ALL__")) return;
      seen.add("__LABEL_ALL__");
      value = ALL;
      label = "全部";
    }
    if (seen.has(value)) return;
    seen.add(value);
    opts.push({ value, label });
  });
  if (!opts.some((o) => o.value === ALL)) {
    opts.unshift({ value: ALL, label: "全部" });
  }

  // 恢复选中：若旧值都不在新选项里，回退全部
  const validPrev = [...prev].filter((v) => opts.some((o) => o.value === v));
  if (!validPrev.length) {
    multiState[id] = new Set([ALL]);
  } else if (validPrev.some(isAllToken)) {
    multiState[id] = new Set([ALL]);
  } else {
    multiState[id] = new Set(validPrev);
  }

  panel.innerHTML = opts.map((o) => {
    const checked = multiState[id].has(o.value) ? "checked" : "";
    const safeVal = String(o.value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    const safeLabel = String(o.label)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<label class="ms-option"><input type="checkbox" data-ms-id="${id}" value="${safeVal}" ${checked} /><span>${safeLabel}</span></label>`;
  }).join("");

  panel.querySelectorAll("input[type=checkbox]").forEach((input) => {
    input.addEventListener("change", () => onMsCheckboxChange(id, input));
  });
  updateMsToggleLabel(id);
}

function onMsCheckboxChange(id, input) {
  const panel = $(msPanelId(id));
  const val = input.value;

  if (isAllToken(val)) {
    if (input.checked) {
      multiState[id] = new Set([ALL]);
      panel.querySelectorAll("input[type=checkbox]").forEach((el) => {
        el.checked = isAllToken(el.value);
      });
    } else {
      // 不允许空选，至少保留全部
      input.checked = true;
      multiState[id] = new Set([ALL]);
    }
  } else if (input.checked) {
    const next = new Set([...(multiState[id] || [])].filter((v) => !isAllToken(v)));
    next.add(val);
    multiState[id] = next;
    const allBox = panel.querySelector(`input[value="${ALL}"]`);
    if (allBox) allBox.checked = false;
  } else {
    const next = new Set([...(multiState[id] || [])].filter((v) => v !== val && !isAllToken(v)));
    if (!next.size) {
      multiState[id] = new Set([ALL]);
      const allBox = panel.querySelector(`input[value="${ALL}"]`);
      if (allBox) allBox.checked = true;
    } else {
      multiState[id] = next;
    }
  }
  updateMsToggleLabel(id);
  syncBaselineOptions();
  if (id === "sceneBars" || id === "copyBars") {
    syncSceneLocalFilters("bars");
    renderScenarioBars();
    return;
  }
  if (id === "sceneTable" || id === "copyTable") {
    syncSceneLocalFilters("table");
    renderScenarioTable();
    return;
  }
  syncSceneLocalFilters();
  renderAll();
}

function readMulti(id) {
  const set = multiState[id];
  if (!set || !set.size) return ["全部"];
  const vals = [...set];
  if (vals.some(isAllToken)) return ["全部"];
  return vals;
}

function bindMultiSelectUI() {
  MS_IDS.forEach((id) => {
    const btn = $(msToggleId(id));
    const panel = $(msPanelId(id));
    if (!btn || !panel) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = panel.hidden;
      closeAllMsPanels(id);
      panel.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest(".ms-field")) return;
    closeAllMsPanels();
  });
}

function formatMultiLabel(arr) {
  if (!arr || !arr.length || arr.some(isAllToken) || arr.includes("全部")) return "全部";
  return arr.join("、");
}

function compareByValue() {
  return ($("compareBy") && $("compareBy").value) || "project";
}

function baselineValue() {
  const v = ($("baseline") && $("baseline").value) || NONE;
  if (!v || v === NONE || v === "无" || v === "无对比") return NONE;
  return v;
}

/** 是否启用基准对比；「无对比」时走汇总展示 */
function wantsBaselineCompare() {
  return baselineValue() !== NONE;
}

function shouldCompareSeries() {
  return wantsBaselineCompare() && seriesLabels(compareByValue()).length > 1;
}

function globalFilters() {
  return {
    projects: readMulti("project"),
    versions: readMulti("version"),
    countries: readMulti("country"),
    brands: readMulti("brand"),
    periods: readMulti("period").filter((p) => !isAllToken(p))
  };
}

/** 兼容旧单值接口：多选时展示用标签 */
function globalFiltersDisplay() {
  const g = globalFilters();
  return {
    project: formatMultiLabel(g.projects),
    version: formatMultiLabel(g.versions),
    country: formatMultiLabel(g.countries),
    brand: formatMultiLabel(g.brands),
    period: g.periods.length ? formatMultiLabel(g.periods) : "—"
  };
}

function filtersFor(_scope) {
  const g = globalFilters();
  const mode = compareByValue();
  const out = { ...g };
  if (mode === "version") out.versions = ["全部"];
  if (mode === "period") out.periods = [];
  if (mode === "project") out.projects = ["全部"];
  return out;
}

function matchDimMulti(rowVal, selectedArr, emptyAsAll) {
  if (!selectedArr || !selectedArr.length || selectedArr.some(isAllToken) || selectedArr.includes("全部")) {
    return true;
  }
  const v = rowVal === undefined || rowVal === null || String(rowVal).trim() === ""
    ? (emptyAsAll ? "全部" : "")
    : String(rowVal).trim();
  return selectedArr.includes(v);
}

function passGlobal(r, g) {
  const projects = g.projects || (g.project ? [g.project] : ["全部"]);
  const versions = g.versions || (g.version ? [g.version] : ["全部"]);
  const countries = g.countries || (g.country ? [g.country] : ["全部"]);
  const brands = g.brands || (g.brand ? [g.brand] : ["全部"]);
  const periods = g.periods || (g.period ? [g.period] : []);
  return matchDimMulti(r["项目代号"], projects, false)
    && matchDimMulti(r["版本"] || "全部", versions, true)
    && matchDimMulti(r["国家"], countries, false)
    && matchDimMulti(r["设备品牌"] || "全部", brands, true)
    && (!periods.length || periods.includes(String(r["日期"] || "")));
}

function passCohort(r, cohortDay) {
  if (!cohortDay || cohortDay === "全部" || cohortDay === ALL) return true;
  return String(r["队列天数"] || "") === cohortDay;
}
function passViewType(r, viewType) {
  if (!viewType || viewType === "全部" || viewType === ALL) return true;
  return String(r["查看类型"] || "") === viewType;
}

function passSceneName(r, names) {
  return matchDimMulti(r["通知场景"], names, false);
}

function passSceneCopy(r, copies) {
  if (!copies || !copies.length || copies.some(isAllToken) || copies.includes("全部")) return true;
  const v = String(r["文案"] || "").trim();
  return copies.includes(v);
}

function sceneFilterScope(which) {
  if (which === "bars") {
    return {
      scenes: readMulti("sceneBars"),
      copies: readMulti("copyBars")
    };
  }
  return {
    scenes: readMulti("sceneTable"),
    copies: readMulti("copyTable")
  };
}

/** 文案分析 + 通知场景=全部 + 已筛具体文案 → 按文案跨场景汇总
 *  通知场景与文案均为全部时，仍按「场景×文案」明细展示对应通知场景
 */
function shouldAggregateByCopy(which) {
  const viewId = which === "bars" ? "viewTypeScenarioBars" : "viewTypeScenarioTable";
  const viewType = ($(viewId) && $(viewId).value) || "";
  if (!isCopyAnalysisView(viewType)) return false;
  const local = sceneFilterScope(which || "table");
  const sceneAll = !local.scenes || local.scenes.some(isAllToken) || local.scenes.includes("全部");
  if (!sceneAll) return false;
  const copyAll = !local.copies || local.copies.some(isAllToken) || local.copies.includes("全部");
  // 文案也是全部：不汇总，展示各文案对应的通知场景
  return !copyAll;
}

function scopeToSceneWhich(scope) {
  return String(scope || "").toLowerCase().includes("bar") ? "bars" : "table";
}

/** 选「全部」时优先用汇总行，但按项目分别处理，避免 A 有汇总、B 无汇总时把 B 整表滤掉 */
function preferSummaryRows(rows, g) {
  let out = rows || [];
  if (!out.length) return out;

  const countries = g.countries || (g.country ? [g.country] : ["全部"]);
  const brands = g.brands || (g.brand ? [g.brand] : ["全部"]);
  const versions = g.versions || (g.version ? [g.version] : ["全部"]);
  const countryAll = countries.some(isAllToken) || countries.includes("全部");
  const brandAll = brands.some(isAllToken) || brands.includes("全部");
  const versionAll = versions.some(isAllToken) || versions.includes("全部");

  const groupKey = (r) => String(r["项目代号"] || "") + "\u0001" + String(r["日期"] || "");
  const byGroup = {};
  out.forEach((r) => {
    const k = groupKey(r);
    if (!byGroup[k]) byGroup[k] = [];
    byGroup[k].push(r);
  });

  const preferDim = (list, getVal, wantAll) => {
    if (!wantAll) return list;
    const summary = list.filter((r) => getVal(r) === "全部");
    return summary.length ? summary : list;
  };

  out = Object.keys(byGroup).flatMap((k) => {
    let list = byGroup[k];
    list = preferDim(list, (r) => r["国家"] || "", countryAll);
    list = preferDim(list, (r) => r["设备品牌"] || "全部", brandAll);
    list = preferDim(list, (r) => r["版本"] || "全部", versionAll);
    return list;
  });
  return out;
}

function pickOverviewRow(rows, g) {
  if (!rows.length) return null;
  const countries = g.countries || ["全部"];
  const brands = g.brands || ["全部"];
  const versions = g.versions || ["全部"];
  const countryAll = countries.some(isAllToken) || countries.includes("全部");
  const brandAll = brands.some(isAllToken) || brands.includes("全部");
  const versionAll = versions.some(isAllToken) || versions.includes("全部");

  if (!countryAll && !brandAll && !versionAll) return rows[0];

  const exact = rows.find((r) =>
    (countryAll ? r["国家"] === "全部" : true)
    && (brandAll ? (r["设备品牌"] || "全部") === "全部" : true)
    && (versionAll ? (r["版本"] || "全部") === "全部" : true)
  );
  if (exact) return exact;

  const all = rows.find((r) =>
    r["国家"] === "全部"
    && (r["设备品牌"] || "全部") === "全部"
    && (r["版本"] || "全部") === "全部"
  );
  if (all) return all;

  const sumKeys = ["总活跃用户", "授权数", "发送通知用户数", "发通知总数", "点击用户数", "点击事件数"];
  const out = {
    ...rows[0],
    国家: countryAll ? "全部" : (rows[0]["国家"] || "全部"),
    设备品牌: brandAll ? "全部" : (rows[0]["设备品牌"] || "全部"),
    版本: versionAll ? "全部" : (rows[0]["版本"] || "全部")
  };
  sumKeys.forEach((k) => { out[k] = 0; });
  rows.forEach((r) => sumKeys.forEach((k) => { out[k] += Number(r[k]) || 0; }));
  const base = out["总活跃用户"] || 0;
  const auth = out["授权数"] || 0;
  const showUsers = out["发送通知用户数"] || 0;
  const showCount = out["发通知总数"] || 0;
  const clickUsers = out["点击用户数"] || 0;
  const clickCount = out["点击事件数"] || 0;
  out["授权率"] = base ? auth / base : 0;
  out["通知渗透率"] = base ? showUsers / base : 0;
  out["人均通知数"] = base ? showCount / base : 0;
  out["点击率-用户"] = showUsers ? clickUsers / showUsers : 0;
  out["点击率-事件"] = showCount ? clickCount / showCount : 0;
  out["人均点击"] = clickUsers ? clickCount / clickUsers : 0;
  const rateKeys = [];
  const uninstallKey = Object.keys(rows[0]).find((k) => /卸载率/.test(k));
  if (uninstallKey) rateKeys.push(uninstallKey);
  if (Object.prototype.hasOwnProperty.call(rows[0], "留存率")) rateKeys.push("留存率");
  rateKeys.forEach((rk) => {
    let est = 0;
    let baseSum = 0;
    rows.forEach((r) => {
      const b = Number(r["总活跃用户"]) || 0;
      const rate = asRate(r[rk]);
      est += b * rate;
      baseSum += b;
    });
    out[rk] = baseSum ? est / baseSum : 0;
  });
  return out;
}

function dimContextHtml(gDisp) {
  const mode = compareByValue();
  const parts = [
    `国家 ${gDisp.country || "全部"}`,
    `品牌 ${gDisp.brand || "全部"}`
  ];
  if (mode !== "version") parts.push(`版本 ${gDisp.version || "全部"}`);
  if (mode !== "period") parts.push(`时间周期 ${gDisp.period || "—"}`);
  if (gDisp.project && gDisp.project !== "全部" && mode !== "project") {
    parts.unshift(`项目 ${gDisp.project}`);
  }
  return `当前维度：${parts.join(" · ")}`;
}

function setDimContext(id, gDisp) {
  const el = $(id);
  if (el) el.textContent = dimContextHtml(gDisp);
}

function seriesDimLine(col) {
  const mode = compareByValue();
  const gDisp = globalFiltersDisplay();
  const r = col.row || {};
  const parts = [
    `国家 ${gDisp.country || "全部"}`,
    `品牌 ${gDisp.brand || "全部"}`
  ];
  // 对比维度已在行首标签展示，这里不再重复
  if (mode !== "version") {
    parts.push(`版本 ${gDisp.version !== "全部" ? gDisp.version : (r["版本"] || "全部")}`);
  }
  if (mode !== "period") {
    parts.push(`时间周期 ${r["日期"] || gDisp.period || "—"}`);
  }
  return parts.join(" · ");
}

function seriesLabels(mode) {
  const meta = (state.data && state.data.meta) || {};
  const gUI = globalFilters();
  if (mode === "version") {
    let list = (meta.versions || []).slice();
    if (!list.length) {
      list = [...new Set((state.data.overview || [])
        .map((r) => String(r["版本"] || "").trim())
        .filter((v) => v && !isAllToken(v)))];
    }
    if (!gUI.versions.some(isAllToken) && !gUI.versions.includes("全部")) {
      list = list.filter((v) => gUI.versions.includes(v));
    }
    if (!list.length) list = ["全部"];
    return list.sort((a, b) => String(a).localeCompare(String(b), "zh"));
  }
  if (mode === "period") {
    let list = (meta.periods || []).slice();
    if (gUI.periods.length) list = list.filter((v) => gUI.periods.includes(v));
    if (!list.length) list = gUI.periods.length ? gUI.periods.slice() : ["—"];
    return list;
  }
  let projects = meta.projects || [];
  if (!projects.length) {
    projects = [...new Set((state.data.overview || []).map((r) => r["项目代号"]).filter(Boolean))];
  }
  if (!gUI.projects.some(isAllToken) && !gUI.projects.includes("全部")) {
    projects = projects.filter((p) => gUI.projects.includes(p));
  }
  return projects.slice();
}

/** 多选且≥2 项时才拆列；「全部」不拆 */
function concreteMultiSelected(arr) {
  if (!arr || !arr.length || arr.some(isAllToken) || arr.includes("全部")) return null;
  if (arr.length < 2) return null;
  return arr.slice();
}

/** KPI 二次拆列维：国家 / 版本 / 设备品牌（版本对比时不再拆版本） */
function secondaryExpandDims(mode) {
  const ui = globalFilters();
  const dims = [];
  const countries = concreteMultiSelected(ui.countries);
  if (countries) dims.push({ dim: "country", values: countries });
  if (mode !== "version") {
    const versions = concreteMultiSelected(ui.versions);
    if (versions) dims.push({ dim: "version", values: versions });
  }
  const brands = concreteMultiSelected(ui.brands);
  if (brands) dims.push({ dim: "brand", values: brands });
  return dims;
}

function cartesianCombos(dims) {
  if (!dims.length) return [{}];
  return dims.reduce((acc, d) => {
    const next = [];
    acc.forEach((prev) => {
      d.values.forEach((v) => next.push({ ...prev, [d.dim]: v }));
    });
    return next;
  }, [{}]);
}

function makeExpandedColKey(primary, primaryCount, expands, combo) {
  const parts = [];
  const hasExpand = expands.length > 0;
  if (primaryCount > 1 || !hasExpand) parts.push(primary);
  expands.forEach((d) => {
    if (combo[d.dim] != null) parts.push(combo[d.dim]);
  });
  return parts.join(" · ");
}

function plannedSeriesKeys(options) {
  const mode = compareByValue();
  const primary = seriesLabels(mode);
  const expands = options && options.expandSecondary ? secondaryExpandDims(mode) : [];
  const combos = cartesianCombos(expands);
  const keys = [];
  primary.forEach((p) => {
    combos.forEach((combo) => {
      keys.push(makeExpandedColKey(p, primary.length, expands, combo));
    });
  });
  return keys;
}

function expandedDimsActive(mode) {
  const expands = secondaryExpandDims(mode);
  return {
    country: expands.some((d) => d.dim === "country"),
    version: expands.some((d) => d.dim === "version") || mode === "version",
    brand: expands.some((d) => d.dim === "brand"),
    period: mode === "period"
  };
}

/**
 * @param {string} cohortDay
 * @param {string} scope
 * @param {{ expandSecondary?: boolean }} [options] expandSecondary=true 时多选国家/版本/设备分列（总览 KPI）
 */
function overviewBySeries(cohortDay, scope, options) {
  const mode = compareByValue();
  const gBase = filtersFor(scope || "overview");
  const labels = seriesLabels(mode);
  const ui = globalFilters();
  const expandSecondary = !!(options && options.expandSecondary);
  const expands = expandSecondary ? secondaryExpandDims(mode) : [];
  const combos = cartesianCombos(expands);

  const out = [];
  labels.forEach((label) => {
    combos.forEach((combo) => {
      const gOne = {
        projects: gBase.projects.slice(),
        versions: gBase.versions.slice(),
        countries: gBase.countries.slice(),
        brands: gBase.brands.slice(),
        periods: (gBase.periods || []).slice()
      };
      if (mode === "project") gOne.projects = [label];
      else if (mode === "version") gOne.versions = [label];
      else if (mode === "period") gOne.periods = [label];

      if (mode !== "project" && !ui.projects.some(isAllToken)) gOne.projects = ui.projects.slice();
      if (mode !== "version" && !ui.versions.some(isAllToken) && !combo.version) {
        gOne.versions = ui.versions.slice();
      }
      if (mode !== "period" && ui.periods.length) gOne.periods = ui.periods.slice();

      if (combo.country) gOne.countries = [combo.country];
      if (combo.version) gOne.versions = [combo.version];
      if (combo.brand) gOne.brands = [combo.brand];

      const rows = preferSummaryRows(
        (state.data.overview || []).filter((r) => passGlobal(r, gOne) && passCohort(r, cohortDay)),
        gOne
      );
      const row = pickOverviewRow(rows, gOne);
      if (!row) return;
      const key = makeExpandedColKey(label, labels.length, expands, combo);
      out.push({
        key,
        project: mode === "project" ? label : formatMultiLabel(gOne.projects),
        row,
        g: gOne,
        expand: combo
      });
    });
  });
  return out;
}

function overviewByProject(cohortDay, scope) {
  return overviewBySeries(cohortDay, scope).map((c) => ({
    project: c.key,
    row: c.row,
    g: c.g
  }));
}

function kpiMetricsFromOverview(row, retentionExtras) {
  const uninstallKey = Object.keys(row).find((k) => /卸载率/.test(k)) || "卸载率";
  const base = Number(row["总活跃用户"]) || 0;
  const showUsers = Number(row["发送通知用户数"]) || 0;
  const showCount = Number(row["发通知总数"]) || 0;
  const penetration = base ? showUsers / base : 0;
  const avgNotify = base ? showCount / base : 0;
  const head = [
    { key: "总活跃用户", kind: "abs", value: Number(row["总活跃用户"]) || 0 }
  ];
  const retains = (retentionExtras && retentionExtras.length)
    ? retentionExtras
    : [];
  return head.concat(retains).concat([
    { key: "授权数", kind: "abs", value: Number(row["授权数"]) || 0 },
    { key: "发送通知用户", kind: "abs", value: Number(row["发送通知用户数"]) || 0 },
    { key: "点击用户", kind: "abs", value: Number(row["点击用户数"]) || 0 },
    { key: "授权率", kind: "rate", value: asRate(row["授权率"]) },
    { key: "通知渗透率", kind: "rate", value: penetration },
    { key: "人均通知数", kind: "avg", value: avgNotify },
    { key: "点击率-用户", kind: "rate", value: asRate(row["点击率-用户"]) },
    { key: "点击率-事件", kind: "rate", value: asRate(row["点击率-事件"]) },
    { key: "人均点击", kind: "avg", value: Number(row["人均点击"]) || 0 },
    { key: uninstallKey, kind: "rate", value: asRate(row[uninstallKey]) }
  ]);
}

/** Day0 留存不在网站展示 */
function retentionMetricsForSeries(col, scope) {
  const g = { ...(col.g || filtersFor(scope || "overview")) };
  const days = ((state.data && state.data.meta && state.data.meta.cohortDays) || [])
    .filter((d) => !isDay0Label(d));
  if (!days.length) return [];
  return days.map((day) => {
    const rows = preferSummaryRows(
      (state.data.overview || []).filter((r) => passGlobal(r, g) && passCohort(r, day)),
      g
    );
    const row = pickOverviewRow(rows, g);
    return {
      key: `${day}留存`,
      kind: "rate",
      value: row ? asRate(row["留存率"]) : 0
    };
  });
}

function formatKpiValue(m) {
  if (m.kind === "abs") return num(m.value);
  if (m.kind === "rate") return pct(m.value);
  return Number(m.value).toFixed(2);
}

function formatDelta(m, baseM) {
  if (!baseM) return "";
  const a = Number(m.value) || 0;
  const b = Number(baseM.value) || 0;
  let text = "";
  if (m.kind === "rate") {
    // 比率差：百分点差值，展示为 %（如 53.8%−44.0%=+9.8%）
    const d = (a - b) * 100;
    text = `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
  } else if (m.kind === "avg") {
    const d = a - b;
    text = `${d > 0 ? "+" : ""}${d.toFixed(2)}`;
  } else {
    if (!b) return "—";
    const d = ((a - b) / b) * 100;
    text = `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
  }
  const cls = text.startsWith("+") ? "delta up" : text.startsWith("-") ? "delta down" : "delta flat";
  return `<span class="${cls}">${text}</span>`;
}

function scenariosForScope(cohortDay, viewType, which) {
  if (!state.data) return [];
  const g = globalFilters();
  const local = sceneFilterScope(which || "table");
  return preferSummaryRows(
    state.data.scenario.filter((r) =>
      passGlobal(r, g)
      && passCohort(r, cohortDay)
      && passViewType(r, viewType)
      && passSceneName(r, local.scenes)
      && passSceneCopy(r, local.copies)
    ),
    g
  );
}

function buildScenarioList(rows, splitBySeries, cohortDay, scope) {
  const mode = compareByValue();
  const which = scopeToSceneWhich(scope);
  const byCopy = shouldAggregateByCopy(which);
  const agg = {};
  rows.forEach((r) => {
    const viewType = r["查看类型"] || "";
    const copy = String(r["文案"] || "").trim();
    let series = r["项目代号"] || "";
    if (mode === "version") series = r["版本"] || "全部";
    if (mode === "period") series = r["日期"] || "";

    let name;
    let k;
    if (byCopy) {
      if (!copy) return;
      name = "全部";
      k = (splitBySeries ? series + "||" : "") + viewType + "||COPY||" + copy;
    } else {
      name = r["通知场景"] || "";
      if (!name) return;
      const useCopyKey = isCopyAnalysisView(viewType) && copy;
      k = (splitBySeries ? series + "||" : "") + viewType + "||" + name + (useCopyKey ? "||" + copy : "");
    }

    if (!agg[k]) {
      agg[k] = {
        project: series,
        name,
        viewType,
        copy: isCopyAnalysisView(viewType) ? copy : "",
        aggregatedByCopy: byCopy,
        showUsers: 0,
        showCount: 0,
        clickUsers: 0,
        clickCount: 0
      };
    }
    const t = agg[k];
    if (!t.copy && copy) t.copy = copy;
    t.showUsers += Number(r["通知用户数"]) || 0;
    t.showCount += Number(r["通知事件数"]) || 0;
    t.clickUsers += Number(r["点击用户数"]) || 0;
    t.clickCount += Number(r["点击事件数"]) || 0;
  });
  const baseBySeries = {};
  const overviewCols = overviewByProject(
    cohortDay || ($("cohortDayScenarioTable") && $("cohortDayScenarioTable").value) || "",
    scope || "scenarioTable"
  );
  overviewCols.forEach((c) => {
    baseBySeries[c.project] = Number(c.row["总活跃用户"]) || 0;
  });
  const baseFallback = overviewCols.length === 1 ? Number(overviewCols[0].row["总活跃用户"]) || 0 : 0;

  return Object.values(agg)
    .map((s) => {
      const base = baseBySeries[s.project] || baseFallback || 0;
      return {
        ...s,
        baseUsers: base,
        avgNotify: base > 0 ? s.showCount / base : 0,
        ctrUser: s.showUsers ? s.clickUsers / s.showUsers : 0,
        ctrEvent: s.showCount ? s.clickCount / s.showCount : 0,
        avgClick: s.clickUsers ? s.clickCount / s.clickUsers : 0
      };
    })
    .sort((a, b) => {
      const pc = String(a.project || "").localeCompare(String(b.project || ""), "zh");
      if (pc) return pc;
      return b.ctrUser - a.ctrUser;
    });
}

function buildScenarioMatrix(rows, cohortDay, scope, sortMetric) {
  const flat = buildScenarioList(rows, true, cohortDay, scope);
  const map = {};
  flat.forEach((s) => {
    const key = s.aggregatedByCopy
      ? ("copy||" + String(s.viewType || "").replace(/\s+/g, "").trim().toLowerCase() + "||" + String(s.copy || "").replace(/\s+/g, "").trim().toLowerCase())
      : (normSceneKey(s.viewType, s.name) + "||" + String(s.copy || "").replace(/\s+/g, "").trim().toLowerCase());
    if (!map[key]) {
      map[key] = {
        key,
        viewType: s.viewType || "",
        name: s.name,
        copy: s.copy || "",
        aggregatedByCopy: !!s.aggregatedByCopy,
        byProject: {}
      };
    }
    map[key].byProject[s.project || ""] = s;
    if (!map[key].copy && s.copy) map[key].copy = s.copy;
  });
  const projects = orderSeries(seriesLabels(compareByValue()));
  const baseline = baselineValue();
  const metricKey = sortMetric === "ctrEvent" ? "ctrEvent" : "ctrUser";
  const rowsOut = Object.values(map).sort((a, b) => {
    const base = baseline !== NONE ? baseline : projects[0];
    const ca = base && a.byProject[base] ? a.byProject[base][metricKey] : Math.max(0, ...projects.map((p) => (a.byProject[p] && a.byProject[p][metricKey]) || 0));
    const cb = base && b.byProject[base] ? b.byProject[base][metricKey] : Math.max(0, ...projects.map((p) => (b.byProject[p] && b.byProject[p][metricKey]) || 0));
    return cb - ca;
  });
  return { projects, rows: rowsOut, baseline };
}

function orderSeries(items) {
  const baseline = baselineValue();
  const list = [...items].sort((a, b) => String(a).localeCompare(String(b), "zh"));
  if (baseline === NONE) return list;
  return list.sort((a, b) => {
    if (a === baseline) return -1;
    if (b === baseline) return 1;
    return String(a).localeCompare(String(b), "zh");
  });
}

function emptyScenarioStats() {
  return { showUsers: 0, showCount: 0, clickUsers: 0, clickCount: 0, ctrUser: 0, ctrEvent: 0, avgNotify: 0, avgClick: 0, authUsers: 0 };
}

function scenarioMetricDefs() {
  return [
    { key: "通知用户数", kind: "abs", get: (s) => s.showUsers },
    { key: "通知事件数", kind: "abs", get: (s) => s.showCount },
    { key: "人均通知(通知事件数/day0 first_open)", kind: "avg", get: (s) => s.avgNotify },
    { key: "点击用户数", kind: "abs", get: (s) => s.clickUsers },
    { key: "点击事件数", kind: "abs", get: (s) => s.clickCount },
    { key: "点击率(用户)", kind: "rate", get: (s) => s.ctrUser },
    { key: "点击率(事件)", kind: "rate", get: (s) => s.ctrEvent },
    { key: "人均点击", kind: "avg", get: (s) => s.avgClick }
  ];
}

/** 场景明细：数值列 + 独立「对比」列 */
function renderScenarioCompareDetail(matrix, showCopy) {
  const { projects, rows, baseline } = matrix;
  if (!rows.length) return '<p class="muted">当前模块筛选下无场景明细</p>';
  const metricDefs = scenarioMetricDefs();
  const compareKeys = baseline !== NONE
    ? projects.filter((p) => p !== baseline)
    : projects.slice(1);
  const baseKey = baseline !== NONE ? baseline : projects[0];

  const headParts = showCopy
    ? [`<th>查看类型</th><th>通知场景</th><th>文案</th><th>指标</th>`]
    : [`<th>查看类型</th><th>通知场景</th><th>指标</th>`];
  if (baseKey) headParts.push(`<th class="num">${baseKey}${baseline !== NONE ? "（基准）" : ""}</th>`);
  compareKeys.forEach((p) => {
    headParts.push(`<th class="num">${p}</th>`);
    headParts.push(`<th class="num">对比</th>`);
  });

  const body = rows.map((row) => metricDefs.map((md, mi) => {
    const baseS = baseKey ? (row.byProject[baseKey] || emptyScenarioStats()) : null;
    const cells = [];
    if (baseKey) {
      const s = row.byProject[baseKey];
      cells.push(s
        ? `<td class="num">${formatKpiValue({ kind: md.kind, value: md.get(s) })}</td>`
        : `<td class="num muted">—</td>`);
    }
    compareKeys.forEach((p) => {
      const s = row.byProject[p];
      if (!s) {
        cells.push(`<td class="num muted">—</td><td class="num muted">—</td>`);
        return;
      }
      const m = { kind: md.kind, value: md.get(s) };
      cells.push(`<td class="num">${formatKpiValue(m)}</td>`);
      if (baseS && row.byProject[baseKey]) {
        cells.push(`<td class="num">${formatDelta(m, { kind: md.kind, value: md.get(baseS) })}</td>`);
      } else {
        cells.push(`<td class="num muted">—</td>`);
      }
    });
    const typeCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.viewType || "—"}</td>` : "";
    const nameCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.name}</td>` : "";
    const copyCell = showCopy && mi === 0
      ? `<td rowspan="${metricDefs.length}" class="copy-cell">${escapeHtml(row.copy || "—")}</td>`
      : "";
    return `<tr>${typeCell}${nameCell}${copyCell}<td>${md.key}</td>${cells.join("")}</tr>`;
  }).join("")).join("");

  return `<div class="table-wrap"><table class="compare-table scenario-detail-compare table-left"><thead><tr>${headParts.join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** 维度列：对比维度本身已在右侧分列，中间不再重复展示 */
function dimHeadersHtml(hide) {
  const h = hide || expandedDimsActive(compareByValue());
  const parts = [];
  if (!h.country) parts.push("<th>国家</th>");
  if (!h.brand) parts.push("<th>品牌</th>");
  if (!h.version) parts.push("<th>版本</th>");
  if (!h.period) parts.push("<th>时间周期</th>");
  return parts.join("");
}

function dimCellsHtml(row, gShow, hide) {
  const h = hide || expandedDimsActive(compareByValue());
  const country = (row && row["国家"]) || gShow.country || "全部";
  const brand = (row && (row["设备品牌"] || "全部")) || gShow.brand || "全部";
  const version = (row && (row["版本"] || "全部")) || gShow.version || "全部";
  const period = (row && row["日期"]) || gShow.period || "—";
  const parts = [];
  if (!h.country) parts.push(`<td>${country}</td>`);
  if (!h.brand) parts.push(`<td>${brand}</td>`);
  if (!h.version) parts.push(`<td>${version}</td>`);
  if (!h.period) parts.push(`<td>${period}</td>`);
  return parts.join("");
}

function aggregateOverviewCols(cols) {
  if (!cols || !cols.length) return null;
  if (cols.length === 1) {
    return { ...cols[0], key: cols[0].key === "汇总" ? "汇总" : cols[0].key };
  }
  const sumKeys = ["总活跃用户", "授权数", "发送通知用户数", "发通知总数", "点击用户数", "点击事件数"];
  const row = { ...(cols[0].row || {}) };
  sumKeys.forEach((k) => { row[k] = 0; });
  cols.forEach((c) => {
    const r = c.row || {};
    sumKeys.forEach((k) => { row[k] += Number(r[k]) || 0; });
  });
  const base = row["总活跃用户"] || 0;
  const auth = row["授权数"] || 0;
  const showUsers = row["发送通知用户数"] || 0;
  const showCount = row["发通知总数"] || 0;
  const clickUsers = row["点击用户数"] || 0;
  const clickCount = row["点击事件数"] || 0;
  row["授权率"] = base ? auth / base : 0;
  row["通知渗透率"] = base ? showUsers / base : 0;
  row["人均通知数"] = base ? showCount / base : 0;
  row["点击率-用户"] = showUsers ? clickUsers / showUsers : 0;
  row["点击率-事件"] = showCount ? clickCount / showCount : 0;
  row["人均点击"] = clickUsers ? clickCount / clickUsers : 0;

  const sample = cols[0].row || {};
  const rateKeys = [];
  const uninstallKey = Object.keys(sample).find((k) => /卸载率/.test(k));
  if (uninstallKey) rateKeys.push(uninstallKey);
  if (Object.prototype.hasOwnProperty.call(sample, "留存率")) rateKeys.push("留存率");
  rateKeys.forEach((rk) => {
    let est = 0;
    let baseSum = 0;
    cols.forEach((c) => {
      const r = c.row || {};
      const b = Number(r["总活跃用户"]) || 0;
      est += b * asRate(r[rk]);
      baseSum += b;
    });
    row[rk] = baseSum ? est / baseSum : 0;
  });

  // 合并各队列天留存：按 DayN 加权
  const gMerged = {
    projects: [],
    versions: [],
    countries: [],
    brands: [],
    periods: []
  };
  cols.forEach((c) => {
    const g = c.g || {};
    ["projects", "versions", "countries", "brands", "periods"].forEach((k) => {
      (g[k] || []).forEach((v) => {
        if (v && !gMerged[k].includes(v)) gMerged[k].push(v);
      });
    });
  });
  if (!gMerged.projects.length) gMerged.projects = ["全部"];
  if (!gMerged.versions.length) gMerged.versions = ["全部"];
  if (!gMerged.countries.length) gMerged.countries = ["全部"];
  if (!gMerged.brands.length) gMerged.brands = ["全部"];

  return {
    key: "汇总",
    project: "汇总",
    row,
    g: gMerged
  };
}

function renderKpi() {
  const day = $("cohortDayOverview").value;
  const gShow = globalFiltersDisplay();
  setDimContext("dimContextOverview", gShow);
  const compareOn = wantsBaselineCompare();
  const hideDims = expandedDimsActive(compareByValue());

  let cols = overviewBySeries(day, "overview", { expandSecondary: true });
  if (!cols.length) {
    $("stats").innerHTML = '<p class="muted">当前条件下暂无 KPI</p>';
    renderRateAvgBars([], []);
    return;
  }

  // 无对比：多列合并为「汇总」，不展示差值
  if (!compareOn && cols.length > 1) {
    const merged = aggregateOverviewCols(cols);
    cols = merged ? [merged] : cols.slice(0, 1);
  }

  let baseline = baselineValue();
  cols = orderSeries(cols.map((c) => c.key)).map((k) => cols.find((c) => c.key === k)).filter(Boolean);

  const metricSets = cols.map((c) =>
    kpiMetricsFromOverview(c.row, retentionMetricsForSeries(c, "overview"))
      .filter((m) => !/^Day0留存$/i.test(m.key))
  );

  // 仅在开启对比时校正/补齐基准；无对比保持 NONE
  if (compareOn) {
    if (cols.findIndex((c) => c.key === baseline) < 0) {
      baseline = cols.length >= 2 ? cols[0].key : NONE;
    }
  } else {
    baseline = NONE;
  }
  const baseIdx = compareOn ? cols.findIndex((c) => c.key === baseline) : -1;
  const baseMetrics = baseIdx >= 0 ? metricSets[baseIdx] : null;
  const compareCols = compareOn ? cols.filter((c) => c.key !== baseline) : [];
  const dimHead = dimHeadersHtml(hideDims);
  const dimSample = cols[0].row;
  const wideTip = cols.length > 12
    ? `<p class="muted tip">当前 KPI 已分 ${cols.length} 列，建议收窄国家/版本/设备多选。</p>`
    : "";

  if (!compareOn || cols.length === 1) {
    const colLabel = cols[0].key === "汇总" ? "汇总" : cols[0].key;
    $("stats").innerHTML = `${wideTip}
      <div class="table-wrap"><table class="compare-table">
        <thead><tr><th>指标</th>${dimHead}<th class="num">${colLabel}</th></tr></thead>
        <tbody>${metricSets[0].map((m) =>
          `<tr><td>${m.key}</td>${dimCellsHtml(dimSample, gShow, hideDims)}<td class="num">${formatKpiValue(m)}</td></tr>`
        ).join("")}</tbody>
      </table></div>`;
    renderRateAvgBars(cols, metricSets);
    return;
  }

  const headParts = [`<th>指标</th>${dimHead}`];
  if (baseIdx >= 0) {
    headParts.push(`<th class="num">${cols[baseIdx].key}（基准）</th>`);
  }
  compareCols.forEach((c) => {
    headParts.push(`<th class="num">${c.key}</th>`);
    headParts.push(`<th class="num">对比</th>`);
  });

  const body = metricSets[0].map((m0, i) => {
    const cells = [];
    if (baseIdx >= 0) {
      cells.push(`<td class="num">${formatKpiValue(metricSets[baseIdx][i])}</td>`);
    }
    compareCols.forEach((c) => {
      const ci = cols.findIndex((x) => x.key === c.key);
      const m = metricSets[ci][i];
      cells.push(`<td class="num">${formatKpiValue(m)}</td>`);
      if (baseMetrics) {
        cells.push(`<td class="num">${formatDelta(m, baseMetrics[i])}</td>`);
      } else {
        cells.push(`<td class="num muted">—</td>`);
      }
    });
    return `<tr><td>${m0.key}</td>${dimCellsHtml(dimSample, gShow, hideDims)}${cells.join("")}</tr>`;
  }).join("");

  $("stats").innerHTML = `${wideTip}<div class="table-wrap"><table class="compare-table"><thead><tr>${headParts.join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
  renderRateAvgBars(cols, metricSets);
}

function metricUnitLabel(m) {
  if (m.kind === "rate") return "(%)";
  return "";
}

function formatBarNumber(m) {
  if (m && m.missing) return "—";
  if (m.kind === "rate") {
    const n = Number(m.value);
    if (!Number.isFinite(n)) return "—";
    return (n * 100).toFixed(1);
  }
  if (m.kind === "avg") {
    const n = Number(m.value);
    if (!Number.isFinite(n)) return "—";
    return n.toFixed(2);
  }
  return formatKpiValue(m);
}

function barWidthPct(m, maxAbs) {
  const n = Math.abs(Number(m.value) || 0);
  if (m.kind === "rate") return Math.max(0, Math.min(100, n * 100));
  if (!maxAbs) return 0;
  return Math.max(0, Math.min(100, (n / maxAbs) * 100));
}

/** 对比项列出全部系列（含基准），方便切换 MG16/MG18 */
function syncFocusSelect(elId, cols) {
  const el = $(elId);
  if (!el || !cols.length) return;
  const list = cols.map((c) => c.key);
  const prev = el.value;
  fillSelect(el, list.map((k) => ({ value: k, label: k })), true);
  if (prev && list.includes(prev)) el.value = prev;
  else {
    const baseline = baselineValue();
    const prefer = list.find((k) => k !== baseline) || list[0];
    el.value = prefer;
  }
}

function pickComparePair(cols, metricSets, focusElId) {
  if (!cols.length) return null;
  const baseline = baselineValue();
  const compareOn = wantsBaselineCompare();
  let baseIdx = compareOn && baseline !== NONE ? cols.findIndex((c) => c.key === baseline) : -1;
  // 无对比：不自动选基准列，只展示单条汇总/当前列
  if (compareOn && baseIdx < 0 && cols.length >= 2) baseIdx = 0;

  syncFocusSelect(focusElId || "barFocus", cols);

  let focusKey = ($(focusElId || "barFocus") && $(focusElId || "barFocus").value) || "";
  let focusIdx = cols.findIndex((c) => c.key === focusKey);
  if (focusIdx < 0) {
    focusIdx = compareOn ? cols.findIndex((c, i) => i !== baseIdx) : 0;
  }
  if (focusIdx < 0) focusIdx = 0;

  let blueIdx = compareOn ? baseIdx : -1;
  if (compareOn && blueIdx === focusIdx) {
    blueIdx = cols.findIndex((c, i) => i !== focusIdx);
  }
  if (blueIdx < 0) blueIdx = -1;

  return {
    focus: { key: cols[focusIdx].key, metrics: metricSets[focusIdx], col: cols[focusIdx] },
    base: blueIdx >= 0
      ? { key: cols[blueIdx].key, metrics: metricSets[blueIdx], col: cols[blueIdx] }
      : null
  };
}

function renderTrackedBar(barClass, widthPct, label, isZero) {
  const w = isZero ? 0 : Math.max(0, Math.min(100, Number(widthPct) || 0));
  return `<div class="cmp-track">
    <div class="cmp-bar ${barClass}${isZero ? " is-zero" : ""}" style="width:${w}%"></div>
    <span class="cmp-bar-val">${label}</span>
  </div>`;
}

function renderCmpBarPair(fm, bm, tone) {
  const focusClass = tone === "event" ? "focus-event" : (tone === "user" ? "focus-user" : "focus");
  let maxAbs = 0;
  if (fm.kind === "avg") {
    maxAbs = Math.max(Math.abs(Number(fm.value) || 0), bm ? Math.abs(Number(bm.value) || 0) : 0, 0.0001);
  }
  // rate：分母固定 100，宽度=真实百分比；avg：相对本组最大值缩放
  const wFocus = fm.missing ? 0 : barWidthPct(fm, maxAbs);
  const focusZero = fm.missing || !(Number(fm.value) > 0);
  const focusW = focusZero ? 0 : (fm.kind === "rate" ? wFocus : Math.max(8, wFocus));
  const focusBar = renderTrackedBar(focusClass, focusW, formatBarNumber(fm), focusZero);
  let baseBar = "";
  if (bm) {
    const wBase = bm.missing ? 0 : barWidthPct(bm, maxAbs);
    const baseZero = bm.missing || !(Number(bm.value) > 0);
    const baseW = baseZero ? 0 : (bm.kind === "rate" ? wBase : Math.max(8, wBase));
    baseBar = renderTrackedBar("base", baseW, formatBarNumber(bm), baseZero);
  }
  const unit = metricUnitLabel(fm);
  let deltaHtml = "";
  if (bm) {
    deltaHtml = (fm.missing || bm.missing)
      ? `<div class="cmp-delta"><span class="delta flat">—</span></div>`
      : `<div class="cmp-delta">${formatDelta(fm, bm)}</div>`;
  }
  return `<div class="cmp-row">
    <div class="cmp-label">${fm.key}${unit ? ` <span class="unit">${unit}</span>` : ""}${deltaHtml}</div>
    <div class="cmp-pair">${focusBar}${baseBar}</div>
  </div>`;
}

function renderRateAvgBars(cols, metricSets) {
  const host = $("rateAvgBars");
  const legend = $("rateAvgLegend");
  const dimEl = $("dimContextRateBars");
  if (!host) return;

  if (!cols || !cols.length) {
    if (legend) legend.innerHTML = "";
    if (dimEl) dimEl.textContent = "";
    host.innerHTML = '<p class="muted cmp-empty">暂无数据</p>';
    return;
  }

  if (!metricSets || !metricSets.length) {
    metricSets = cols.map((c) =>
      kpiMetricsFromOverview(c.row, retentionMetricsForSeries(c, "overview"))
        .filter((m) => !/^Day0留存$/i.test(m.key))
    );
  }

  const pair = pickComparePair(cols, metricSets, "barFocus");
  if (!pair) {
    host.innerHTML = '<p class="muted cmp-empty">暂无数据</p>';
    return;
  }

  if (dimEl) {
    const lines = [
      `<div><strong class="dim-tag focus">${pair.focus.key}</strong> ${seriesDimLine(pair.focus.col)}</div>`
    ];
    if (pair.base) {
      lines.push(`<div><strong class="dim-tag base">${pair.base.key}</strong> ${seriesDimLine(pair.base.col)}</div>`);
    }
    dimEl.innerHTML = lines.join("");
  }

  const rateAvg = pair.focus.metrics
    .map((m, i) => ({ focus: m, base: pair.base ? pair.base.metrics[i] : null }))
    .filter((x) => (x.focus.kind === "rate" || x.focus.kind === "avg") && !/^Day0留存$/i.test(x.focus.key));

  if (!rateAvg.length) {
    if (legend) legend.innerHTML = "";
    host.innerHTML = '<p class="muted cmp-empty">当前无比率/人均指标</p>';
    return;
  }

  if (legend) {
    if (pair.base) {
      legend.innerHTML = `
        <span class="cmp-legend-item"><span class="cmp-swatch focus"></span>${pair.focus.key}</span>
        <span class="cmp-legend-item"><span class="cmp-swatch base"></span>${pair.base.key}（基准侧）</span>`;
    } else {
      legend.innerHTML = `<span class="cmp-legend-item"><span class="cmp-swatch focus"></span>${pair.focus.key}</span>`;
    }
  }

  host.innerHTML = rateAvg.map(({ focus: fm, base: bm }) => renderCmpBarPair(fm, bm)).join("");
}

function isCopyAnalysisView(viewType) {
  const s = String(viewType || "").replace(/\s+/g, "").trim();
  return s === "文案分析" || s.includes("文案");
}

function sceneBarLabel(s) {
  if (s.aggregatedByCopy && s.copy) return s.copy;
  if (isCopyAnalysisView(s.viewType) && s.copy) {
    return `${s.name} · ${s.copy}`;
  }
  return [s.viewType, s.name].filter(Boolean).join(" · ");
}

function renderScenarioBars() {
  const day = $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars").value;
  const rows = scenariosForScope(day, viewType, "bars");
  renderOneScenarioCtr({
    metric: "ctrUser",
    tone: "user",
    day,
    rows,
    hostId: "scenarioBars",
    legendId: "sceneCtrLegend",
    dimId: "dimContextBars",
    syncFocus: true
  });
  renderOneScenarioCtr({
    metric: "ctrEvent",
    tone: "event",
    day,
    rows,
    hostId: "scenarioBarsEvent",
    legendId: "sceneCtrLegendEvent",
    dimId: "dimContextBarsEvent",
    syncFocus: false
  });
}

function renderOneScenarioCtr({ metric, tone, day, rows, hostId, legendId, dimId, syncFocus }) {
  const host = $(hostId);
  const legend = $(legendId);
  const dimEl = $(dimId);
  if (!host) return;
  const barTone = tone === "event" ? "event" : "user";
  const swatchClass = barTone === "event" ? "focus-event" : "focus-user";

  const getRate = (s) => (s ? (Number(s[metric]) || 0) : 0);

  if (!shouldCompareSeries()) {
    const list = buildScenarioList(rows, false, day, "scenarioBars")
      .slice()
      .sort((a, b) => getRate(b) - getRate(a));
    if (syncFocus) syncFocusSelect("sceneBarFocus", overviewBySeries(day, "overview"));
    if (legend) legend.innerHTML = "";
    if (dimEl) dimEl.textContent = dimContextHtml(globalFiltersDisplay());
    host.innerHTML = list.length
      ? list.map((s) => {
          const rate = getRate(s);
          const pctVal = Math.max(0, Math.min(100, rate * 100));
          const zero = !(pctVal > 0);
          const name = sceneBarLabel(s);
          return `<div class="cmp-row">
            <div class="cmp-label" title="${name.replace(/"/g, "&quot;")}">${name}</div>
            <div class="cmp-pair">
              ${renderTrackedBar(`focus-${barTone}`, pctVal, pctVal.toFixed(1), zero)}
            </div>
          </div>`;
        }).join("")
      : '<p class="muted cmp-empty">当前筛选下无场景点击率</p>';
    return;
  }

  const matrix = buildScenarioMatrix(rows, day, "scenarioBars", metric);
  const cols = matrix.projects.map((k) => ({ key: k }));
  if (syncFocus) syncFocusSelect("sceneBarFocus", cols);

  const baseline = baselineValue();
  let focusKey = ($("sceneBarFocus") && $("sceneBarFocus").value) || "";
  if (!focusKey || !matrix.projects.includes(focusKey)) {
    focusKey = matrix.projects.find((p) => p !== baseline) || matrix.projects[0];
    if (syncFocus && $("sceneBarFocus")) $("sceneBarFocus").value = focusKey;
  }
  let baseKey = baseline !== NONE ? baseline : matrix.projects.find((p) => p !== focusKey);
  if (baseKey === focusKey) {
    baseKey = matrix.projects.find((p) => p !== focusKey);
  }

  const overviewCols = overviewBySeries(day, "overview");
  const focusCol = overviewCols.find((c) => c.key === focusKey);
  const baseCol = overviewCols.find((c) => c.key === baseKey);
  if (dimEl) {
    const lines = [];
    if (focusCol) lines.push(`<div><strong class="dim-tag focus">${focusKey}</strong> ${seriesDimLine(focusCol)}</div>`);
    else lines.push(`<div><strong class="dim-tag focus">${focusKey}</strong></div>`);
    if (baseKey && baseCol) lines.push(`<div><strong class="dim-tag base">${baseKey}</strong> ${seriesDimLine(baseCol)}</div>`);
    else if (baseKey) lines.push(`<div><strong class="dim-tag base">${baseKey}</strong></div>`);
    dimEl.innerHTML = lines.join("") || dimContextHtml(globalFiltersDisplay());
  }

  if (legend) {
    legend.innerHTML = baseKey
      ? `<span class="cmp-legend-item"><span class="cmp-swatch ${swatchClass}"></span>${focusKey}</span>
         <span class="cmp-legend-item"><span class="cmp-swatch base"></span>${baseKey}（基准侧）</span>`
      : `<span class="cmp-legend-item"><span class="cmp-swatch ${swatchClass}"></span>${focusKey}</span>`;
  }

  host.innerHTML = matrix.rows.length
    ? matrix.rows.map((row) => {
        const focusS = row.byProject[focusKey];
        const baseS = baseKey ? row.byProject[baseKey] : null;
        if (!focusS && !baseS) return "";
        const fm = {
          key: sceneBarLabel(row),
          kind: "rate",
          value: focusS ? getRate(focusS) : 0,
          missing: !focusS
        };
        const bm = baseS
          ? { key: fm.key, kind: "rate", value: getRate(baseS) }
          : (baseKey ? { key: fm.key, kind: "rate", value: 0, missing: true } : null);
        return renderCmpBarPair(fm, bm, barTone);
      }).filter(Boolean).join("")
    : '<p class="muted cmp-empty">当前筛选下无场景点击率</p>';
}

function renderScenarioTable() {
  const day = $("cohortDayScenarioTable").value;
  const viewType = $("viewTypeScenarioTable").value;
  setDimContext("dimContextTable", globalFiltersDisplay());
  const rows = scenariosForScope(day, viewType, "table");
  const list = shouldCompareSeries()
    ? null
    : buildScenarioList(rows, false, day, "scenarioTable");
  // 文案分析：固定展示「文案」列（红框位置：通知场景后）
  const showCopy = isCopyAnalysisView(viewType)
    || !!(list && list.some((s) => s.copy))
    || (rows || []).some((r) => String(r["文案"] || "").trim());

  if (shouldCompareSeries()) {
    $("scenarioTable").innerHTML = renderScenarioCompareDetail(buildScenarioMatrix(rows, day, "scenarioTable"), showCopy);
    return;
  }

  const scope = "scenarioTable";
  const sorted = applyTableSort(list, scope, {
    project: (s) => s.project || "",
    viewType: (s) => s.viewType || "",
    name: (s) => s.name || "",
    copy: (s) => s.copy || "",
    showUsers: (s) => s.showUsers,
    showCount: (s) => s.showCount,
    avgNotify: (s) => s.avgNotify,
    clickUsers: (s) => s.clickUsers,
    clickCount: (s) => s.clickCount,
    ctrUser: (s) => s.ctrUser,
    ctrEvent: (s) => s.ctrEvent,
    avgClick: (s) => s.avgClick
  });

  $("scenarioTable").innerHTML = sorted.length
    ? `<div class="table-wrap"><table class="table-left"><thead><tr>
        ${sortableTh(scope, "project", "系列")}
        ${sortableTh(scope, "viewType", "查看类型")}
        ${sortableTh(scope, "name", "通知场景")}
        ${showCopy ? sortableTh(scope, "copy", "文案") : ""}
        ${sortableTh(scope, "showUsers", "通知用户数")}
        ${sortableTh(scope, "showCount", "通知事件数")}
        ${sortableTh(scope, "avgNotify", "人均通知(通知事件数/day0 first_open)")}
        ${sortableTh(scope, "clickUsers", "点击用户数")}
        ${sortableTh(scope, "clickCount", "点击事件数")}
        ${sortableTh(scope, "ctrUser", "点击率(用户)")}
        ${sortableTh(scope, "ctrEvent", "点击率(事件)")}
        ${sortableTh(scope, "avgClick", "人均点击")}
      </tr></thead><tbody>${sorted.map((s) => `<tr>
        <td>${s.project || "—"}</td><td>${s.viewType || "—"}</td><td>${s.name}</td>
        ${showCopy ? `<td class="copy-cell">${escapeHtml(s.copy || "—")}</td>` : ""}
        <td>${num(s.showUsers)}</td><td>${num(s.showCount)}</td>
        <td>${Number(s.avgNotify || 0).toFixed(2)}</td>
        <td>${num(s.clickUsers)}</td><td>${num(s.clickCount)}</td>
        <td>${pct(s.ctrUser)}</td><td>${pct(s.ctrEvent)}</td>
        <td>${Number(s.avgClick || 0).toFixed(2)}</td>
      </tr>`).join("")}</tbody></table></div>`
    : '<p class="muted">当前筛选下无场景明细</p>';
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isAllDimLabel(v) {
  const s = String(v == null ? "" : v).trim();
  return !s || s === "全部" || isAllToken(s);
}

function preferAdDetailRows(rows) {
  let out = rows || [];
  if (out.some((r) => !isAllDimLabel(r["广告位"]))) {
    out = out.filter((r) => !isAllDimLabel(r["广告位"]));
  }
  if (out.some((r) => !isAllDimLabel(r["上报广告中介"]))) {
    out = out.filter((r) => !isAllDimLabel(r["上报广告中介"]));
  }
  return out;
}

function adsForScope(cohortDay) {
  if (!state.data) return [];
  const g = globalFilters();
  return preferAdDetailRows(
    preferSummaryRows(
      (state.data.ad || []).filter((r) => passGlobal(r, g) && passCohort(r, cohortDay)),
      g
    )
  );
}

function adLabel(place, agency) {
  const p = String(place || "全部").trim() || "全部";
  const a = String(agency || "全部").trim() || "全部";
  if (!isAllDimLabel(a)) return `${p} · ${a}`;
  return p;
}

function buildAdList(rows, splitBySeries) {
  const mode = compareByValue();
  const agg = {};
  (rows || []).forEach((r) => {
    const place = String(r["广告位"] || "全部").trim() || "全部";
    const agency = String(r["上报广告中介"] || "全部").trim() || "全部";
    let series = r["项目代号"] || "";
    if (mode === "version") series = r["版本"] || "全部";
    if (mode === "period") series = r["日期"] || "";
    const k = (splitBySeries ? series + "||" : "") + place + "||" + agency;
    if (!agg[k]) {
      agg[k] = { project: series, place, agency, shouldShow: 0, success: 0, avgShow: 0 };
    }
    agg[k].shouldShow += Number(r["广告应展示数"]) || 0;
    agg[k].success += Number(r["广告展示成功数"]) || 0;
    // 同分母（Day0 first_open）下，各广告位人均可直接相加得到合计人均
    agg[k].avgShow += adAvgShow(r);
  });
  return Object.values(agg)
    .map((s) => ({
      ...s,
      name: adLabel(s.place, s.agency),
      successRate: s.shouldShow > 0 ? s.success / s.shouldShow : 0
    }))
    .sort((a, b) => {
      const pc = String(a.project || "").localeCompare(String(b.project || ""), "zh");
      if (pc) return pc;
      return b.successRate - a.successRate;
    });
}

function normAdKey(place, agency) {
  return String(place || "").replace(/\s+/g, "").trim().toLowerCase()
    + "||"
    + String(agency || "").replace(/\s+/g, "").trim().toLowerCase();
}

function buildAdMatrix(rows) {
  const flat = buildAdList(rows, true);
  const map = {};
  flat.forEach((s) => {
    const key = normAdKey(s.place, s.agency);
    if (!map[key]) map[key] = { key, place: s.place, agency: s.agency, name: s.name, byProject: {} };
    map[key].byProject[s.project || ""] = s;
  });
  const projects = orderSeries(seriesLabels(compareByValue()));
  const baseline = baselineValue();
  const rowsOut = Object.values(map).sort((a, b) => {
    const base = baseline !== NONE ? baseline : projects[0];
    const ca = base && a.byProject[base]
      ? a.byProject[base].successRate
      : Math.max(0, ...projects.map((p) => (a.byProject[p] && a.byProject[p].successRate) || 0));
    const cb = base && b.byProject[base]
      ? b.byProject[base].successRate
      : Math.max(0, ...projects.map((p) => (b.byProject[p] && b.byProject[p].successRate) || 0));
    return cb - ca;
  });
  return { projects, rows: rowsOut, baseline };
}

function emptyAdStats() {
  return { shouldShow: 0, success: 0, successRate: 0, avgShow: 0 };
}

function adMetricDefs() {
  return [
    { key: "广告应展示数", kind: "abs", get: (s) => s.shouldShow },
    { key: "广告展示成功数", kind: "abs", get: (s) => s.success },
    { key: "广告展示成功率", kind: "rate", get: (s) => s.successRate },
    { key: "人均展示成功数", kind: "avg", get: (s) => s.avgShow }
  ];
}

function renderAdCompareDetail(matrix) {
  const { projects, rows, baseline } = matrix;
  if (!rows.length) return '<p class="muted">当前筛选下无广告明细</p>';
  const metricDefs = adMetricDefs();
  const compareKeys = baseline !== NONE
    ? projects.filter((p) => p !== baseline)
    : projects.slice(1);
  const baseKey = baseline !== NONE ? baseline : projects[0];

  const headParts = [`<th>广告位</th><th>上报广告中介</th><th>指标</th>`];
  if (baseKey) headParts.push(`<th class="num">${baseKey}${baseline !== NONE ? "（基准）" : ""}</th>`);
  compareKeys.forEach((p) => {
    headParts.push(`<th class="num">${p}</th>`);
    headParts.push(`<th class="num">对比</th>`);
  });

  const body = rows.map((row) => metricDefs.map((md, mi) => {
    const baseS = baseKey ? (row.byProject[baseKey] || emptyAdStats()) : null;
    const cells = [];
    if (baseKey) {
      const s = row.byProject[baseKey];
      cells.push(s
        ? `<td class="num">${formatKpiValue({ kind: md.kind, value: md.get(s) })}</td>`
        : `<td class="num muted">—</td>`);
    }
    compareKeys.forEach((p) => {
      const s = row.byProject[p];
      if (!s) {
        cells.push(`<td class="num muted">—</td><td class="num muted">—</td>`);
        return;
      }
      const m = { kind: md.kind, value: md.get(s) };
      cells.push(`<td class="num">${formatKpiValue(m)}</td>`);
      if (baseS && row.byProject[baseKey]) {
        cells.push(`<td class="num">${formatDelta(m, { kind: md.kind, value: md.get(baseS) })}</td>`);
      } else {
        cells.push(`<td class="num muted">—</td>`);
      }
    });
    const placeCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.place || "—"}</td>` : "";
    const agencyCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.agency || "—"}</td>` : "";
    return `<tr>${placeCell}${agencyCell}<td>${md.key}</td>${cells.join("")}</tr>`;
  }).join("")).join("");

  return `<div class="table-wrap"><table class="compare-table scenario-detail-compare table-left"><thead><tr>${headParts.join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function renderAdBars() {
  const host = $("adBars");
  const legend = $("adCtrLegend");
  const dimEl = $("dimContextAdBars");
  if (!host) return;

  const day = ($("cohortDayAdBars") && $("cohortDayAdBars").value) || ALL;
  const rows = adsForScope(day);

  if (!shouldCompareSeries()) {
    const list = buildAdList(rows, false).slice().sort((a, b) => b.successRate - a.successRate);
    syncFocusSelect("adBarFocus", overviewBySeries(day, "overview"));
    if (legend) legend.innerHTML = "";
    if (dimEl) dimEl.textContent = dimContextHtml(globalFiltersDisplay());
    host.innerHTML = list.length
      ? list.map((s) => {
          const rate = Number(s.successRate) || 0;
          const pctVal = Math.max(0, Math.min(100, rate * 100));
          const zero = !(pctVal > 0);
          return `<div class="cmp-row">
            <div class="cmp-label" title="${s.name}">${s.name}</div>
            <div class="cmp-pair">
              ${renderTrackedBar("focus-user", pctVal, pctVal.toFixed(1), zero)}
            </div>
          </div>`;
        }).join("")
      : '<p class="muted cmp-empty">当前筛选下无广告成功率（请确认表格含 panel_ad）</p>';
    return;
  }

  const matrix = buildAdMatrix(rows);
  const cols = matrix.projects.map((k) => ({ key: k }));
  syncFocusSelect("adBarFocus", cols);

  const baseline = baselineValue();
  let focusKey = ($("adBarFocus") && $("adBarFocus").value) || "";
  if (!focusKey || !matrix.projects.includes(focusKey)) {
    focusKey = matrix.projects.find((p) => p !== baseline) || matrix.projects[0];
    if ($("adBarFocus")) $("adBarFocus").value = focusKey;
  }
  let baseKey = baseline !== NONE ? baseline : matrix.projects.find((p) => p !== focusKey);
  if (baseKey === focusKey) baseKey = matrix.projects.find((p) => p !== focusKey);

  const overviewCols = overviewBySeries(day, "overview");
  const focusCol = overviewCols.find((c) => c.key === focusKey);
  const baseCol = overviewCols.find((c) => c.key === baseKey);
  if (dimEl) {
    const lines = [];
    if (focusCol) lines.push(`<div><strong class="dim-tag focus">${focusKey}</strong> ${seriesDimLine(focusCol)}</div>`);
    else lines.push(`<div><strong class="dim-tag focus">${focusKey || "—"}</strong></div>`);
    if (baseKey && baseCol) lines.push(`<div><strong class="dim-tag base">${baseKey}</strong> ${seriesDimLine(baseCol)}</div>`);
    else if (baseKey) lines.push(`<div><strong class="dim-tag base">${baseKey}</strong></div>`);
    dimEl.innerHTML = lines.join("") || dimContextHtml(globalFiltersDisplay());
  }

  if (legend) {
    legend.innerHTML = baseKey
      ? `<span class="cmp-legend-item"><span class="cmp-swatch focus-user"></span>${focusKey}</span>
         <span class="cmp-legend-item"><span class="cmp-swatch base"></span>${baseKey}（基准侧）</span>`
      : `<span class="cmp-legend-item"><span class="cmp-swatch focus-user"></span>${focusKey || "—"}</span>`;
  }

  host.innerHTML = matrix.rows.length
    ? matrix.rows.map((row) => {
        const focusS = row.byProject[focusKey];
        const baseS = baseKey ? row.byProject[baseKey] : null;
        if (!focusS && !baseS) return "";
        const fm = {
          key: row.name,
          kind: "rate",
          value: focusS ? focusS.successRate : 0,
          missing: !focusS
        };
        const bm = baseS
          ? { key: fm.key, kind: "rate", value: baseS.successRate }
          : (baseKey ? { key: fm.key, kind: "rate", value: 0, missing: true } : null);
        return renderCmpBarPair(fm, bm, "user");
      }).filter(Boolean).join("")
    : '<p class="muted cmp-empty">当前筛选下无广告成功率</p>';
}

function renderAdTable() {
  const day = ($("cohortDayAdTable") && $("cohortDayAdTable").value) || ALL;
  setDimContext("dimContextAdTable", globalFiltersDisplay());
  const rows = adsForScope(day);
  const host = $("adTable");
  if (!host) return;

  if (shouldCompareSeries()) {
    host.innerHTML = renderAdCompareDetail(buildAdMatrix(rows));
    return;
  }

  const scope = "adTable";
  const list = applyTableSort(buildAdList(rows, true), scope, {
    project: (s) => s.project || "",
    place: (s) => s.place || "",
    agency: (s) => s.agency || "",
    shouldShow: (s) => s.shouldShow,
    success: (s) => s.success,
    successRate: (s) => s.successRate,
    avgShow: (s) => s.avgShow
  });
  host.innerHTML = list.length
    ? `<div class="table-wrap"><table class="table-left"><thead><tr>
        ${sortableTh(scope, "project", "系列")}
        ${sortableTh(scope, "place", "广告位")}
        ${sortableTh(scope, "agency", "上报广告中介")}
        ${sortableTh(scope, "shouldShow", "广告应展示数")}
        ${sortableTh(scope, "success", "广告展示成功数")}
        ${sortableTh(scope, "successRate", "广告展示成功率")}
        ${sortableTh(scope, "avgShow", "人均展示成功数")}
      </tr></thead><tbody>${list.map((s) => `<tr>
        <td>${s.project || "—"}</td>
        <td>${s.place || "—"}</td>
        <td>${s.agency || "—"}</td>
        <td>${num(s.shouldShow)}</td>
        <td>${num(s.success)}</td>
        <td>${pct(s.successRate)}</td>
        <td>${Number(s.avgShow || 0).toFixed(2)}</td>
      </tr>`).join("")}</tbody></table></div>`
    : '<p class="muted">当前筛选下无广告明细（请确认表格含 panel_ad）</p>';
}

function applyDataView() {
  const view = state.dataView === "ad" ? "ad" : "notify";
  const notifyEl = $("viewNotify");
  const adEl = $("viewAd");
  if (notifyEl) notifyEl.hidden = view !== "notify";
  if (adEl) adEl.hidden = view !== "ad";
  document.querySelectorAll(".view-btn[data-view]").forEach((btn) => {
    const on = btn.getAttribute("data-view") === view;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function setDataView(view) {
  state.dataView = view === "ad" ? "ad" : "notify";
  applyDataView();
  renderAll();
}

function renderSources() {
  const el = $("sourceList");
  if (!state.data) {
    el.innerHTML = "";
    return;
  }
  const sources = state.data.sources || [];
  const errors = state.data.errors || [];
  const ok = sources.map((s) => {
    const adPart = s.adRows != null ? `/${s.adRows}` : "";
    return `✓ ${s.spreadsheetId.slice(0, 10)}… (${s.overviewRows}/${s.scenarioRows}${adPart})`;
  }).join("　");
  const bad = errors.map((e) => `✗ ${e.spreadsheetId.slice(0, 10)}… ${e.error}`).join("<br/>");
  el.innerHTML = [
    sources.length ? `<div>已加载 ${sources.length} 个表格：${ok}</div>` : "",
    bad ? `<div class="err-text">${bad}</div>` : ""
  ].join("");
}

function renderAll() {
  applyDataView();
  syncSceneLocalFilters();
  if (state.dataView === "ad") {
    renderAdBars();
    renderAdTable();
  } else {
    renderKpi();
    renderScenarioBars();
    renderScenarioTable();
  }
  renderSources();
}

function preferDefaultDay(days) {
  if (!days || !days.length) return "全部";
  if (days.includes("Day0")) return "Day0";
  const day0 = days.find((d) => isDay0Label(d));
  if (day0) return day0;
  return days[0] || "全部";
}

function preferDefaultViewType(types) {
  const list = (types || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (list.includes("行为分析")) return "行为分析";
  if (list.length) return list[0];
  return "行为分析";
}

function syncBaselineOptions() {
  const el = $("baseline");
  if (!el) return;
  let labels = plannedSeriesKeys({ expandSecondary: true });
  if (!labels.length) labels = seriesLabels(compareByValue());
  const prev = el.value;
  fillSelect(el, [{ value: NONE, label: "无对比" }, ...labels.map((p) => ({ value: p, label: p }))], true);
  if (prev && [...el.options].some((o) => o.value === prev)) el.value = prev;
  else if (labels.length >= 2) el.value = labels[0];
  else el.value = NONE;
}

function optionList(values, withAll) {
  const rest = (values || [])
    .map((v) => String(v == null ? "" : v).trim())
    .filter((v) => v && !isAllToken(v));
  const uniq = [...new Set(rest)];
  const opts = uniq.map((v) => ({ value: v, label: v }));
  if (withAll !== false) return [{ value: ALL, label: "全部" }, ...opts];
  return opts;
}

function syncSceneLocalFilters(only) {
  if (!state.data) {
    ["sceneBars", "copyBars", "sceneTable", "copyTable"].forEach((id) => {
      fillMultiSelect(id, [{ value: ALL, label: "全部" }], true);
    });
    return;
  }
  const g = globalFilters();
  const buildOpts = (dayId, viewId) => {
    const day = ($(dayId) && $(dayId).value) || ALL;
    const viewType = ($(viewId) && $(viewId).value) || "";
    const base = (state.data.scenario || []).filter((r) =>
      passGlobal(r, g) && passCohort(r, day) && passViewType(r, viewType)
    );
    const names = [...new Set(base.map((r) => String(r["通知场景"] || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh"));
    // 文案选项：若已选具体场景，则只列出这些场景下的文案
    const sceneId = dayId.includes("Bars") ? "sceneBars" : "sceneTable";
    const selectedScenes = readMulti(sceneId);
    const forCopy = selectedScenes.some(isAllToken)
      ? base
      : base.filter((r) => selectedScenes.includes(String(r["通知场景"] || "").trim()));
    const copies = [...new Set(forCopy.map((r) => String(r["文案"] || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "zh"));
    return { names, copies };
  };

  if (!only || only === "bars") {
    const o = buildOpts("cohortDayScenarioBars", "viewTypeScenarioBars");
    fillMultiSelect("sceneBars", optionList(o.names), true);
    fillMultiSelect("copyBars", optionList(o.copies), true);
  }
  if (!only || only === "table") {
    const o = buildOpts("cohortDayScenarioTable", "viewTypeScenarioTable");
    fillMultiSelect("sceneTable", optionList(o.names), true);
    fillMultiSelect("copyTable", optionList(o.copies), true);
  }
}

function syncFilters() {
  const meta = state.data.meta || {};
  fillMultiSelect("project", optionList(meta.projects), true);
  fillMultiSelect("version", optionList(meta.versions), true);
  fillMultiSelect("country", optionList(meta.countries), true);
  fillMultiSelect("brand", optionList(meta.brands), true);
  fillMultiSelect("period", optionList(meta.periods, true), true);

  const days = meta.cohortDays || [];
  const dayOpts = days.length
    ? [{ value: ALL, label: "全部" }, ...days.map((d) => ({ value: d, label: d }))]
    : [{ value: ALL, label: "全部" }];
  const fromMeta = [...new Set((meta.viewTypes || []).map((t) => String(t || "").trim()).filter(Boolean))];
  const viewTypes = fromMeta.length ? fromMeta : ["行为分析", "文案分析"];
  // 场景模块：仅行为分析 / 文案分析，默认行为分析（不再默认「全部」）
  const viewOpts = viewTypes.map((v) => ({ value: v, label: v }));
  const defaultDay = preferDefaultDay(days);
  const defaultView = preferDefaultViewType(viewTypes);

  ["cohortDayOverview", "cohortDayScenarioBars", "cohortDayScenarioTable", "cohortDayAdBars", "cohortDayAdTable"].forEach((id) => {
    fillSelect($(id), dayOpts, true);
    if ($(id) && (!$(id).value || isAllToken($(id).value))) $(id).value = defaultDay;
  });
  ["viewTypeScenarioBars", "viewTypeScenarioTable"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const prev = el.value;
    fillSelect(el, viewOpts, true);
    if (prev && [...el.options].some((o) => o.value === prev) && !isAllToken(prev)) {
      el.value = prev;
    } else {
      el.value = defaultView;
    }
  });
  syncSceneLocalFilters();
  syncBaselineOptions();
}

function normSceneKey(viewType, name) {
  return String(viewType || "").replace(/\s+/g, "").trim().toLowerCase()
    + "||"
    + String(name || "").replace(/\s+/g, "").trim().toLowerCase();
}
function parseUrlsFromTextarea() {
  return String($("sheetUrls").value || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function loadSheets() {
  const urls = parseUrlsFromTextarea();
  if (!urls.length) return toast("请先粘贴至少一个 Google Sheet 链接");
  setStatus("加载中…", "run");
  $("btnLoad").disabled = true;
  try {
    const resp = await fetch("/api/sheet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls })
    });
    const json = await resp.json();
    if (!resp.ok || json.ok === false) throw new Error(json.error || "加载失败");
    state.data = json;
    localStorage.setItem(STORAGE_KEY, urls.join("\n"));
    syncFilters();
    renderAll();
    const n = json.meta.sourceCount || (json.sources || []).length;
    const errN = (json.errors || []).length;
    const adN = json.meta.adRows != null ? `/${json.meta.adRows}` : "";
    setStatus(`已加载 ${n} 个项目 · ${json.meta.overviewRows}/${json.meta.scenarioRows}${adN} 行` + (errN ? ` · ${errN} 失败` : ""), errN ? "warn" : "ok");
    toast(errN ? `完成：成功 ${n}，失败 ${errN}` : `已加载并清洗 ${n} 个项目表格`);
  } catch (err) {
    state.data = null;
    setStatus(String(err.message || err), "err");
    toast(String(err.message || err));
    renderAll();
  } finally {
    $("btnLoad").disabled = false;
  }
}

function exportStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function csvEscape(v) {
  const s = String(v == null ? "" : v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename, matrix) {
  const bom = "\uFEFF";
  const body = (matrix || []).map((row) => (row || []).map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([bom + body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function matrixFromTable(table) {
  if (!table) return null;
  const rows = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells = [...tr.querySelectorAll("th,td")].map((td) =>
      String(td.innerText || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim()
    );
    if (cells.some((c) => c !== "")) rows.push(cells);
  });
  return rows.length ? rows : null;
}

function cmpLabelText(labelEl) {
  if (!labelEl) return "";
  const clone = labelEl.cloneNode(true);
  clone.querySelectorAll(".cmp-delta, .unit").forEach((n) => n.remove());
  return String(clone.textContent || "").replace(/\s+/g, " ").trim();
}

function matrixFromCmpBars(host) {
  if (!host) return null;
  const items = [...host.querySelectorAll(".cmp-row")];
  if (!items.length) return null;
  const maxVals = Math.max(...items.map((row) => row.querySelectorAll(".cmp-bar-val").length), 1);
  const head = maxVals >= 2 ? ["名称", "对比项", "基准"] : ["名称", "数值"];
  const rows = [head];
  items.forEach((row) => {
    const name = cmpLabelText(row.querySelector(".cmp-label"));
    const vals = [...row.querySelectorAll(".cmp-bar-val")].map((el) => String(el.textContent || "").trim());
    while (vals.length < maxVals) vals.push("");
    rows.push([name, ...vals.slice(0, maxVals)]);
  });
  return rows;
}

function matrixFromSceneCtrData() {
  const day = $("cohortDayScenarioBars") && $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars") && $("viewTypeScenarioBars").value;
  const rows = scenariosForScope(day, viewType, "bars");
  if (shouldCompareSeries()) {
    const userBars = matrixFromCmpBars($("scenarioBars"));
    const eventBars = matrixFromCmpBars($("scenarioBarsEvent"));
    if (!userBars && !eventBars) return null;
    const out = [["模块", "名称", "对比项", "基准"]];
    (userBars || []).slice(1).forEach((r) => out.push(["用户CTR", r[0], r[1] || "", r[2] || ""]));
    (eventBars || []).slice(1).forEach((r) => out.push(["事件CTR", r[0], r[1] || "", r[2] || ""]));
    return out;
  }
  const list = buildScenarioList(rows, false, day, "scenarioBars");
  if (!list.length) return null;
  const out = [[
    "系列", "查看类型", "通知场景", "文案",
    "通知用户数", "通知事件数", "点击用户数", "点击事件数",
    "点击率(用户)%", "点击率(事件)%", "人均通知", "人均点击"
  ]];
  list.forEach((s) => {
    out.push([
      s.project || "",
      s.viewType || "",
      s.name || "",
      s.copy || "",
      s.showUsers || 0,
      s.showCount || 0,
      s.clickUsers || 0,
      s.clickCount || 0,
      ((Number(s.ctrUser) || 0) * 100).toFixed(1),
      ((Number(s.ctrEvent) || 0) * 100).toFixed(1),
      Number(s.avgNotify || 0).toFixed(2),
      Number(s.avgClick || 0).toFixed(2)
    ]);
  });
  return out;
}

function matrixFromAdBarsData() {
  const day = ($("cohortDayAdBars") && $("cohortDayAdBars").value) || ALL;
  const rows = adsForScope(day);
  if (shouldCompareSeries()) return matrixFromCmpBars($("adBars"));
  const list = buildAdList(rows, false);
  if (!list.length) return null;
  const out = [["广告位", "上报广告中介", "广告应展示数", "广告展示成功数", "广告展示成功率%", "人均展示成功数"]];
  list.forEach((s) => {
    out.push([
      s.place || "",
      s.agency || "",
      s.shouldShow || 0,
      s.success || 0,
      ((Number(s.successRate) || 0) * 100).toFixed(1),
      (Number(s.avgShow) || 0).toFixed(2)
    ]);
  });
  return out;
}

function buildExportMatrix(panelId) {
  if (panelId === "panelKpi") {
    return matrixFromTable($("stats") && $("stats").querySelector("table"));
  }
  if (panelId === "panelRateAvg") {
    return matrixFromCmpBars($("rateAvgBars"));
  }
  if (panelId === "panelSceneCtr") {
    return matrixFromSceneCtrData();
  }
  if (panelId === "panelSceneTable") {
    return matrixFromTable($("scenarioTable") && $("scenarioTable").querySelector("table"));
  }
  if (panelId === "panelAdBars") {
    return matrixFromAdBarsData() || matrixFromCmpBars($("adBars"));
  }
  if (panelId === "panelAdTable") {
    return matrixFromTable($("adTable") && $("adTable").querySelector("table"));
  }
  const panel = $(panelId);
  return panel ? matrixFromTable(panel.querySelector("table")) : null;
}

function exportPanelAsCsv(panelId, name) {
  const panel = $(panelId);
  if (!panel) return toast("未找到要导出的模块");
  const btn = panel.querySelector(`.btn-export[data-export="${panelId}"]`);
  if (btn) btn.disabled = true;
  try {
    const matrix = buildExportMatrix(panelId);
    if (!matrix || !matrix.length) return toast("当前无可导出的数据");
    const filename = `${name || panelId}_${exportStamp()}.csv`;
    downloadCsv(filename, matrix);
    toast(`已导出：${filename}`);
  } catch (err) {
    toast(`导出失败：${err.message || err}`);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindExportButtons() {
  document.querySelectorAll(".btn-export[data-export]").forEach((btn) => {
    btn.addEventListener("click", () => {
      exportPanelAsCsv(btn.getAttribute("data-export"), btn.getAttribute("data-export-name") || "模块");
    });
  });
}

function bind() {
  $("btnLoad").addEventListener("click", loadSheets);
  bindMultiSelectUI();
  bindExportButtons();

  document.addEventListener("click", (e) => {
    const th = e.target && e.target.closest && e.target.closest("th.sortable");
    if (!th) return;
    const scope = th.getAttribute("data-sort-scope");
    const key = th.getAttribute("data-sort-key");
    if (!scope || !key) return;
    toggleTableSort(scope, key);
    if (scope === "scenarioTable") renderScenarioTable();
    else if (scope === "adTable") renderAdTable();
  });

  document.querySelectorAll(".view-btn[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => setDataView(btn.getAttribute("data-view")));
  });

  ["compareBy", "baseline"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", () => {
      if (id === "compareBy") syncBaselineOptions();
      renderAll();
    });
  });

  ["cohortDayOverview"].forEach((id) => $(id).addEventListener("change", renderKpi));
  if ($("barFocus")) $("barFocus").addEventListener("change", renderKpi);
  if ($("sceneBarFocus")) $("sceneBarFocus").addEventListener("change", renderScenarioBars);
  if ($("adBarFocus")) $("adBarFocus").addEventListener("change", renderAdBars);

  ["cohortDayScenarioBars", "viewTypeScenarioBars"].forEach((id) => $(id).addEventListener("change", () => {
    syncSceneLocalFilters("bars");
    renderScenarioBars();
  }));
  ["cohortDayScenarioTable", "viewTypeScenarioTable"].forEach((id) => $(id).addEventListener("change", () => {
    syncSceneLocalFilters("table");
    renderScenarioTable();
  }));
  if ($("cohortDayAdBars")) $("cohortDayAdBars").addEventListener("change", renderAdBars);
  if ($("cohortDayAdTable")) $("cohortDayAdTable").addEventListener("change", renderAdTable);

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  fillSelect($("baseline"), [{ value: NONE, label: "无对比" }], false);
  fillMultiSelect("project", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("version", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("country", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("brand", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("period", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("sceneBars", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("copyBars", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("sceneTable", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("copyTable", [{ value: ALL, label: "全部" }], false);
  applyDataView();
  renderAll();
}
bind();
