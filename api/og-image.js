function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function truncate(s, max) { s = String(s || ''); return s.length > max ? s.slice(0, max) + '...' : s; }

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'ddinggok.com'}`);
  const title = truncate(url.searchParams.get('title') || '띵곡', 30);
  const artist = truncate(url.searchParams.get('artist') || 'AI Music', 20);
  const tags = truncate(url.searchParams.get('tags') || 'AI Generated', 40);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a1a"/>
      <stop offset="50%" stop-color="#1a0a2e"/>
      <stop offset="100%" stop-color="#0a0a1a"/>
    </linearGradient>
    <linearGradient id="acc" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#a855f7"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="950" cy="280" r="150" fill="none" stroke="rgba(124,58,237,0.12)" stroke-width="2"/>
  <text x="950" y="300" text-anchor="middle" font-size="80" opacity="0.2">🎵</text>
  <text x="80" y="200" font-family="sans-serif" font-size="18" font-weight="700" fill="#7c3aed" letter-spacing="3">DDINGGOK MUSIC STUDIO</text>
  <rect x="80" y="216" width="80" height="4" rx="2" fill="url(#acc)"/>
  <text x="80" y="310" font-family="sans-serif" font-size="48" font-weight="800" fill="#ffffff">${esc(title)}</text>
  <text x="80" y="360" font-family="sans-serif" font-size="26" fill="#a78bfa">${esc(artist)}</text>
  <text x="80" y="400" font-family="sans-serif" font-size="18" fill="#9ca3af">${esc(tags)}</text>
  <rect x="80" y="460" width="220" height="48" rx="24" fill="url(#acc)"/>
  <text x="190" y="490" text-anchor="middle" font-family="sans-serif" font-size="17" font-weight="700" fill="#ffffff">AI로 음악 만들기 →</text>
  <text x="1120" y="490" text-anchor="end" font-family="sans-serif" font-size="14" fill="#6b7280">ddinggok.com</text>
</svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).send(svg);
}
