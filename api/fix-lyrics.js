/**
 * /api/fix-lyrics — DB 가사에서 [Verse], [Chorus] 등 섹션 태그 일괄 제거
 * POST (관리자 전용) → 모든 트랙의 lyrics에서 섹션 태그 라인 제거
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function sb(method, path, body) {
  if (!SB_URL || !SB_KEY) return null;
  const opts = { method, headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json', Prefer: method === 'GET' ? '' : 'return=representation' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) return null;
  return txt ? JSON.parse(txt) : [];
}

function cleanLyrics(text) {
  if (!text) return text;
  return text.split('\n').filter(line => {
    const trimmed = line.trim();
    /* [Verse], [Verse 1], [Chorus], [Bridge], [Outro], [Intro], [Pre-Chorus], [Extended] 등 */
    return !(/^\[.+\]$/.test(trimmed));
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    /* 가사가 있는 모든 트랙 조회 */
    let offset = 0, updated = 0, checked = 0;
    const BATCH = 100;

    while (true) {
      const rows = await sb('GET', `/tracks?lyrics=neq.&lyrics=not.is.null&select=id,lyrics&limit=${BATCH}&offset=${offset}&order=created_at.desc`);
      if (!rows || !rows.length) break;

      for (const row of rows) {
        checked++;
        if (!row.lyrics) continue;
        const cleaned = cleanLyrics(row.lyrics);
        if (cleaned !== row.lyrics) {
          await sb('PATCH', `/tracks?id=eq.${encodeURIComponent(row.id)}`, { lyrics: cleaned });
          updated++;
        }
      }

      offset += BATCH;
      if (rows.length < BATCH) break;
    }

    return res.status(200).json({ ok: true, checked, updated });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
