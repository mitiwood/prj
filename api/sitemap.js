module.exports = async (req, res) => {
  const SB_URL = process.env.SUPABASE_URL || '';
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || '';
  const now = new Date().toISOString().split('T')[0];

  let trackUrls = '';

  if (SB_URL && SB_KEY) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await fetch(
        `${SB_URL}/rest/v1/tracks?is_public=eq.true&select=id,created_at&order=created_at.desc&limit=200`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: 'count=none' }, signal: ctrl.signal }
      );
      clearTimeout(t);
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows)) {
          rows.forEach(t => {
            if (!t.id) return;
            const d = t.created_at ? t.created_at.split('T')[0] : now;
            trackUrls += `\n  <url><loc>https://ddinggok.com/api/share?trackId=${encodeURIComponent(t.id)}</loc><lastmod>${d}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>`;
          });
        }
      }
    } catch (_) { /* Supabase 실패 시 홈 URL만 반환 */ }
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://ddinggok.com</loc><lastmod>${now}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>${trackUrls}\n</urlset>`
  );
};
