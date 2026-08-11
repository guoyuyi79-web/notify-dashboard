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
  return (n <= 1 ? n * 100 : n).toFixed(1) + "%";
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
function filters() {
  return {
    project: $("project").value || "全部",
    country: $("country").value || "全部",
    brand: $("brand").value || "全部",
    period: $("period").value || "",
    cohortDay: $("cohortDay").value || "全部",
    viewType: $("viewType").value || "全部"
  };
}
function filterLabel(f) {
  const parts = [
    f.project !== "全部" ? f.project : null,
    f.country !== "全部" ? f.country : null,
    f.brand !== "全部" ? f.brand : null,
    f.period || null,
    f.cohortDay !== "全部" ? f.cohortDay : null,
    f.viewType !== "全部" ? f.viewType : null
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "全部条件";
}
function matchDim(rowVal, selected, emptyAsAll) {
  if (!selected || selected === "全部") return true;
  const v = rowVal === undefined || rowVal === null || String(rowVal).trim() === ""
    ? (emptyAsAll ? "全部" : "")
    : String(rowVal).trim();
  return v === selected;
}
/** overview：不含「查看类型」列，不受查看类型筛选影响 */
function passOverviewFilters(r, f) {
  return matchDim(r["项目代号"], f.project, false)
    && matchDim(r["国家"], f.country, false)
    && matchDim(r["设备品牌"] || "全部", f.brand, true)
    && (!f.period || String(r["日期"] || "") === f.period)
    && matchDim(r["队列天数"], f.cohortDay, false);
}
/** scenario：含查看类型，筛选全部生效（缺队列天数/查看类型的旧数据在指定筛选时会被排除） */
function passScenarioFilters(r, f) {
  if (!matchDim(r["项目代号"], f.project, false)) return false;
  if (!matchDim(r["国家"], f.country, false)) return false;
  if (!matchDim(r["设备品牌"] || "全部", f.brand, true)) return false;
  if (f.period && String(r["日期"] || "") !== f.period) return false;
  if (f.cohortDay && f.cohortDay !== "全部") {
    if (String(r["队列天数"] || "") !== f.cohortDay) return false;
  }
  if (f.viewType && f.viewType !== "全部") {
    if (String(r["查看类型"] || "") !== f.viewType) return false;
  }
  return true;
}
function selectedOverview(f) {
  if (!state.data) return [];
  return state.data.overview.filter((r) => passOverviewFilters(r, f));
}
function selectedScenario(f) {
  if (!state.data) return [];
  return state.data.scenario.filter((r) => passScenarioFilters(r, f));
}
function pickOverviewRow(rows, f) {
  if (!rows.length) return null;
  const country = f.country;
  const brand = f.brand;
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
  out["通知渗透率"] = auth ? showUsers / auth : 0;
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
function buildScenarioList(rows) {
  const agg = {};
  rows.forEach((r) => {
    const name = r["通知场景"] || "";
    if (!name) return;
    const viewType = r["查看类型"] || "";
    const k = viewType + "||" + name;
    if (!agg[k]) {
      agg[k] = {
        name,
        viewType,
        showUsers: 0,
        showCount: 0,
        clickUsers: 0,
        clickCount: 0
      };
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
    .sort((a, b) => b.ctrUser - a.ctrUser);
}
function setSectionTitles(label) {
  const text = label ? `· ${label}` : "";
  $("titleScenarioBars").textContent = text;
  $("titleRates").textContent = text;
  $("titleScenarioTable").textContent = text;
  $("filterHint").textContent = state.data
    ? `当前筛选：${label} → 已同步到上方 KPI、总览效率、场景点击率与场景明细`
    : "";
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
function render() {
  const f = filters();
  const label = filterLabel(f);
  setSectionTitles(label);

  const overviewRows = selectedOverview(f);
  const scenarioRows = selectedScenario(f);
  const row = pickOverviewRow(overviewRows, f);
  const scenarioList = buildScenarioList(scenarioRows);

  if (!row) {
    $("stats").innerHTML = '<div class="panel muted">当前筛选下暂无总览数据。请调整筛选或重新加载 Sheet。</div>';
    $("rateTable").innerHTML = '<p class="muted">当前筛选下无总览效率数据</p>';
  } else {
    $("stats").innerHTML = [
      ["总活跃用户", num(row["总活跃用户"])],
      ["授权数", num(row["授权数"])],
      ["发送通知用户", num(row["发送通知用户数"])],
      ["点击用户", num(row["点击用户数"])]
    ].map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

    const uninstallKey = Object.keys(row).find((k) => /卸载率/.test(k)) || "卸载率";
    const rates = [
      ["授权率", pct(row["授权率"])],
      ["通知渗透率", pct(row["通知渗透率"])],
      ["人均通知数", Number(row["人均通知数"] || 0).toFixed(2)],
      ["点击率-用户", pct(row["点击率-用户"])],
      ["点击率-事件", pct(row["点击率-事件"])],
      ["人均点击", Number(row["人均点击"] || 0).toFixed(2)],
      [uninstallKey.replace(/^D\d+/, "") === "卸载率" ? uninstallKey : uninstallKey, pct(row[uninstallKey])]
    ];
    $("rateTable").innerHTML = `<table><thead><tr><th>指标</th><th class="num">值</th></tr></thead><tbody>${
      rates.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join("")
    }</tbody></table>`;
  }

  const max = Math.max(...scenarioList.map((s) => s.ctrUser), 0.0001);
  $("scenarioBars").innerHTML = scenarioList.length
    ? scenarioList.map((s) => {
        const w = Math.max(4, Math.round((s.ctrUser / max) * 100));
        const name = s.viewType ? `${s.viewType} · ${s.name}` : s.name;
        return `<div class="bar-row"><div title="${name}">${name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="num">${pct(s.ctrUser)}</div></div>`;
      }).join("")
    : '<p class="muted">当前筛选下无场景点击率数据（检查队列天数/国家/查看类型是否在 panel_scenario 中有对应行）</p>';

  $("scenarioTable").innerHTML = scenarioList.length
    ? `<table><thead><tr>
        <th>查看类型</th><th>通知场景</th><th class="num">通知用户数</th><th class="num">通知事件数</th>
        <th class="num">点击用户数</th><th class="num">点击事件数</th>
        <th class="num">点击率(用户)</th><th class="num">点击率(事件)</th>
      </tr></thead><tbody>${scenarioList.map((s) => `<tr>
        <td>${s.viewType || "—"}</td><td>${s.name}</td><td class="num">${num(s.showUsers)}</td><td class="num">${num(s.showCount)}</td>
        <td class="num">${num(s.clickUsers)}</td><td class="num">${num(s.clickCount)}</td>
        <td class="num">${pct(s.ctrUser)}</td><td class="num">${pct(s.ctrEvent)}</td>
      </tr>`).join("")}</tbody></table>`
    : '<p class="muted">当前筛选下无场景明细</p>';

  renderSources();
}
function syncFilters() {
  const meta = state.data.meta || {};
  fillSelect($("project"), ["全部", ...(meta.projects || [])], true);
  fillSelect($("country"), ["全部", ...(meta.countries || [])], true);
  fillSelect($("brand"), ["全部", ...(meta.brands || [])], true);
  fillSelect($("period"), meta.periods || [], true);
  const days = meta.cohortDays || [];
  fillSelect($("cohortDay"), days.length ? ["全部", ...days] : ["全部"], true);
  fillSelect($("viewType"), meta.viewTypes && meta.viewTypes.length ? ["全部", ...meta.viewTypes] : ["全部"], true);
  if (!$("period").value && meta.periods && meta.periods[0]) $("period").value = meta.periods[0];
  // 默认选 Day0（若有），保证下方图表不会混多天
  if (days.includes("Day0")) $("cohortDay").value = "Day0";
  else if (days.length && (!$("cohortDay").value || $("cohortDay").value === "全部")) $("cohortDay").value = days[0];
}
async function loadSheets() {
  const urls = parseUrlsFromTextarea();
  if (!urls.length) return toast("请先粘贴至少一个 Google Sheet 链接（每行一个）");
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
    render();
    const n = json.meta.sourceCount || (json.sources || []).length;
    const errN = (json.errors || []).length;
    setStatus(`已加载 ${n} 个项目 · ${json.meta.overviewRows}/${json.meta.scenarioRows} 行` + (errN ? ` · ${errN} 失败` : ""), errN ? "warn" : "ok");
    toast(errN ? `完成：成功 ${n}，失败 ${errN}` : `已加载并清洗 ${n} 个项目表格`);
  } catch (err) {
    state.data = null;
    setStatus(String(err.message || err), "err");
    toast(String(err.message || err));
    render();
  } finally {
    $("btnLoad").disabled = false;
  }
}
function bind() {
  $("btnLoad").addEventListener("click", loadSheets);
  ["project", "country", "brand", "period", "cohortDay", "viewType"].forEach((id) => {
    $(id).addEventListener("change", render);
  });
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("notify_sheet_url");
  if (saved) $("sheetUrls").value = saved;
  render();
}
bind();
