const fs = require('fs');
const path = require('path');

function loadConfig() {
  const p = path.join(process.cwd(), 'projects.config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function projectEnv(id) {
  const key = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    scriptUrl: process.env['PROJECT_' + key + '_SCRIPT_URL'] || '',
    pullToken: process.env['PROJECT_' + key + '_PULL_TOKEN'] || '',
    configured: !!(process.env['PROJECT_' + key + '_SCRIPT_URL'])
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const cfg = loadConfig();
    const projects = (cfg.projects || [])
      .filter((p) => p.enabled !== false)
      .map((p) => {
        const env = projectEnv(p.id);
        return {
          id: p.id,
          name: p.name || p.id,
          category: p.category || '其他',
          note: p.note || '',
          configured: env.configured
        };
      });

    return res.status(200).json({
      categories: cfg.categories || [],
      projects
    });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};