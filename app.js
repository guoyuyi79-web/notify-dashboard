const state = {
  catalog: { categories: [], projects: [] },
  payload: null,
  projectId: ""
};

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = "none"; }, 4200);
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

function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return "";
}

async function api(url, options) {
  const resp = await fetch(url, options);
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || resp.statusText || "request failed");
  return json;
}

function setStatus(text, cls) {
  const el = $("statusPill");
  el.className = "pill " + (cls || "");
  el.textContent = text;
}

function fillSelect(el, items, getValue, getLabel) {
  el.innerHTML = "";
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = getValue(item);
    opt.textContent = getLabel(item);
    el.appendChild(opt);
  });
}

function filteredProjects() {
  const cat = $("category").value;
  return state.catalog.projects.filter((p) => !cat || cat === "全部" || p.category === cat);
}

function renderProjectOptions() {
  const list = filteredProjects();
  fillSelect($("project"), list, (p) => p.id, (p) => `${p.name} (${p.id})${p.configured ? "" : " · 未配置"}`);
  if (list.length) {
    const exists = list.some((p) => p.id === state.projectId);
    state.projectId = exists ? state.projectId : list[0].id;
    $("project").value = state.projectId;
  }
  const meta = list.find((p) => p.id === $("project").value);
  $("projectMeta").textContent = meta
    ? `品类：${meta.category} · ${meta.configured ? "已配置 SCRIPT_URL" : "请在 Vercel 环境变量配置 PROJECT_" + meta.id.toUpperCase() + "_SCRIPT_URL"}`
    : "";
}

function currentOverviewRows() {
  const data = state.payload && state.payload.data;
  if (!data || !Array.isArray(data.overview)) return [];
  return data.overview;
}

