const fs = require('fs');
const path = require('path');

function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'projects.config.json'), 'utf8'));
}

function envFor(id) {
  const key = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    scriptUrl: process.env['PROJECT_' + key + '_SCRIPT_URL'] || '',
    pullToken: process.env['PROJECT_' + key + '_PULL_TOKEN'] || ''
  };
}

async function fetchScript(scriptUrl, query) {
  const url = new URL(scriptUrl);
  Object.keys(query || {}).forEach((k) => url.searchParams.set(k, query[k]));
  const resp = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: { Accept: 'application/json' }
  });
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch (e) {
    throw new Error('Apps Script returned non-JSON. Deploy web app and ensure action=export works. Body: ' + text.slice(0, 200));
  }
  return json;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const id = String((req.query && req.query.id) || '');
    if (!id) return res.status(400).json({ error: 'missing id' });

    const cfg = loadConfig();
    const meta = (cfg.projects || []).find((p) => p.id === id);
    if (!meta || meta.enabled === false) return res.status(404).json({ error: 'project not found or disabled' });

    const env = envFor(id);
    if (!env.scriptUrl) {
      return res.status(400).json({
        error: 'PROJECT_' + id.toUpperCase() + '_SCRIPT_URL not set in Vercel env'
      });
    }

    const raw = await fetchScript(env.scriptUrl, { action: 'export' });
    if (raw && raw.ok === false) {
      return res.status(502).json({ error: raw.error || 'export failed' });
    }
    return res.status(200).json({
      project: { id: meta.id, name: meta.name, category: meta.category },
      data: (raw && raw.data) ? raw.data : raw
    });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};