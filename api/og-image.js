/**
 * /api/og-image — 동적 OG 이미지 생성 API
 * SVG 기반으로 트랙 정보를 포함한 OG 이미지 생성
 * GET /api/og-image?title=곡제목&artist=아티스트&tags=태그
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function escapeXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, max) {
  s = String(s || '');
  return s.length > max ? s.slice(0, max) + '...' : s;
}

function generateSvg(title, artist, tags) {
  const safeTitle = escapeXml(truncate(title || "띵곡", 30));
  const safeArtist = escapeXml(truncate(artist || 'AI Music', 20));
  const safeTags = escapeXml(truncate(tags || 'AI Generated', 40));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0a1a;stop-opacity:1" />
      <stop offset="50%" style="stop-color:#1a0a2e;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0a0a1a;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#7c3aed;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#a855f7;stop-opacity:1" />
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <!-- 장식 원 -->
  <circle cx="900" cy="200" r="180" fill="none" stroke="#7c3aed" stroke-width="1" opacity="0.15"/>
  <circle cx="900" cy="200" r="120" fill="none" stroke="#a855f7" stroke-width="1" opacity="0.2"/>
  <circle cx="900" cy="200" r="60" fill="#7c3aed" opacity="0.1"/>
  <!-- 음표 아이콘 -->
  <text x="900" y="220" font-size="80" text-anchor="middle" fill="#a855f7" opacity="0.3" filter="url(#glow)">🎵</text>
  <!-- 브랜드 -->
  <text x="80" y="100" font-family="Arial,sans-serif" font-size="18" fill="#7c3aed" font-weight="700" letter-spacing="3">KENNY'S MUSIC STUDIO</text>
  <!-- 악센트 라인 -->
  <rect x="80" y="120" width="80" height="4" rx="2" fill="url(#accent)"/>
  <!-- 제목 -->
  <text x="80" y="280" font-family="Arial,sans-serif" font-size="52" fill="#ffffff" font-weight="800">${safeTitle}</text>
  <!-- 아티스트 -->
  <text x="80" y="340" font-family="Arial,sans-serif" font-size="28" fill="#a78bfa">${safeArtist}</text>
  <!-- 태그 -->
  <text x="80" y="400" font-family="Arial,sans-serif" font-size="18" fill="#9ca3af">${safeTags}</text>
  <!-- 하단 CTA -->
  <rect x="80" y="500" width="260" height="50" rx="25" fill="url(#accent)"/>
  <text x="210" y="532" font-family="Arial,sans-serif" font-size="18" fill="#ffffff" text-anchor="middle" font-weight="700">AI로 음악 만들기 →</text>
  <!-- 하단 URL -->
  <text x="1120" y="590" font-family="Arial,sans-serif" font-size="14" fill="#6b7280" text-anchor="end">ai-music-studio-bice.vercel.app</text>
</svg>`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { title, artist, tags, trackId } = req.query || {};

  let finalTitle = title;
  let finalArtist = artist;
  let finalTags = tags;

  /* trackId가 있으면 Supabase에서 트랙 정보 조회 */
  if (trackId && SB_URL && SB_KEY) {
    try {
      const r = await fetch(
        `${SB_URL}/rest/v1/tracks?id=eq.${encodeURIComponent(trackId)}&select=title,user_name,tags&limit=1`,
        { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
      );
      if (r.ok) {
        const data = await r.json();
        if (data[0]) {
          finalTitle = finalTitle || data[0].title;
          finalArtist = finalArtist || data[0].user_name;
          finalTags = finalTags || data[0].tags;
        }
      }
    } catch (e) {
      console.warn('[og-image] track fetch failed:', e.message);
    }
  }

  const svg = generateSvg(finalTitle, finalArtist, finalTags);

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).send(svg);
}
