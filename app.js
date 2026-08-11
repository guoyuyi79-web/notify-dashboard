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
function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  // rates are ratios: 1 = 100%, can be >1 (e.g. DayN 渗透率)
  return (n * 100).toFixed(1) + "%";
}
function num(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}
function fillSelect(el, values, keep) {
  const prev = keep ? el.value : "";
  el.innerHTML = "";
  values.forEach((item) => {
    const opt = document.createElement("option");
    if (item && typeof item === "object") {
      opt.value = item.value;
      opt.textContent = item.label;
    } else {
      opt.value = item;
      opt.textContent = item;
    }
    el.appendChild(opt);
  });
  const ok = [...el.options].some((o) => o.value === prev);
  if (prev && ok) el.value = prev;
}

const ALL = "__ALL__";
const NONE = "__NONE__";

function isAllProject() {
  const v = $("project").value;
  return !v || v === ALL || v === "全部";
}

function baselineValue() {
  const v = ($("baselineProject") && $("baselineProject").value) || NONE;
  if (!v || v === NONE || v === "无") return NONE;
  return v;
}

function projectCodesFrom(rows) {
  const set = new Set();
  ((state.data && state.data.meta && state.data.meta.projects) || []).forEach((p) => set.add(p));
  (rows || []).forEach((r) => {
    const p = r["项目代号"];
    if (p) set.add(String(p));
  });
  return [...set].filter(Boolean);
}

