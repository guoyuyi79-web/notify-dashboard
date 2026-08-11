const state = { data: null };
const $ = (id) => document.getElementById(id);
const STORAGE_KEY = "notify_sheet_urls";

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
    // 防止多个「全部」选项（__ALL__ 与字面 全部）
    if (isAllToken(label) || isAllToken(value)) {
      const allKey = "__LABEL_ALL__";
      if (seen.has(allKey)) return;
      seen.add(allKey);
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

const ALL = "__ALL__";
const NONE = "__NONE__";

function compareByValue() {
  return ($("compareBy") && $("compareBy").value) || "project";
}

function baselineValue() {
  const v = ($("baseline") && $("baseline").value) || NONE;
  if (!v || v === NONE || v === "无" || v === "无对比") return NONE;
  return v;
}

function globalFilters() {
  const projectRaw = $("project").value || ALL;
  const versionRaw = ($("version") && $("version").value) || ALL;
  const countryRaw = $("country").value || ALL;
  const brandRaw = $("brand").value || ALL;
  return {
    project: isAllToken(projectRaw) ? "全部" : projectRaw,
    version: isAllToken(versionRaw) ? "全部" : versionRaw,
    country: isAllToken(countryRaw) ? "全部" : countryRaw,
    brand: isAllToken(brandRaw) ? "全部" : brandRaw,
    period: $("period").value || ""
  };
}

/** 对比展开某维时，该维强制为全部以便分列 */
function filtersFor(_scope) {
  const g = globalFilters();
  const mode = compareByValue();
  if (mode === "version") return { ...g, version: "全部" };
  if (mode === "period") return { ...g, period: "" };
  if (mode === "project") return { ...g, project: "全部" };
  return g;
}

function matchDim(rowVal, selected, emptyAsAll) {
  if (!selected || selected === "全部") return true;
  const v = rowVal === undefined || rowVal === null || String(rowVal).trim() === ""
    ? (emptyAsAll ? "全部" : "")
    : String(rowVal).trim();
  return v === selected;
}

function passGlobal(r, g) {
  return matchDim(r["项目代号"], g.project, false)
    && matchDim(r["版本"] || "全部", g.version, true)
    && matchDim(r["国家"], g.country, false)
    && matchDim(r["设备品牌"] || "全部", g.brand, true)
    && (!g.period || String(r["日期"] || "") === g.period);
}

function passCohort(r, cohortDay) {
  if (!cohortDay || cohortDay === "全部" || cohortDay === ALL) return true;
  return String(r["队列天数"] || "") === cohortDay;
}
function passViewType(r, viewType) {
  if (!viewType || viewType === "全部" || viewType === ALL) return true;
  return String(r["查看类型"] || "") === viewType;
}

function preferSummaryRows(rows, g) {
  let out = rows || [];
  if (!g.country || g.country === "全部") {
    const allC = out.filter((r) => r["国家"] === "全部");
    if (allC.length) out = allC;
  }
  if (!g.brand || g.brand === "全部") {
    const allB = out.filter((r) => (r["设备品牌"] || "全部") === "全部");
    if (allB.length) out = allB;
  }
  if (!g.version || g.version === "全部") {
    const allV = out.filter((r) => (r["版本"] || "全部") === "全部");
    if (allV.length) out = allV;
  }
  return out;
}

function pickOverviewRow(rows, g) {
  if (!rows.length) return null;
  const country = g.country;
  const brand = g.brand;
  const version = g.version || "全部";
  if (country !== "全部" && brand !== "全部" && version !== "全部") return rows[0];

  const exact = rows.find((r) =>
    (country === "全部" ? r["国家"] === "全部" : true)
    && (brand === "全部" ? (r["设备品牌"] || "全部") === "全部" : true)
    && (version === "全部" ? (r["版本"] || "全部") === "全部" : true)
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
    国家: "全部",
    设备品牌: brand === "全部" ? "全部" : brand,
    版本: version === "全部" ? "全部" : version
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
      const rate = Number(r[rk]) || 0;
      est += b * rate;
      baseSum += b;
    });
    out[rk] = baseSum ? est / baseSum : 0;
  });
  return out;
}

