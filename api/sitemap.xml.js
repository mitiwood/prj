const SB_URL = process.env.SUPABASE_URL || '';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';

async function sb(path) {
  if (!SB_URL || !SB_KEY) return [];
  const r = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  return r.ok ? r.json() : [];
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');

  const now = new Date().toISOString().split('T')[0];

  /* 공개 트랙 최근 200개 */
  let tracks = [];
  try {
    tracks = await sb('/tracks?is_public=eq.true&audio_url=neq.&select=id,title,created_at&order=created_at.desc&limit=200');
  } catch (e) { /* Supabase 연결 실패 시 빈 목록 */ }

  let urls = `  <url>
    <loc>https://ddinggok.com</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

  (tracks || []).forEach(t => {
    if (!t.id) return;
    const date = t.created_at ? t.created_at.split('T')[0] : now;
    urls += `
  <url>
    <loc>https://ddinggok.com/api/share?trackId=${encodeURIComponent(t.id)}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
  });

  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
};