function shouldCompareProjects(rows) {
  return isAllProject() && projectCodesFrom(rows).length > 1;
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

function globalFilters() {
  const projectRaw = $("project").value || ALL;
  return {
    project: projectRaw === ALL || projectRaw === "全部" ? "全部" : projectRaw,
    country: (() => {
      const v = $("country").value || ALL;
      return v === ALL || v === "全部" ? "全部" : v;
    })(),
    brand: (() => {
      const v = $("brand").value || ALL;
      return v === ALL || v === "全部" ? "全部" : v;
    })(),
    period: $("period").value || ""
  };
}

/** 模块筛选项：有值则覆盖全局；全部则跟全局 */
function readDim(modId, globalVal) {
  const el = $(modId);
  if (!el) return globalVal;
  const v = el.value;
  if (!v || v === ALL || v === "全部" || v === "跟随全局") return globalVal;
  return v;
}

function filtersFor(scope) {
  const g = globalFilters();
  if (scope === "overview") {
    return {
      project: g.project,
      country: readDim("countryOverview", g.country),
      brand: readDim("brandOverview", g.brand),
      period: readDim("periodOverview", g.period) || g.period
    };
  }
  if (scope === "scenarioBars") {
    return {
      project: g.project,
      country: readDim("countryScenarioBars", g.country),
      brand: readDim("brandScenarioBars", g.brand),
      period: readDim("periodScenarioBars", g.period) || g.period
    };
  }
  if (scope === "scenarioTable") {
    return {
      project: g.project,
      country: readDim("countryScenarioTable", g.country),
      brand: readDim("brandScenarioTable", g.brand),
      period: readDim("periodScenarioTable", g.period) || g.period
    };
  }
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

/** 国家/品牌选「全部」时优先用汇总行，避免各国加总重复 */
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
  return out;
}

function pickOverviewRow(rows, g) {
  if (!rows.length) return null;
  const country = g.country;
  const brand = g.brand;
  if (country !== "全部" && brand !== "全部") return rows[0];
  if (country !== "全部" && brand === "全部") {
    const exact = rows.find((r) => (r["设备品牌"] || "全部") === "全部");
    if (exact) return exact;
  }
  if (country === "全部" && brand !== "全部") {
    const exact = rows.find((r) => r["国家"] === "全部");
    if (exact) return exact;
  }
  const all = rows.find((r) => r["国家"] === "全部" && (r["设备品牌"] || "全部") === "全部");
  if (all) return all;

  const sumKeys = ["总活跃用户", "授权数", "发送通知用户数", "发通知总数", "点击用户数", "点击事件数"];
  const out = { ...rows[0], 国家: "全部", 设备品牌: brand === "全部" ? "全部" : brand };
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
  // 与脚本一致：DayN 发通知总数 / Day0 first_open（总活跃）
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

/** 项目=全部时按项目拆开，便于对比；单项目则返回 1 列 */
function overviewByProject(cohortDay, scope) {
  const g = filtersFor(scope || "overview");
  if (g.project && g.project !== "全部") {
    const row = pickOverviewRow(overviewForScope(cohortDay, scope), g);
    return row ? [{ project: g.project, row }] : [];
  }
  const projects = (state.data && state.data.meta && state.data.meta.projects) || [];
  const list = projects.length
    ? projects
    : [...new Set((state.data.overview || []).map((r) => r["项目代号"]).filter(Boolean))];
  return list.map((project) => {
    const gOne = { ...g, project };
    const rows = preferSummaryRows(
      (state.data.overview || []).filter((r) => passGlobal(r, gOne) && passCohort(r, cohortDay)),
      gOne
    );
    const row = pickOverviewRow(rows, gOne);
    return row ? { project, row } : null;
  }).filter(Boolean);
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
    : [{ key: "留存率", kind: "rate", value: Number(row["留存率"]) || 0 }];
  return head.concat(retains).concat([
    { key: "授权数", kind: "abs", value: Number(row["授权数"]) || 0 },
    { key: "发送通知用户", kind: "abs", value: Number(row["发送通知用户数"]) || 0 },
    { key: "点击用户", kind: "abs", value: Number(row["点击用户数"]) || 0 },
    { key: "授权率", kind: "rate", value: Number(row["授权率"]) || 0 },
    { key: "通知渗透率", kind: "rate", value: penetration },
    { key: "人均通知数", kind: "avg", value: avgNotify },
    { key: "点击率-用户", kind: "rate", value: Number(row["点击率-用户"]) || 0 },
    { key: "点击率-事件", kind: "rate", value: Number(row["点击率-事件"]) || 0 },
    { key: "人均点击", kind: "avg", value: Number(row["人均点击"]) || 0 },
    { key: uninstallKey, kind: "rate", value: Number(row[uninstallKey]) || 0 }
  ]);
}

/** 拉取某项目 Day0–Dn 全部留存 */
function retentionMetricsForProject(project, scope) {
  const g = { ...filtersFor(scope || "overview"), project };
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
      value: row ? (Number(row["留存率"]) || 0) : 0
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
  const g = filtersFor(scope || "overview");
  return preferSummaryRows(
    state.data.overview.filter((r) => passGlobal(r, g) && passCohort(r, cohortDay)),
    g
  );
}
function scenariosForScope(cohortDay, viewType, scope) {
  if (!state.data) return [];
  const g = filtersFor(scope || "scenarioTable");
  return preferSummaryRows(
    state.data.scenario.filter((r) =>
      passGlobal(r, g) && passCohort(r, cohortDay) && passViewType(r, viewType)
    ),
    g
  );
}
function buildScenarioList(rows, splitByProject, cohortDay, scope) {
  const agg = {};
  rows.forEach((r) => {
    const name = r["通知场景"] || "";
    if (!name) return;
    const viewType = r["查看类型"] || "";
    const project = r["项目代号"] || "";
    const k = (splitByProject ? project + "||" : "") + viewType + "||" + name;
    if (!agg[k]) {
      agg[k] = { project, name, viewType, showUsers: 0, showCount: 0, clickUsers: 0, clickCount: 0 };
    }
    const t = agg[k];
    t.showUsers += Number(r["通知用户数"]) || 0;
    t.showCount += Number(r["通知事件数"]) || 0;
    t.clickUsers += Number(r["点击用户数"]) || 0;
    t.clickCount += Number(r["点击事件数"]) || 0;
  });
  const baseByProject = {};
  const overviewCols = overviewByProject(
    cohortDay || ($("cohortDayScenarioTable") && $("cohortDayScenarioTable").value) || "",
    scope || "scenarioTable"
  );
  overviewCols.forEach((c) => {
    baseByProject[c.project] = Number(c.row["总活跃用户"]) || 0;
  });
  const baseFallback = overviewCols.length === 1 ? Number(overviewCols[0].row["总活跃用户"]) || 0 : 0;

  return Object.values(agg)
    .map((s) => {
      const base = baseByProject[s.project] || baseFallback || 0;
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

/** 按「查看类型 + 通知场景」同名对齐，跨项目对比（忽略空格差异） */
function buildScenarioMatrix(rows, cohortDay, scope) {
  const flat = buildScenarioList(rows, true, cohortDay, scope);
  const map = {};
  flat.forEach((s) => {
    const key = normSceneKey(s.viewType, s.name);
    if (!map[key]) map[key] = { key, viewType: s.viewType || "", name: s.name, byProject: {} };
    map[key].byProject[s.project || ""] = s;
  });
  const projects = orderProjects(projectCodesFrom(flat.map((s) => ({ "项目代号": s.project }))));
  const baseline = baselineValue();
  const rowsOut = Object.values(map).sort((a, b) => {
    const base = baseline !== NONE ? baseline : projects[0];
    const ca = base && a.byProject[base] ? a.byProject[base].ctrUser : Math.max(0, ...projects.map((p) => (a.byProject[p] && a.byProject[p].ctrUser) || 0));
    const cb = base && b.byProject[base] ? b.byProject[base].ctrUser : Math.max(0, ...projects.map((p) => (b.byProject[p] && b.byProject[p].ctrUser) || 0));
    return cb - ca;
  });
  return { projects, rows: rowsOut, baseline };
}

function orderProjects(projects) {
  const baseline = baselineValue();
  const list = [...projects].sort((a, b) => String(a).localeCompare(String(b), "zh"));
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
    { key: "人均通知(通知事件数/first_open)", kind: "avg", get: (s) => s.avgNotify },
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
  let cols = overviewByProject(day, "overview");
  if (!cols.length) {
    $("stats").innerHTML = '<p class="muted">当前条件下暂无 KPI</p>';
    return;
  }

  const baseline = baselineValue();
  cols = orderProjects(cols.map((c) => c.project)).map((p) => cols.find((c) => c.project === p)).filter(Boolean);

  const metricSets = cols.map((c) =>
    kpiMetricsFromOverview(c.row, retentionMetricsForProject(c.project, "overview"))
  );
  const baseIdx = baseline !== NONE
    ? cols.findIndex((c) => c.project === baseline)
    : -1;
  const baseMetrics = baseIdx >= 0 ? metricSets[baseIdx] : null;

  if (cols.length === 1) {
    $("stats").innerHTML = `<div class="kpi-cards">${metricSets[0].map((m) =>
      `<div class="stat"><div class="k">${m.key}</div><div class="v">${formatKpiValue(m)}</div></div>`
    ).join("")}</div>`;
    return;
  }

  const head = `<tr><th>指标</th>${cols.map((c) => {
    const tag = c.project === baseline ? "（基准）" : "";
    return `<th class="num">${c.project}${tag}</th>`;
  }).join("")}</tr>`;

  const body = metricSets[0].map((m0, i) => {
    const cells = cols.map((c, ci) => {
      const m = metricSets[ci][i];
      const main = formatKpiValue(m);
      if (!baseMetrics || c.project === baseline) {
        return `<td class="num">${main}</td>`;
      }
      const delta = formatDelta(m, baseMetrics[i]);
      return `<td class="num">${main}<div class="delta-line">${delta}</div></td>`;
    }).join("");
    return `<tr><td>${m0.key}</td>${cells}</tr>`;
  }).join("");

  $("stats").innerHTML = `<div class="table-wrap"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderScenarioBars() {
  const day = $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars").value;
  const rows = scenariosForScope(day, viewType, "scenarioBars");

  if (shouldCompareProjects(rows)) {
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
    : '<p class="muted">当前模块筛选下无场景点击率</p>';
}

function renderScenarioTable() {
  const day = $("cohortDayScenarioTable").value;
  const viewType = $("viewTypeScenarioTable").value;
  const rows = scenariosForScope(day, viewType, "scenarioTable");

  if (shouldCompareProjects(rows)) {
    $("scenarioTable").innerHTML = renderScenarioCompareDetail(buildScenarioMatrix(rows, day, "scenarioTable"));
    return;
  }

  const list = buildScenarioList(rows, true, day, "scenarioTable");
  $("scenarioTable").innerHTML = list.length
    ? `<div class="table-wrap"><table><thead><tr>
        <th>项目代号</th><th>查看类型</th><th>通知场景</th>
        <th class="num">通知用户数</th><th class="num">通知事件数</th>
        <th class="num">人均通知(通知事件数/first_open)</th>
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
    : '<p class="muted">当前模块筛选下无场景明细</p>';
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
  const el = $("baselineProject");
  if (!el) return;
  const meta = (state.data && state.data.meta) || {};
  const projects = meta.projects || [];
  const prev = el.value;
  fillSelect(el, [{ value: NONE, label: "无对比" }, ...projects.map((p) => ({ value: p, label: p }))], true);
  if (prev && [...el.options].some((o) => o.value === prev)) {
    el.value = prev;
  } else if (projects.length >= 2) {
    el.value = projects[0];
  } else {
    el.value = NONE;
  }
}

function syncFilters() {
  const meta = state.data.meta || {};
  const allOpt = { value: ALL, label: "全部" };
  const countryOpts = [allOpt, ...(meta.countries || []).map((v) => ({ value: v, label: v }))];
  const brandOpts = [allOpt, ...(meta.brands || []).map((v) => ({ value: v, label: v }))];
  const periodOpts = (meta.periods || []).map((v) => ({ value: v, label: v }));

  fillSelect($("project"), [allOpt, ...(meta.projects || [])], true);
  fillSelect($("country"), countryOpts, true);
  fillSelect($("brand"), brandOpts, true);
  fillSelect($("period"), periodOpts, true);
  if (!$("period").value && meta.periods && meta.periods[0]) $("period").value = meta.periods[0];
  if (!$("project").value) $("project").value = ALL;

  [
    "countryOverview", "countryScenarioBars", "countryScenarioTable"
  ].forEach((id) => fillSelect($(id), countryOpts, true));
  [
    "brandOverview", "brandScenarioBars", "brandScenarioTable"
  ].forEach((id) => fillSelect($(id), brandOpts, true));
  [
    "periodOverview", "periodScenarioBars", "periodScenarioTable"
  ].forEach((id) => {
    fillSelect($(id), [{ value: ALL, label: "跟随全局" }, ...periodOpts], true);
    if (!$(id).value) $(id).value = ALL;
  });

  const days = meta.cohortDays || [];
  const dayOpts = days.length ? [{ value: ALL, label: "全部" }, ...days.map((d) => ({ value: d, label: d }))] : [{ value: ALL, label: "全部" }];
  const viewOpts = meta.viewTypes && meta.viewTypes.length
    ? [{ value: ALL, label: "全部" }, ...meta.viewTypes.map((v) => ({ value: v, label: v }))]
    : [{ value: ALL, label: "全部" }];
  const defaultDay = preferDay0(days);

  ["cohortDayOverview", "cohortDayScenarioBars", "cohortDayScenarioTable"].forEach((id) => {
    fillSelect($(id), dayOpts, true);
    if (!$(id).value || $(id).value === ALL || $(id).value === "全部") $(id).value = defaultDay;
  });
  ["viewTypeScenarioBars", "viewTypeScenarioTable"].forEach((id) => {
    fillSelect($(id), viewOpts, true);
    if (!$(id).value) $(id).value = ALL;
  });
  syncBaselineOptions();
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
  ["project", "country", "brand", "period", "baselineProject"].forEach((id) => $(id).addEventListener("change", renderAll));

  [
    "countryOverview", "brandOverview", "periodOverview", "cohortDayOverview"
  ].forEach((id) => $(id).addEventListener("change", renderKpi));

  [
    "countryScenarioBars", "brandScenarioBars", "periodScenarioBars",
    "cohortDayScenarioBars", "viewTypeScenarioBars"
  ].forEach((id) => $(id).addEventListener("change", renderScenarioBars));

  [
    "countryScenarioTable", "brandScenarioTable", "periodScenarioTable",
    "cohortDayScenarioTable", "viewTypeScenarioTable"
  ].forEach((id) => $(id).addEventListener("change", renderScenarioTable));

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  fillSelect($("baselineProject"), [{ value: NONE, label: "无对比" }], false);
  renderAll();
}
bind();
