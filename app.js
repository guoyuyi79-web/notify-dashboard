const state = { data: null };
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
  period: new Set([ALL])
};

function msToggleId(id) { return id + "Toggle"; }
function msPanelId(id) { return id + "Panel"; }

function formatMsSummary(id) {
  const set = multiState[id] || new Set([ALL]);
  const vals = [...set];
  if (!vals.length || vals.some(isAllToken)) return "全部";
  return vals.join("、");
}

function updateMsToggleLabel(id) {
  const btn = $(msToggleId(id));
  if (!btn) return;
  const text = formatMsSummary(id);
  btn.textContent = text;
  btn.title = text;
}

function closeAllMsPanels(exceptId) {
  ["project", "version", "country", "brand", "period"].forEach((id) => {
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
    return `<label class="ms-option"><input type="checkbox" data-ms-id="${id}" value="${o.value.replace(/"/g, "&quot;")}" ${checked} /><span>${o.label}</span></label>`;
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
  ["project", "version", "country", "brand", "period"].forEach((id) => {
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

function overviewBySeries(cohortDay, scope) {
  const mode = compareByValue();
  const gBase = filtersFor(scope || "overview");
  const labels = seriesLabels(mode);
  const ui = globalFilters();
  return labels.map((label) => {
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
    if (mode !== "version" && !ui.versions.some(isAllToken)) gOne.versions = ui.versions.slice();
    if (mode !== "period" && ui.periods.length) gOne.periods = ui.periods.slice();

    const rows = preferSummaryRows(
      (state.data.overview || []).filter((r) => passGlobal(r, gOne) && passCohort(r, cohortDay)),
      gOne
    );
    const row = pickOverviewRow(rows, gOne);
    return row ? { key: label, project: mode === "project" ? label : formatMultiLabel(gOne.projects), row, g: gOne } : null;
  }).filter(Boolean);
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

function scenariosForScope(cohortDay, viewType) {
  if (!state.data) return [];
  const g = globalFilters();
  return preferSummaryRows(
    state.data.scenario.filter((r) =>
      passGlobal(r, g) && passCohort(r, cohortDay) && passViewType(r, viewType)
    ),
    g
  );
}

function buildScenarioList(rows, splitBySeries, cohortDay, scope) {
  const mode = compareByValue();
  const agg = {};
  rows.forEach((r) => {
    const name = r["通知场景"] || "";
    if (!name) return;
    const viewType = r["查看类型"] || "";
    let series = r["项目代号"] || "";
    if (mode === "version") series = r["版本"] || "全部";
    if (mode === "period") series = r["日期"] || "";
    const k = (splitBySeries ? series + "||" : "") + viewType + "||" + name;
    if (!agg[k]) {
      agg[k] = { project: series, name, viewType, showUsers: 0, showCount: 0, clickUsers: 0, clickCount: 0 };
    }
    const t = agg[k];
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

function shouldCompareSeries() {
  return seriesLabels(compareByValue()).length > 1;
}

function buildScenarioMatrix(rows, cohortDay, scope, sortMetric) {
  const flat = buildScenarioList(rows, true, cohortDay, scope);
  const map = {};
  flat.forEach((s) => {
    const key = normSceneKey(s.viewType, s.name);
    if (!map[key]) map[key] = { key, viewType: s.viewType || "", name: s.name, byProject: {} };
    map[key].byProject[s.project || ""] = s;
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
function renderScenarioCompareDetail(matrix) {
  const { projects, rows, baseline } = matrix;
  if (!rows.length) return '<p class="muted">当前模块筛选下无场景明细</p>';
  const metricDefs = scenarioMetricDefs();
  const compareKeys = baseline !== NONE
    ? projects.filter((p) => p !== baseline)
    : projects.slice(1);
  const baseKey = baseline !== NONE ? baseline : projects[0];

  const headParts = [`<th>查看类型</th><th>通知场景</th><th>指标</th>`];
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
    return `<tr>${typeCell}${nameCell}<td>${md.key}</td>${cells.join("")}</tr>`;
  }).join("")).join("");

  return `<div class="table-wrap"><table class="compare-table scenario-detail-compare table-left"><thead><tr>${headParts.join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/** 维度列：对比维度本身已在右侧分列，中间不再重复展示 */
function dimHeadersHtml() {
  const mode = compareByValue();
  const parts = [];
  parts.push("<th>国家</th>");
  parts.push("<th>品牌</th>");
  if (mode !== "version") parts.push("<th>版本</th>");
  if (mode !== "period") parts.push("<th>时间周期</th>");
  return parts.join("");
}

function dimCellsHtml(row, gShow) {
  const mode = compareByValue();
  const country = (row && row["国家"]) || gShow.country || "全部";
  const brand = (row && (row["设备品牌"] || "全部")) || gShow.brand || "全部";
  const version = (row && (row["版本"] || "全部")) || gShow.version || "全部";
  const period = (row && row["日期"]) || gShow.period || "—";
  const parts = [`<td>${country}</td>`, `<td>${brand}</td>`];
  if (mode !== "version") parts.push(`<td>${version}</td>`);
  if (mode !== "period") parts.push(`<td>${period}</td>`);
  return parts.join("");
}

function renderKpi() {
  const day = $("cohortDayOverview").value;
  const gShow = globalFiltersDisplay();
  setDimContext("dimContextOverview", gShow);

  let cols = overviewBySeries(day, "overview");
  if (!cols.length) {
    $("stats").innerHTML = '<p class="muted">当前条件下暂无 KPI</p>';
    renderRateAvgBars([], []);
    return;
  }

  let baseline = baselineValue();
  cols = orderSeries(cols.map((c) => c.key)).map((k) => cols.find((c) => c.key === k)).filter(Boolean);

  const metricSets = cols.map((c) =>
    kpiMetricsFromOverview(c.row, retentionMetricsForSeries(c, "overview"))
      .filter((m) => !/^Day0留存$/i.test(m.key))
  );

  // 多列且未选基准时，默认用首列作基准，才能出「对比」列
  if (cols.length >= 2 && baseline === NONE) {
    baseline = cols[0].key;
  }
  const baseIdx = cols.findIndex((c) => c.key === baseline);
  const baseMetrics = baseIdx >= 0 ? metricSets[baseIdx] : null;
  const compareCols = cols.filter((c) => c.key !== baseline);
  const dimHead = dimHeadersHtml();
  const dimSample = cols[0].row;

  if (cols.length === 1) {
    $("stats").innerHTML = `
      <div class="table-wrap"><table class="compare-table">
        <thead><tr><th>指标</th>${dimHead}<th class="num">${cols[0].key}</th></tr></thead>
        <tbody>${metricSets[0].map((m) =>
          `<tr><td>${m.key}</td>${dimCellsHtml(dimSample, gShow)}<td class="num">${formatKpiValue(m)}</td></tr>`
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
    return `<tr><td>${m0.key}</td>${dimCellsHtml(dimSample, gShow)}${cells.join("")}</tr>`;
  }).join("");

  $("stats").innerHTML = `<div class="table-wrap"><table class="compare-table"><thead><tr>${headParts.join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
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
  let baseIdx = baseline !== NONE ? cols.findIndex((c) => c.key === baseline) : -1;
  if (baseIdx < 0 && cols.length >= 2) baseIdx = 0;

  syncFocusSelect(focusElId || "barFocus", cols);

  let focusKey = ($(focusElId || "barFocus") && $(focusElId || "barFocus").value) || "";
  let focusIdx = cols.findIndex((c) => c.key === focusKey);
  if (focusIdx < 0) focusIdx = cols.findIndex((c, i) => i !== baseIdx);
  if (focusIdx < 0) focusIdx = 0;

  // 若对比项=基准，自动用另一列作蓝条
  let blueIdx = baseIdx;
  if (blueIdx === focusIdx) {
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

function renderCmpBarPair(fm, bm, tone) {
  const focusClass = tone === "event" ? "focus-event" : (tone === "user" ? "focus-user" : "focus");
  let maxAbs = 0;
  if (fm.kind === "avg") {
    maxAbs = Math.max(Math.abs(Number(fm.value) || 0), bm ? Math.abs(Number(bm.value) || 0) : 0, 0.0001);
  }
  const wFocus = fm.missing ? 48 : barWidthPct(fm, maxAbs);
  const focusZero = fm.missing || !(Number(fm.value) > 0);
  const focusBar = `<div class="cmp-bar ${focusClass}${focusZero ? " is-zero" : ""}" style="width:${Math.max(focusZero ? 48 : 8, wFocus)}%">${formatBarNumber(fm)}</div>`;
  let baseBar = "";
  if (bm) {
    const wBase = bm.missing ? 48 : barWidthPct(bm, maxAbs);
    const baseZero = bm.missing || !(Number(bm.value) > 0);
    baseBar = `<div class="cmp-bar base${baseZero ? " is-zero" : ""}" style="width:${Math.max(baseZero ? 48 : 8, wBase)}%">${formatBarNumber(bm)}</div>`;
  }
  const unit = metricUnitLabel(fm);
  return `<div class="cmp-row">
    <div class="cmp-label">${fm.key}${unit ? ` <span class="unit">${unit}</span>` : ""}</div>
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

function renderScenarioBars() {
  const day = $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars").value;
  const rows = scenariosForScope(day, viewType);
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
    const max = Math.max(...list.map(getRate), 0.0001);
    host.innerHTML = list.length
      ? list.map((s) => {
          const rate = getRate(s);
          const w = Math.max(4, Math.round((rate / max) * 100));
          const name = [s.viewType, s.name].filter(Boolean).join(" · ");
          return `<div class="cmp-row">
            <div class="cmp-label" title="${name}">${name}</div>
            <div class="cmp-pair">
              <div class="cmp-bar focus-${barTone}" style="width:${w}%">${(rate * 100).toFixed(1)}</div>
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
          key: `${row.viewType || ""} · ${row.name}`.replace(/^ · /, ""),
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
  const rows = scenariosForScope(day, viewType);

  if (shouldCompareSeries()) {
    $("scenarioTable").innerHTML = renderScenarioCompareDetail(buildScenarioMatrix(rows, day, "scenarioTable"));
    return;
  }

  const list = buildScenarioList(rows, true, day, "scenarioTable");
  $("scenarioTable").innerHTML = list.length
    ? `<div class="table-wrap"><table class="table-left"><thead><tr>
        <th>系列</th><th>查看类型</th><th>通知场景</th>
        <th>通知用户数</th><th>通知事件数</th>
        <th>人均通知(通知事件数/day0 first_open)</th>
        <th>点击用户数</th><th>点击事件数</th>
        <th>点击率(用户)</th><th>点击率(事件)</th>
        <th>人均点击</th>
      </tr></thead><tbody>${list.map((s) => `<tr>
        <td>${s.project || "—"}</td><td>${s.viewType || "—"}</td><td>${s.name}</td>
        <td>${num(s.showUsers)}</td><td>${num(s.showCount)}</td>
        <td>${Number(s.avgNotify || 0).toFixed(2)}</td>
        <td>${num(s.clickUsers)}</td><td>${num(s.clickCount)}</td>
        <td>${pct(s.ctrUser)}</td><td>${pct(s.ctrEvent)}</td>
        <td>${Number(s.avgClick || 0).toFixed(2)}</td>
      </tr>`).join("")}</tbody></table></div>`
    : '<p class="muted">当前筛选下无场景明细</p>';
}

function renderSources() {
  const el = $("sourceList");
  if (!state.data) {
    el.innerHTML = "";
    return;
  }
  const sources = state.data.sources || [];
  const errors = state.data.errors || [];
  const ok = sources.map((s) => `✓ ${s.spreadsheetId.slice(0, 10)}… (${s.overviewRows}/${s.scenarioRows})`).join("　");
  const bad = errors.map((e) => `✗ ${e.spreadsheetId.slice(0, 10)}… ${e.error}`).join("<br/>");
  el.innerHTML = [
    sources.length ? `<div>已加载 ${sources.length} 个表格：${ok}</div>` : "",
    bad ? `<div class="err-text">${bad}</div>` : ""
  ].join("");
}

function renderAll() {
  renderKpi();
  renderScenarioBars();
  renderScenarioTable();
  renderSources();
}

function preferDefaultDay(days) {
  const non0 = days.filter((d) => !isDay0Label(d));
  if (non0.includes("Day1")) return "Day1";
  if (non0.length) return non0[0];
  if (days.includes("Day0")) return "Day0";
  return days[0] || "全部";
}

function syncBaselineOptions() {
  const el = $("baseline");
  if (!el) return;
  const labels = seriesLabels(compareByValue());
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
  const viewOpts = meta.viewTypes && meta.viewTypes.length
    ? [{ value: ALL, label: "全部" }, ...meta.viewTypes.map((v) => ({ value: v, label: v }))]
    : [{ value: ALL, label: "全部" }];
  const defaultDay = preferDefaultDay(days);

  ["cohortDayOverview", "cohortDayScenarioBars", "cohortDayScenarioTable"].forEach((id) => {
    fillSelect($(id), dayOpts, true);
    if (!$(id).value || isAllToken($(id).value)) $(id).value = defaultDay;
  });
  ["viewTypeScenarioBars", "viewTypeScenarioTable"].forEach((id) => {
    fillSelect($(id), viewOpts, true);
    if (!$(id).value) $(id).value = ALL;
  });
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
    setStatus(`已加载 ${n} 个项目 · ${json.meta.overviewRows}/${json.meta.scenarioRows} 行` + (errN ? ` · ${errN} 失败` : ""), errN ? "warn" : "ok");
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

function bind() {
  $("btnLoad").addEventListener("click", loadSheets);
  bindMultiSelectUI();

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

  ["cohortDayScenarioBars", "viewTypeScenarioBars"].forEach((id) => $(id).addEventListener("change", renderScenarioBars));
  ["cohortDayScenarioTable", "viewTypeScenarioTable"].forEach((id) => $(id).addEventListener("change", renderScenarioTable));

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  fillSelect($("baseline"), [{ value: NONE, label: "无对比" }], false);
  fillMultiSelect("project", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("version", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("country", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("brand", [{ value: ALL, label: "全部" }], false);
  fillMultiSelect("period", [{ value: ALL, label: "全部" }], false);
  renderAll();
}
bind();