function dimContextHtml(g) {
  const parts = [
    `国家 ${g.country || "全部"}`,
    `品牌 ${g.brand || "全部"}`,
    `版本 ${g.version || "全部"}`,
    `日期 ${g.period || "—"}`
  ];
  if (g.project && g.project !== "全部") parts.unshift(`项目 ${g.project}`);
  return `当前维度：${parts.join(" · ")}`;
}

function setDimContext(id, g) {
  const el = $(id);
  if (el) el.textContent = dimContextHtml(g);
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
    if (gUI.version && gUI.version !== "全部") list = list.filter((v) => v === gUI.version);
    if (!list.length) list = ["全部"];
    return list.sort((a, b) => String(a).localeCompare(String(b), "zh"));
  }
  if (mode === "period") {
    let list = (meta.periods || []).slice();
    if (gUI.period) list = list.filter((v) => v === gUI.period);
    if (!list.length) list = gUI.period ? [gUI.period] : ["—"];
    return list;
  }
  const projects = meta.projects || [];
  if (gUI.project && gUI.project !== "全部") return [gUI.project];
  return projects.length
    ? projects.slice()
    : [...new Set((state.data.overview || []).map((r) => r["项目代号"]).filter(Boolean))];
}

function overviewBySeries(cohortDay, scope) {
  const mode = compareByValue();
  const gBase = filtersFor(scope || "overview");
  const labels = seriesLabels(mode);
  return labels.map((label) => {
    const gOne = { ...gBase };
    if (mode === "project") gOne.project = label;
    else if (mode === "version") gOne.version = label;
    else if (mode === "period") gOne.period = label;
    // 非展开维仍用界面筛选（filtersFor 已对展开维放开）
    const ui = globalFilters();
    if (mode !== "project" && ui.project !== "全部") gOne.project = ui.project;
    if (mode !== "version" && ui.version !== "全部") gOne.version = ui.version;
    if (mode !== "period" && ui.period) gOne.period = ui.period;

    const rows = preferSummaryRows(
      (state.data.overview || []).filter((r) => passGlobal(r, gOne) && passCohort(r, cohortDay)),
      gOne
    );
    const row = pickOverviewRow(rows, gOne);
    return row ? { key: label, project: mode === "project" ? label : (gOne.project || "全部"), row, g: gOne } : null;
  }).filter(Boolean);
}

/** 兼容旧调用名 */
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
    : [{ key: "留存率", kind: "rate", value: asRate(row["留存率"]) }];
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

