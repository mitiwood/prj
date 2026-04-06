// api/kie.js — Vercel Serverless Function (ESM)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-kie-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const kieKey = req.headers['x-kie-key'];
  if (!kieKey) return res.status(400).json({ error: 'x-kie-key header required' });

  const kiePath = req.query.path || '/api/suno/v1/music';
  const url = 'https://api.kie.ai' + kiePath;

  const fetchOpts = {
    method: req.method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + kieKey,
    },
  };

  if (req.method === 'POST' && req.body) {
    fetchOpts.body = typeof req.body === 'string'
      ? req.body
      : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(url, fetchOpts);
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { raw: text }; }
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
