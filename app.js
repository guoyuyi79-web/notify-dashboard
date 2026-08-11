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
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
  if (prev && values.includes(prev)) el.value = prev;
}
function parseUrlsFromTextarea() {
  return String($("sheetUrls").value || "")
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function globalFilters() {
  return {
    project: $("project").value || "全部",
    country: $("country").value || "全部",
    brand: $("brand").value || "全部",
    period: $("period").value || ""
  };
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
  if (!cohortDay || cohortDay === "全部") return true;
  return String(r["队列天数"] || "") === cohortDay;
}
function passViewType(r, viewType) {
  if (!viewType || viewType === "全部") return true;
  return String(r["查看类型"] || "") === viewType;
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
  // 与脚本一致：DayN 发送通知用户 / Day0 first_open（总活跃）
  out["通知渗透率"] = base ? showUsers / base : 0;
  out["人均通知数"] = auth ? showCount / auth : 0;
  out["点击率-用户"] = showUsers ? clickUsers / showUsers : 0;
  out["点击率-事件"] = showCount ? clickCount / showCount : 0;
  out["人均点击"] = clickUsers ? clickCount / clickUsers : 0;
  const uninstallKey = Object.keys(rows[0]).find((k) => /卸载率/.test(k));
  if (uninstallKey) {
    let removeEst = 0;
    let baseSum = 0;
    rows.forEach((r) => {
      const b = Number(r["总活跃用户"]) || 0;
      const rate = Number(r[uninstallKey]) || 0;
      removeEst += b * rate;
      baseSum += b;
    });
    out[uninstallKey] = baseSum ? removeEst / baseSum : 0;
  }
  return out;
}

/** 项目=全部时按项目拆开，便于对比；单项目则返回 1 列 */
function overviewByProject(cohortDay) {
  const g = globalFilters();
  if (g.project && g.project !== "全部") {
    const row = pickOverviewRow(overviewForCohort(cohortDay), g);
    return row ? [{ project: g.project, row }] : [];
  }
  const projects = (state.data && state.data.meta && state.data.meta.projects) || [];
  const list = projects.length
    ? projects
    : [...new Set((state.data.overview || []).map((r) => r["项目代号"]).filter(Boolean))];
  return list.map((project) => {
    const gOne = { ...g, project };
    const rows = (state.data.overview || []).filter((r) => passGlobal(r, gOne) && passCohort(r, cohortDay));
    const row = pickOverviewRow(rows, gOne);
    return row ? { project, row } : null;
  }).filter(Boolean);
}

function rateRowsFromOverview(row) {
  const uninstallKey = Object.keys(row).find((k) => /卸载率/.test(k)) || "卸载率";
  const base = Number(row["总活跃用户"]) || 0;
  const showUsers = Number(row["发送通知用户数"]) || 0;
  const penetration = base ? showUsers / base : 0;
  return [
    ["授权率", pct(row["授权率"])],
    ["通知渗透率", pct(penetration)],
    ["人均通知数", Number(row["人均通知数"] || 0).toFixed(2)],
    ["点击率-用户", pct(row["点击率-用户"])],
    ["点击率-事件", pct(row["点击率-事件"])],
    ["人均点击", Number(row["人均点击"] || 0).toFixed(2)],
    [uninstallKey, pct(row[uninstallKey])]
  ];
}

function kpiRowsFromOverview(row) {
  return [
    ["总活跃用户", num(row["总活跃用户"])],
    ["授权数", num(row["授权数"])],
    ["发送通知用户", num(row["发送通知用户数"])],
    ["点击用户", num(row["点击用户数"])]
  ];
}

function overviewForCohort(cohortDay) {
  if (!state.data) return [];
  const g = globalFilters();
  return state.data.overview.filter((r) => passGlobal(r, g) && passCohort(r, cohortDay));
}
function scenariosForLocal(cohortDay, viewType) {
  if (!state.data) return [];
  const g = globalFilters();
  return state.data.scenario.filter((r) =>
    passGlobal(r, g) && passCohort(r, cohortDay) && passViewType(r, viewType)
  );
}
function buildScenarioList(rows, splitByProject) {
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
  return Object.values(agg)
    .map((s) => ({
      ...s,
      ctrUser: s.showUsers ? s.clickUsers / s.showUsers : 0,
      ctrEvent: s.showCount ? s.clickCount / s.showCount : 0
    }))
    .sort((a, b) => {
      const pc = String(a.project || "").localeCompare(String(b.project || ""), "zh");
      if (pc) return pc;
      return b.ctrUser - a.ctrUser;
    });
}

function renderKpi() {
  const day = $("cohortDayOverview").value;
  const cols = overviewByProject(day);
  if (!cols.length) {
    $("stats").innerHTML = '<div class="panel muted">当前条件下暂无 KPI</div>';
    return;
  }
  if (cols.length === 1) {
    $("stats").innerHTML = kpiRowsFromOverview(cols[0].row)
      .map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
    return;
  }
  const metrics = kpiRowsFromOverview(cols[0].row).map(([k]) => k);
  const head = `<tr><th>指标</th>${cols.map((c) => `<th class="num">${c.project}</th>`).join("")}</tr>`;
  const body = metrics.map((metric, i) => {
    const cells = cols.map((c) => `<td class="num">${kpiRowsFromOverview(c.row)[i][1]}</td>`).join("");
    return `<tr><td>${metric}</td>${cells}</tr>`;
  }).join("");
  $("stats").innerHTML = `<div class="panel compare-panel"><div class="table-wrap"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div></div>`;
}

function renderRates() {
  const day = $("cohortDayRates").value;
  const cols = overviewByProject(day);
  if (!cols.length) {
    $("rateTable").innerHTML = '<p class="muted">当前模块筛选下无总览效率</p>';
    return;
  }
  if (cols.length === 1) {
    const rates = rateRowsFromOverview(cols[0].row);
    $("rateTable").innerHTML = `<table><thead><tr><th>指标</th><th class="num">${cols[0].project}</th></tr></thead><tbody>${
      rates.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join("")
    }</tbody></table>`;
    return;
  }
  const metrics = rateRowsFromOverview(cols[0].row).map(([k]) => k);
  const head = `<tr><th>指标</th>${cols.map((c) => `<th class="num">${c.project}</th>`).join("")}</tr>`;
  const body = metrics.map((metric, i) => {
    const cells = cols.map((c) => `<td class="num">${rateRowsFromOverview(c.row)[i][1]}</td>`).join("");
    return `<tr><td>${metric}</td>${cells}</tr>`;
  }).join("");
  $("rateTable").innerHTML = `<div class="table-wrap"><table class="compare-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderScenarioBars() {
  const day = $("cohortDayScenarioBars").value;
  const viewType = $("viewTypeScenarioBars").value;
  const split = !$("project").value || $("project").value === "全部";
  const list = buildScenarioList(scenariosForLocal(day, viewType), split);
  const max = Math.max(...list.map((s) => s.ctrUser), 0.0001);
  $("scenarioBars").innerHTML = list.length
    ? list.map((s) => {
        const w = Math.max(4, Math.round((s.ctrUser / max) * 100));
        const parts = [s.project, s.viewType, s.name].filter(Boolean);
        const name = parts.join(" · ");
        return `<div class="bar-row ${split ? "bar-row-wide" : ""}"><div title="${name}">${name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="num">${pct(s.ctrUser)}</div></div>`;
      }).join("")
    : '<p class="muted">当前模块筛选下无场景点击率</p>';
}

function renderScenarioTable() {
  const day = $("cohortDayScenarioTable").value;
  const viewType = $("viewTypeScenarioTable").value;
  const split = !$("project").value || $("project").value === "全部";
  const list = buildScenarioList(scenariosForLocal(day, viewType), split);
  $("scenarioTable").innerHTML = list.length
    ? `<table><thead><tr>
        <th>项目代号</th><th>查看类型</th><th>通知场景</th><th class="num">通知用户数</th><th class="num">通知事件数</th>
        <th class="num">点击用户数</th><th class="num">点击事件数</th>
        <th class="num">点击率(用户)</th><th class="num">点击率(事件)</th>
      </tr></thead><tbody>${list.map((s) => `<tr>
        <td>${s.project || "—"}</td><td>${s.viewType || "—"}</td><td>${s.name}</td><td class="num">${num(s.showUsers)}</td><td class="num">${num(s.showCount)}</td>
        <td class="num">${num(s.clickUsers)}</td><td class="num">${num(s.clickCount)}</td>
        <td class="num">${pct(s.ctrUser)}</td><td class="num">${pct(s.ctrEvent)}</td>
      </tr>`).join("")}</tbody></table>`
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
  renderRates();
  renderScenarioBars();
  renderScenarioTable();
  renderSources();
}

function preferDay0(days) {
  if (days.includes("Day0")) return "Day0";
  return days[0] || "全部";
}

function syncFilters() {
  const meta = state.data.meta || {};
  fillSelect($("project"), ["全部", ...(meta.projects || [])], true);
  fillSelect($("country"), ["全部", ...(meta.countries || [])], true);
  fillSelect($("brand"), ["全部", ...(meta.brands || [])], true);
  fillSelect($("period"), meta.periods || [], true);
  if (!$("period").value && meta.periods && meta.periods[0]) $("period").value = meta.periods[0];

  const days = meta.cohortDays || [];
  const dayOpts = days.length ? ["全部", ...days] : ["全部"];
  const viewOpts = meta.viewTypes && meta.viewTypes.length ? ["全部", ...meta.viewTypes] : ["全部"];
  const defaultDay = preferDay0(days);

  [
    "cohortDayOverview",
    "cohortDayRates",
    "cohortDayScenarioBars",
    "cohortDayScenarioTable"
  ].forEach((id) => {
    fillSelect($(id), dayOpts, true);
    if (!$(id).value || $(id).value === "全部") $(id).value = defaultDay;
  });
  ["viewTypeScenarioBars", "viewTypeScenarioTable"].forEach((id) => {
    fillSelect($(id), viewOpts, true);
  });
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
  ["project", "country", "brand", "period"].forEach((id) => $(id).addEventListener("change", renderAll));

  $("cohortDayOverview").addEventListener("change", renderKpi);
  $("cohortDayRates").addEventListener("change", renderRates);

  // 两个场景模块可独立筛选；也可选同步——这里独立，互不影响
  $("cohortDayScenarioBars").addEventListener("change", renderScenarioBars);
  $("viewTypeScenarioBars").addEventListener("change", renderScenarioBars);
  $("cohortDayScenarioTable").addEventListener("change", renderScenarioTable);
  $("viewTypeScenarioTable").addEventListener("change", renderScenarioTable);

  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  renderAll();
}
bind();
