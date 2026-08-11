function extractSpreadsheetId(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  if (/^[a-zA-Z0-9-_]{20,}$/.test(text)) return text;
  const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : '';
}

function parseUrlList(req) {
  const list = [];
  const push = (v) => {
    String(v || '')
      .split(/[\n,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((s) => list.push(s));
  };
  push(req.query.url);
  push(req.query.urls);
  if (Array.isArray(req.query.url)) req.query.url.forEach(push);
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        const j = JSON.parse(req.body);
        if (j.url) push(j.url);
        if (j.urls) (Array.isArray(j.urls) ? j.urls : [j.urls]).forEach(push);
      } catch (_) {
        push(req.body);
      }
    } else if (typeof req.body === 'object') {
      if (req.body.url) push(req.body.url);
      if (req.body.urls) (Array.isArray(req.body.urls) ? req.body.urls : [req.body.urls]).forEach(push);
    }
  }
  const ids = [];
  const seen = new Set();
  list.forEach((item) => {
    const id = extractSpreadsheetId(item);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push({ id, url: item });
  });
  return ids;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let i = 0;
  let inQuotes = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      cell += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { row.push(cell); cell = ''; i += 1; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    cell += ch; i += 1;
  }
  row.push(cell);
  if (row.length > 1 || String(row[0] || '').trim() !== '') rows.push(row);
  return rows;
}

function rowsToObjects(matrix) {
  if (!matrix || !matrix.length) return [];
  const headers = matrix[0].map((h) => String(h || '').trim());
  const out = [];
  for (let r = 1; r < matrix.length; r++) {
    const obj = {};
    let empty = true;
    for (let c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      const v = matrix[r][c];
      if (v !== undefined && v !== null && String(v).trim() !== '') empty = false;
      obj[headers[c]] = v;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

function looksLikeHtml(text) {
  const t = String(text || '').slice(0, 200).toLowerCase();
  return t.includes('<!doctype') || t.includes('<html') || t.includes('sign in');
}

async function fetchSheetCsv(id, sheetName) {
  const url =
    'https://docs.google.com/spreadsheets/d/' +
    encodeURIComponent(id) +
    '/gviz/tq?tqx=out:csv&sheet=' +
    encodeURIComponent(sheetName);
  const resp = await fetch(url, { redirect: 'follow' });
  const text = await resp.text();
  if (!resp.ok || looksLikeHtml(text)) {
    throw new Error(
      '无法读取工作表「' + sheetName + '」(id=' + id.slice(0, 8) + '…)。请确认已共享为「知道链接的任何人=查看者」且存在该表'
    );
  }
  return rowsToObjects(parseCsv(text));
}

function cleanOverview(rows) {
  return (rows || []).map((r) => {
    const o = { ...r };
    const numKeys = ['总活跃用户', '授权数', '发送通知用户数', '发通知总数', '点击用户数', '点击事件数'];
    numKeys.forEach((k) => {
      if (o[k] !== undefined && o[k] !== '') o[k] = Number(String(o[k]).replace(/,/g, '')) || 0;
    });
    const rateKeys = ['授权率', '通知渗透率', '点击率-用户', '点击率-事件'];
    rateKeys.forEach((k) => {
      if (o[k] === undefined || o[k] === '') return;
      const s = String(o[k]).trim();
      if (s.endsWith('%')) o[k] = Number(s.replace('%', '')) / 100;
      else o[k] = Number(s) || 0;
    });
    Object.keys(o).forEach((k) => {
      if (!/卸载率/.test(k)) return;
      if (o[k] === undefined || o[k] === '') return;
      const s = String(o[k]).trim();
      if (s.endsWith('%')) o[k] = Number(s.replace('%', '')) / 100;
      else o[k] = Number(s) || 0;
    });
    ['人均通知数', '人均点击'].forEach((k) => {
      if (o[k] !== undefined && o[k] !== '') o[k] = Number(o[k]) || 0;
    });
    return o;
  });
}

function cleanScenario(rows) {
  return (rows || []).map((r) => {
    const o = { ...r };
    ['通知用户数', '通知事件数', '点击用户数', '点击事件数'].forEach((k) => {
      if (o[k] !== undefined && o[k] !== '') o[k] = Number(String(o[k]).replace(/,/g, '')) || 0;
    });
    Object.keys(o).forEach((k) => {
      if (k.includes('点击率') || k.includes('人均')) {
        const s = String(o[k] ?? '').trim();
        if (!s) return;
        if (s.endsWith('%')) o[k] = Number(s.replace('%', '')) / 100;
        else o[k] = Number(s) || 0;
      }
    });
    return o;
  });
}

async function loadOneSheet(entry, overviewName, scenarioName) {
  const [overviewRaw, scenarioRaw] = await Promise.all([
    fetchSheetCsv(entry.id, overviewName),
    fetchSheetCsv(entry.id, scenarioName)
  ]);
  const overview = cleanOverview(overviewRaw).map((r) => ({
    ...r,
    _spreadsheetId: entry.id
  }));
  const scenario = cleanScenario(scenarioRaw).map((r) => ({
    ...r,
    _spreadsheetId: entry.id
  }));
  return { id: entry.id, url: entry.url, overview, scenario };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const entries = parseUrlList(req);
    if (!entries.length) {
      return res.status(400).json({ error: '请提供至少一个 Google Sheet 链接（可多行/逗号分隔）' });
    }

    const overviewName = (req.query && req.query.overview) || 'panel_overview';
    const scenarioName = (req.query && req.query.scenario) || 'panel_scenario';

    const settled = await Promise.allSettled(
      entries.map((e) => loadOneSheet(e, overviewName, scenarioName))
    );

    const sources = [];
    const errors = [];
    let overview = [];
    let scenario = [];

    settled.forEach((item, idx) => {
      if (item.status === 'fulfilled') {
        sources.push({
          spreadsheetId: item.value.id,
          url: item.value.url,
          overviewRows: item.value.overview.length,
          scenarioRows: item.value.scenario.length
        });
        overview = overview.concat(item.value.overview);
        scenario = scenario.concat(item.value.scenario);
      } else {
        errors.push({
          url: entries[idx].url,
          spreadsheetId: entries[idx].id,
          error: String(item.reason && item.reason.message ? item.reason.message : item.reason)
        });
      }
    });

    if (!sources.length) {
      return res.status(500).json({
        ok: false,
        error: '全部链接加载失败',
        errors
      });
    }

    const projects = [...new Set(overview.map((r) => r['项目代号']).filter(Boolean))];
    const countries = [...new Set(overview.map((r) => r['国家']).filter(Boolean))];
    const brands = [...new Set(overview.map((r) => r['设备品牌'] || '全部').filter(Boolean))];
    const periods = [...new Set(overview.map((r) => r['日期']).filter(Boolean))];
    const cohortDays = [...new Set(overview.map((r) => r['队列天数']).filter(Boolean))];
    const viewTypes = [...new Set(scenario.map((r) => r['查看类型']).filter(Boolean))];

    return res.status(200).json({
      ok: true,
      sources,
      errors,
      sheets: { overview: overviewName, scenario: scenarioName },
      meta: {
        projects,
        countries,
        brands,
        periods,
        cohortDays,
        viewTypes,
        overviewRows: overview.length,
        scenarioRows: scenario.length,
        sourceCount: sources.length
      },
      overview,
      scenario
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err && err.message ? err.message : err) });
  }
};