function retentionMetricsForSeries(col, scope) {
  const g = { ...(col.g || filtersFor(scope || "overview")) };
  const days = ((state.data && state.data.meta && state.data.meta.cohortDays) || []).slice();
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
    const pp = (a - b) * 100;
    text = `${pp > 0 ? "+" : ""}${pp.toFixed(1)}pp`;
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

function overviewForScope(cohortDay, scope) {
  if (!state.data) return [];
  const g = { ...globalFilters() };
  return preferSummaryRows(
    state.data.overview.filter((r) => passGlobal(r, g) && passCohort(r, cohortDay)),
    g
  );
}
function scenariosForScope(cohortDay, viewType, scope) {
  if (!state.data) return [];
  const g = { ...globalFilters() };
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

function shouldCompareSeries(rows) {
  const mode = compareByValue();
  if (mode === "project") {
    return isAllToken($("project").value) && seriesLabels("project").length > 1;
  }
  return seriesLabels(mode).length > 1;
}

function projectCodesFrom(rows) {
  return seriesLabels(compareByValue());
}

function buildScenarioMatrix(rows, cohortDay, scope) {
  const flat = buildScenarioList(rows, true, cohortDay, scope);
  const map = {};
  flat.forEach((s) => {
    const key = normSceneKey(s.viewType, s.name);
    if (!map[key]) map[key] = { key, viewType: s.viewType || "", name: s.name, byProject: {} };
    map[key].byProject[s.project || ""] = s;
  });
  const projects = orderSeries(projectCodesFrom(flat.map((s) => ({ "项目代号": s.project }))));
  const baseline = baselineValue();
  const rowsOut = Object.values(map).sort((a, b) => {
    const base = baseline !== NONE ? baseline : projects[0];
    const ca = base && a.byProject[base] ? a.byProject[base].ctrUser : Math.max(0, ...projects.map((p) => (a.byProject[p] && a.byProject[p].ctrUser) || 0));
    const cb = base && b.byProject[base] ? b.byProject[base].ctrUser : Math.max(0, ...projects.map((p) => (b.byProject[p] && b.byProject[p].ctrUser) || 0));
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

function renderScenarioCompareCtr(matrix) {
  const { projects, rows, baseline } = matrix;
  if (!rows.length) return '<p class="muted">当前模块筛选下无场景点击率</p>';
  const head = `<tr><th>查看类型</th><th>通知场景</th>${projects.map((p) => {
    const tag = p === baseline ? "（基准）" : "";
    return `<th class="num">${p}${tag}</th>`;
  }).join("")}</tr>`;
  const body = rows.map((row) => {
    const baseS = baseline !== NONE ? row.byProject[baseline] : null;
    const cells = projects.map((p) => {
      const s = row.byProject[p];
      if (!s) return `<td class="num muted">—</td>`;
      const main = pct(s.ctrUser);
      if (!baseS || p === baseline) return `<td class="num">${main}</td>`;
      const delta = formatDelta(
        { kind: "rate", value: s.ctrUser },
        { kind: "rate", value: baseS.ctrUser }
      );
      return `<td class="num">${main}<div class="delta-line">${delta}</div></td>`;
    }).join("");
    return `<tr><td>${row.viewType || "—"}</td><td>${row.name}</td>${cells}</tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderScenarioCompareDetail(matrix) {
  const { projects, rows, baseline } = matrix;
  if (!rows.length) return '<p class="muted">当前模块筛选下无场景明细</p>';
  const metricDefs = scenarioMetricDefs();
  const head = `<tr><th>查看类型</th><th>通知场景</th><th>指标</th>${projects.map((p) => {
    const tag = p === baseline ? "（基准）" : "";
    return `<th class="num">${p}${tag}</th>`;
  }).join("")}</tr>`;
  const body = rows.map((row) => metricDefs.map((md, mi) => {
    const baseS = baseline !== NONE ? (row.byProject[baseline] || emptyScenarioStats()) : null;
    const cells = projects.map((p) => {
      const s = row.byProject[p];
      if (!s) return `<td class="num muted">—</td>`;
      const m = { kind: md.kind, value: md.get(s) };
      const main = formatKpiValue(m);
      if (!baseS || p === baseline || !row.byProject[baseline]) return `<td class="num">${main}</td>`;
      const delta = formatDelta(m, { kind: md.kind, value: md.get(baseS) });
      return `<td class="num">${main}<div class="delta-line">${delta}</div></td>`;
    }).join("");
    const typeCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.viewType || "—"}</td>` : "";
    const nameCell = mi === 0 ? `<td rowspan="${metricDefs.length}">${row.name}</td>` : "";
    return `<tr>${typeCell}${nameCell}<td>${md.key}</td>${cells}</tr>`;
  }).join("")).join("");
  return `<div class="table-wrap"><table class="compare-table scenario-detail-compare"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderKpi() {
  const day = $("cohortDayOverview").value;
  const gShow = globalFilters();
  setDimContext("dimContextOverview", { ...gShow });

  let cols = overviewBySeries(day, "overview");
  if (!cols.length) {
    $("stats").innerHTML = '<p class="muted">当前条件下暂无 KPI</p>';
    renderRateAvgBars([], []);
    return;
  }

  const baseline = baselineValue();
  cols = orderSeries(cols.map((c) => c.key)).map((k) => cols.find((c) => c.key === k)).filter(Boolean);

  const metricSets = cols.map((c) =>
    kpiMetricsFromOverview(c.row, retentionMetricsForSeries(c, "overview"))
  );
  const baseIdx = baseline !== NONE
    ? cols.findIndex((c) => c.key === baseline)
    : -1;
  const baseMetrics = baseIdx >= 0 ? metricSets[baseIdx] : null;

  const dimCells = (row) => {
    const country = (row && row["国家"]) || gShow.country || "全部";
    const brand = (row && (row["设备品牌"] || "全部")) || gShow.brand || "全部";
    const version = (row && (row["版本"] || "全部")) || gShow.version || "全部";
    return `<td>${country}</td><td>${brand}</td><td>${version}</td>`;
  };

  if (cols.length === 1) {
    const row = cols[0].row;
    $("stats").innerHTML = `
      <div class="table-wrap"><table class="compare-table">
        <thead><tr><th>指标</th><th>国家</th><th>品牌</th><th>版本</th><th class="num">${cols[0].key}</th></tr></thead>
        <tbody>${metricSets[0].map((m) =>
          `<tr><td>${m.key}</td>${dimCells(row)}<td class="num">${formatKpiValue(m)}</td></tr>`
        ).join("")}</tbody>
      </table></div>`;
    renderRateAvgBars(cols, metricSets);
    return;
  }

  const head = `<tr><th>指标</th><th>国家</th><th>品牌</th><th>版本</th>${cols.map((c) => {
    const tag = c.key === baseline ? "（基准）" : "";
    return `<th class="num">${c.key}${tag}</th>`;
  }).join("")}</tr>`;

  const body = metricSets[0].map((m0, i) => {
    const cells = cols.map((c, ci) => {
      const m = metricSets[ci][i];
      const main = formatKpiValue(m);
      if (!baseMetrics || c.key === baseline) {
        return `<td class="num">${main}</td>`;
      }
      const delta = formatDelta(m, baseMetrics[i]);
      return `<td class="num">${main}<div class="delta-line">${delta}</div></td>`;
    }).join("");
    return `<tr><td>${m0.key}</td>${dimCells(cols[0].row)}${cells}</tr>`;
  }).join("");

  $("stats").innerHTML = `<div class="table-wrap"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  renderRateAvgBars(cols, metricSets);
}

function metricUnitLabel(m) {
  if (m.kind === "rate") return "(%)";
  if (m.kind === "avg") return "";
  return "";
}

function formatBarNumber(m) {
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

/** 进度条宽度：比率按 0–100%（可 >100）；人均按同组最大值归一 */
function barWidthPct(m, maxAbs) {
  const n = Math.abs(Number(m.value) || 0);
  if (m.kind === "rate") {
    // 1.0 = 100% 宽度，超过 100% 封顶显示满条
    return Math.max(0, Math.min(100, n * 100));
  }
  if (!maxAbs) return 0;
  return Math.max(0, Math.min(100, (n / maxAbs) * 100));
}

function syncBarFocusOptions(cols, baseline) {
  const el = $("barFocus");
  if (!el) return;
  const candidates = cols
    .map((c) => c.key)
    .filter((k) => baseline === NONE || k !== baseline);
  const list = candidates.length ? candidates : cols.map((c) => c.key);
  const prev = el.value;
  fillSelect(el, list.map((k) => ({ value: k, label: k })), true);
  if (prev && list.includes(prev)) el.value = prev;
  else if (list.length) el.value = list[0];
}

function pickComparePair(cols, metricSets) {
  if (!cols.length) return null;
  const baseline = baselineValue();
  let baseIdx = baseline !== NONE ? cols.findIndex((c) => c.key === baseline) : -1;
  if (baseIdx < 0 && cols.length >= 2) baseIdx = 0;

  syncBarFocusOptions(cols, baseIdx >= 0 ? cols[baseIdx].key : NONE);

  let focusKey = ($("barFocus") && $("barFocus").value) || "";
  let focusIdx = cols.findIndex((c) => c.key === focusKey);
  if (focusIdx < 0) {
    focusIdx = cols.findIndex((c, i) => i !== baseIdx);
    if (focusIdx < 0) focusIdx = 0;
  }
  if (baseIdx >= 0 && focusIdx === baseIdx && cols.length >= 2) {
    focusIdx = cols.findIndex((c, i) => i !== baseIdx);
  }

  return {
    focus: { key: cols[focusIdx].key, metrics: metricSets[focusIdx] },
    base: baseIdx >= 0 && baseIdx !== focusIdx
      ? { key: cols[baseIdx].key, metrics: metricSets[baseIdx] }
      : null,
    single: !(baseIdx >= 0 && baseIdx !== focusIdx)
  };
}

function renderRateAvgBars(cols, metricSets) {
  const host = $("rateAvgBars");
  const legend = $("rateAvgLegend");
  if (!host) return;

  if (!cols || !cols.length) {
    if (legend) legend.innerHTML = "";
    host.innerHTML = '<p class="muted cmp-empty">暂无数据</p>';
    return;
  }

  // 单列时也渲染橙色单条，便于看率/人均量级
  if (!metricSets || !metricSets.length) {
    metricSets = cols.map((c) =>
      kpiMetricsFromOverview(c.row, retentionMetricsForSeries(c, "overview"))
    );
  }

  const pair = pickComparePair(cols, metricSets);
  if (!pair) {
    host.innerHTML = '<p class="muted cmp-empty">暂无数据</p>';
    return;
  }

  const rateAvg = pair.focus.metrics
    .map((m, i) => ({ focus: m, base: pair.base ? pair.base.metrics[i] : null, i }))
    .filter((x) => x.focus.kind === "rate" || x.focus.kind === "avg");

  if (!rateAvg.length) {
    if (legend) legend.innerHTML = "";
    host.innerHTML = '<p class="muted cmp-empty">当前无比率/人均指标</p>';
    return;
  }

  if (legend) {
    if (pair.base) {
      legend.innerHTML = `
        <span class="cmp-legend-item"><span class="cmp-swatch focus"></span>${pair.focus.key}</span>
        <span class="cmp-legend-item"><span class="cmp-swatch base"></span>${pair.base.key}（基准）</span>`;
    } else {
      legend.innerHTML = `
        <span class="cmp-legend-item"><span class="cmp-swatch focus"></span>${pair.focus.key}</span>
        <span class="muted">仅一列时可看量级；设置对比基准后显示双条对比</span>`;
    }
  }

  host.innerHTML = rateAvg.map(({ focus: fm, base: bm }) => {
    const unit = metricUnitLabel(fm);
    let maxAbs = 0;
    if (fm.kind === "avg") {
      maxAbs = Math.max(Math.abs(Number(fm.value) || 0), bm ? Math.abs(Number(bm.value) || 0) : 0, 0.0001);
    }
    const wFocus = barWidthPct(fm, maxAbs);
    const focusZero = !(Number(fm.value) > 0);
    const focusBar = `<div class="cmp-bar focus${focusZero ? " is-zero" : ""}" style="width:${Math.max(focusZero ? 48 : 8, wFocus)}%">${formatBarNumber(fm)}</div>`;

    let baseBar = "";
    if (bm) {
      const wBase = barWidthPct(bm, maxAbs);
      const baseZero = !(Number(bm.value) > 0);
      baseBar = `<div class="cmp-bar base${baseZero ? " is-zero" : ""}" style="width:${Math.max(baseZero ? 48 : 8, wBase)}%">${formatBarNumber(bm)}</div>`;
    }

    return `<div class="cmp-row">
      <div class="cmp-label">${fm.key}${unit ? ` <span class="unit">${unit}</span>` : ""}</div>
      <div class="cmp-pair">${focusBar}${baseBar}</div>
    </div>`;
  }).join("");
}

function renderScenarioBars() {
  const day = $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars").value;
  setDimContext("dimContextBars", globalFilters());
  const rows = scenariosForScope(day, viewType, "scenarioBars");

  if (shouldCompareSeries(rows)) {
    $("scenarioBars").innerHTML = renderScenarioCompareCtr(buildScenarioMatrix(rows, day, "scenarioBars"));
    return;
  }

  const list = buildScenarioList(rows, false, day, "scenarioBars");
  const max = Math.max(...list.map((s) => s.ctrUser), 0.0001);
  $("scenarioBars").innerHTML = list.length
    ? list.map((s) => {
        const w = Math.max(4, Math.round((s.ctrUser / max) * 100));
        const parts = [s.viewType, s.name].filter(Boolean);
        const name = parts.join(" · ");
        return `<div class="bar-row bar-row-wide"><div title="${name}">${name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="num">${pct(s.ctrUser)}</div></div>`;
      }).join("")
    : '<p class="muted">当前筛选下无场景点击率</p>';
}

function renderScenarioTable() {
  const day = $("cohortDayScenarioTable").value;
  const viewType = $("viewTypeScenarioTable").value;
  setDimContext("dimContextTable", globalFilters());
  const rows = scenariosForScope(day, viewType, "scenarioTable");

  if (shouldCompareSeries(rows)) {
    $("scenarioTable").innerHTML = renderScenarioCompareDetail(buildScenarioMatrix(rows, day, "scenarioTable"));
    return;
  }

  const list = buildScenarioList(rows, true, day, "scenarioTable");
  $("scenarioTable").innerHTML = list.length
    ? `<div class="table-wrap"><table><thead><tr>
        <th>系列</th><th>查看类型</th><th>通知场景</th>
        <th class="num">通知用户数</th><th class="num">通知事件数</th>
        <th class="num">人均通知(通知事件数/day0 first_open)</th>
        <th class="num">点击用户数</th><th class="num">点击事件数</th>
        <th class="num">点击率(用户)</th><th class="num">点击率(事件)</th>
        <th class="num">人均点击</th>
      </tr></thead><tbody>${list.map((s) => `<tr>
        <td>${s.project || "—"}</td><td>${s.viewType || "—"}</td><td>${s.name}</td>
        <td class="num">${num(s.showUsers)}</td><td class="num">${num(s.showCount)}</td>
        <td class="num">${Number(s.avgNotify || 0).toFixed(2)}</td>
        <td class="num">${num(s.clickUsers)}</td><td class="num">${num(s.clickCount)}</td>
        <td class="num">${pct(s.ctrUser)}</td><td class="num">${pct(s.ctrEvent)}</td>
        <td class="num">${Number(s.avgClick || 0).toFixed(2)}</td>
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

function preferDay0(days) {
  if (days.includes("Day0")) return "Day0";
  return days[0] || "全部";
}

function syncBaselineOptions() {
  const el = $("baseline");
  if (!el) return;
  const mode = compareByValue();
  const labels = seriesLabels(mode);
  const prev = el.value;
  fillSelect(el, [{ value: NONE, label: "无对比" }, ...labels.map((p) => ({ value: p, label: p }))], true);
  if (prev && [...el.options].some((o) => o.value === prev)) {
    el.value = prev;
  } else if (labels.length >= 2) {
    el.value = labels[0];
  } else {
    el.value = NONE;
  }
}

function optionList(values) {
  const allOpt = { value: ALL, label: "全部" };
  const rest = (values || [])
    .map((v) => String(v == null ? "" : v).trim())
    .filter((v) => v && !isAllToken(v));
  const uniq = [...new Set(rest)];
  return [allOpt, ...uniq.map((v) => ({ value: v, label: v }))];
}

function syncFilters() {
  const meta = state.data.meta || {};
  const periodOpts = (meta.periods || []).map((v) => ({ value: v, label: v }));

  fillSelect($("project"), optionList(meta.projects), true);
  fillSelect($("version"), optionList(meta.versions), true);
  fillSelect($("country"), optionList(meta.countries), true);
  fillSelect($("brand"), optionList(meta.brands), true);
  fillSelect($("period"), periodOpts, true);
  if (!$("period").value && meta.periods && meta.periods[0]) $("period").value = meta.periods[0];
  if (!$("project").value) $("project").value = ALL;
  if ($("version") && !$("version").value) $("version").value = ALL;

  const days = meta.cohortDays || [];
  const dayOpts = days.length ? [{ value: ALL, label: "全部" }, ...days.map((d) => ({ value: d, label: d }))] : [{ value: ALL, label: "全部" }];
  const viewOpts = meta.viewTypes && meta.viewTypes.length
    ? [{ value: ALL, label: "全部" }, ...meta.viewTypes.map((v) => ({ value: v, label: v }))]
    : [{ value: ALL, label: "全部" }];
  const defaultDay = preferDay0(days);

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
  const vt = String(viewType || "").replace(/\s+/g, "").trim();
  const nm = String(name || "").replace(/\s+/g, "").trim();
  return vt + "||" + nm;
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
  ["compareBy", "baseline", "project", "version", "country", "brand", "period"].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", () => {
      if (id === "compareBy") syncBaselineOptions();
      renderAll();
    });
  });

  ["cohortDayOverview"].forEach((id) => $(id).addEventListener("change", renderKpi));
  if ($("barFocus")) $("barFocus").addEventListener("change", renderKpi);
  ["cohortDayScenarioBars", "viewTypeScenarioBars"].forEach((id) => $(id).addEventListener("change", renderScenarioBars));
  ["cohortDayScenarioTable", "viewTypeScenarioTable"].forEach((id) => $(id).addEventListener("change", renderScenarioTable));

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  fillSelect($("baseline"), [{ value: NONE, label: "无对比" }], false);
  fillSelect($("version"), [{ value: ALL, label: "全部" }], false);
  renderAll();
}
bind();
