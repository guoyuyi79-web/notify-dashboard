function envFor(id) {
  const key = String(id || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return {
    scriptUrl: process.env['PROJECT_' + key + '_SCRIPT_URL'] || '',
    pullToken: process.env['PROJECT_' + key + '_PULL_TOKEN'] || ''
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch (e) { return {}; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const body = await readBody(req);
    const id = String(body.id || '');
    if (!id) return res.status(400).json({ error: 'missing id' });

    const env = envFor(id);
    if (!env.scriptUrl) {
      return res.status(400).json({ error: 'SCRIPT_URL env missing for ' + id });
    }
    if (!env.pullToken) {
      return res.status(400).json({ error: 'PULL_TOKEN env missing for ' + id });
    }

    const url = new URL(env.scriptUrl);
    const resp = await fetch(url.toString(), {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        action: 'pull',
        token: env.pullToken,
        sendEmail: body.sendEmail ? '1' : '0'
      })
    });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch (e) {
      return res.status(502).json({ error: 'Bad response from Apps Script', body: text.slice(0, 300) });
    }
    return res.status(json && json.ok === false ? 500 : 200).json(json);
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};