function currentScenarioRows() {
  const data = state.payload && state.payload.data;
  if (!data || !Array.isArray(data.scenario)) return [];
  return data.scenario;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function syncDimensionFilters() {
  const overview = currentOverviewRows();
  const countries = unique(overview.map((r) => pick(r, ["国家", "country"])));
  const periods = unique(overview.map((r) => pick(r, ["日期", "period"])));

  const countryEl = $("country");
  const periodEl = $("period");
  const prevC = countryEl.value;
  const prevP = periodEl.value;

  fillSelect(countryEl, ["全部", ...countries], (x) => x, (x) => x);
  fillSelect(periodEl, periods, (x) => x, (x) => x);

  if ([...countryEl.options].some((o) => o.value === prevC)) countryEl.value = prevC;
  if ([...periodEl.options].some((o) => o.value === prevP)) periodEl.value = prevP;
  if (!periodEl.value && periods[0]) periodEl.value = periods[0];
}

function selectedOverview() {
  const country = $("country").value;
  const period = $("period").value;
  return currentOverviewRows().filter((r) => {
    const c = pick(r, ["国家", "country"]);
    const p = pick(r, ["日期", "period"]);
    const okC = !country || country === "全部" || c === country;
    const okP = !period || p === period;
    return okC && okP;
  });
}

function selectedScenarios() {
  const country = $("country").value;
  const period = $("period").value;
  return currentScenarioRows().filter((r) => {
    const c = pick(r, ["国家", "country"]);
    const p = pick(r, ["日期", "period"]);
    const okC = !country || country === "全部" || c === country;
    const okP = !period || p === period;
    return okC && okP;
  });
}

function aggregateOverview(rows) {
  if (!rows.length) return null;
  if ($("country").value !== "全部") return rows[0];

  // 国家=全部时：若已有「全部」行优先用；否则对绝对数求和，率重算
  const allRow = rows.find((r) => pick(r, ["国家", "country"]) === "全部");
  if (allRow) return allRow;

  const sumKeys = ["总活跃用户", "授权数", "发送通知用户数", "发通知总数", "点击用户数", "点击事件数"];
  const out = { ...rows[0], 国家: "全部" };
  sumKeys.forEach((k) => { out[k] = 0; });
  rows.forEach((r) => {
    sumKeys.forEach((k) => { out[k] += Number(r[k]) || 0; });
  });
  const base = Number(out["总活跃用户"]) || 0;
  const auth = Number(out["授权数"]) || 0;
  const showUsers = Number(out["发送通知用户数"]) || 0;
  const showCount = Number(out["发通知总数"]) || 0;
  const clickUsers = Number(out["点击用户数"]) || 0;
  const clickCount = Number(out["点击事件数"]) || 0;
  out["授权率"] = base ? auth / base : 0;
  out["通知渗透率"] = auth ? showUsers / auth : 0;
  out["人均通知数"] = auth ? showCount / auth : 0;
  out["点击率-用户"] = showUsers ? clickUsers / showUsers : 0;
  out["点击率-事件"] = showCount ? clickCount / showCount : 0;
  out["人均点击"] = clickUsers ? clickCount / clickUsers : 0;
  return out;
}

function renderStats() {
  const row = aggregateOverview(selectedOverview());
  const box = $("stats");
  if (!row) {
    box.innerHTML = '<div class="panel muted">暂无总览数据。请先配置项目并点击「拉取 GA4 并更新」。</div>';
    return;
  }
  const items = [
    ["总活跃用户", num(row["总活跃用户"])],
    ["授权数", num(row["授权数"])],
    ["发送通知用户", num(row["发送通知用户数"])],
    ["点击用户", num(row["点击用户数"])]
  ];
  box.innerHTML = items.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
}

function renderRates() {
  const row = aggregateOverview(selectedOverview());
  const el = $("rateTable");
  if (!row) { el.innerHTML = '<p class="muted">无数据</p>'; return; }
  const rows = [
    ["授权率", pct(row["授权率"])],
    ["通知渗透率", pct(row["通知渗透率"])],
    ["人均通知数", Number(row["人均通知数"] || 0).toFixed(2)],
    ["点击率-用户", pct(row["点击率-用户"])],
    ["点击率-事件", pct(row["点击率-事件"])],
    ["人均点击", Number(row["人均点击"] || 0).toFixed(2)],
    ["DAY0卸载率", pct(row["DAY0卸载率"])]
  ];
  el.innerHTML = `<table><thead><tr><th>指标</th><th class="num">值</th></tr></thead><tbody>${
    rows.map(([k, v]) => `<tr><td>${k}</td><td class="num">${v}</td></tr>`).join("")
  }</tbody></table>`;
}

function renderScenarios() {
  const rows = selectedScenarios()
    .map((r) => ({
      name: pick(r, ["通知场景", "scenario"]),
      showUsers: Number(pick(r, ["通知用户数"])) || 0,
      showCount: Number(pick(r, ["通知事件数"])) || 0,
      clickUsers: Number(pick(r, ["点击用户数"])) || 0,
      clickCount: Number(pick(r, ["点击事件数"])) || 0,
      ctrUser: Number(pick(r, ["点击率(用户)"])) || 0,
      ctrEvent: Number(pick(r, ["点击率(事件)"])) || 0,
      avgClick: Number(pick(r, ["人均点击"])) || 0,
      avgNotify: Number(String(pick(r, ["人均通知(通知事件数/授权成功用户数)", "人均通知"]) || 0)) || 0
    }))
    .filter((r) => r.name)
    .sort((a, b) => b.ctrUser - a.ctrUser);

  const max = Math.max(...rows.map((r) => r.ctrUser), 0.0001);
  $("scenarioBars").innerHTML = rows.length
    ? rows.map((r) => {
        const w = Math.max(4, Math.round((r.ctrUser / max) * 100));
        return `<div class="bar-row"><div>${r.name}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div><div class="num">${pct(r.ctrUser)}</div></div>`;
      }).join("")
    : '<p class="muted">无场景数据</p>';

  $("scenarioTable").innerHTML = rows.length
    ? `<table>
      <thead><tr>
        <th>通知场景</th><th class="num">通知用户数</th><th class="num">通知事件数</th>
        <th class="num">点击用户数</th><th class="num">点击事件数</th>
        <th class="num">点击率(用户)</th><th class="num">点击率(事件)</th>
      </tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${r.name}</td><td class="num">${num(r.showUsers)}</td><td class="num">${num(r.showCount)}</td>
        <td class="num">${num(r.clickUsers)}</td><td class="num">${num(r.clickCount)}</td>
        <td class="num">${pct(r.ctrUser)}</td><td class="num">${pct(r.ctrEvent)}</td>
      </tr>`).join("")}</tbody></table>`
    : '<p class="muted">无场景数据</p>';
}

function renderAll() {
  syncDimensionFilters();
  renderStats();
  renderRates();
  renderScenarios();
}

async function loadCatalog() {
  const data = await api("/api/projects");
  state.catalog = data;
  const cats = ["全部", ...(data.categories || [])];
  fillSelect($("category"), cats, (x) => x, (x) => x);
  renderProjectOptions();
}

async function loadProjectData() {
  const id = $("project").value;
  if (!id) return;
  state.projectId = id;
  setStatus("加载中…", "run");
  $("btnLoad").disabled = true;
  try {
    const json = await api("/api/data?id=" + encodeURIComponent(id));
    state.payload = json;
    const st = json.data && json.data.status && json.data.status.state;
    const stateVal = st && st.value ? st.value : "idle";
    setStatus(`${id} · ${stateVal}`, stateVal === "error" ? "err" : stateVal === "running" ? "run" : "ok");
    renderAll();
  } catch (err) {
    state.payload = null;
    setStatus(String(err.message || err), "err");
    toast(String(err.message || err));
    renderAll();
  } finally {
    $("btnLoad").disabled = false;
  }
}

async function pullProject() {
  const id = $("project").value;
  if (!id) return;
  if (!confirm(`确认对项目 ${id} 拉取 GA4？\n会消耗该项目的 GA4 API 配额。`)) return;
  setStatus("拉取中…", "run");
  $("btnPull").disabled = true;
  $("btnLoad").disabled = true;
  try {
    const json = await api("/api/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, sendEmail: false })
    });
    toast(json.ok === false ? (json.error || "拉取失败") : `${id} 拉取完成`);
    await loadProjectData();
  } catch (err) {
    setStatus(String(err.message || err), "err");
    toast(String(err.message || err));
  } finally {
    $("btnPull").disabled = false;
    $("btnLoad").disabled = false;
  }
}

function bind() {
  $("category").addEventListener("change", () => { renderProjectOptions(); loadProjectData(); });
  $("project").addEventListener("change", () => loadProjectData());
  $("country").addEventListener("change", renderAll);
  $("period").addEventListener("change", renderAll);
  $("btnLoad").addEventListener("click", loadProjectData);
  $("btnPull").addEventListener("click", pullProject);
}

async function main() {
  bind();
  try {
    await loadCatalog();
    await loadProjectData();
  } catch (err) {
    setStatus(String(err.message || err), "err");
    toast(String(err.message || err));
  }
}

main();