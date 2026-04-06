/**
 * /api/community-config — 커뮤니티 콘텐츠 설정 읽기/쓰기
 *
 * GET                        → 커뮤니티 설정 조회 (인증 불필요)
 * POST { sections, ... }     → 커뮤니티 설정 저장 (Authorization: Bearer ADMIN_SECRET)
 *
 * Supabase settings 테이블 사용 (key='community_config', value=JSONB)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

const SETTINGS_KEY = 'community_config';
let _configCache = null, _configCacheAt = 0;

/* 기본 설정값 */
const DEFAULT_CONFIG = {
  sections: {
    creators:       { enabled: true,  order: 1 },
    daily_discover: { enabled: true,  order: 2 },
    challenge:      { enabled: true,  order: 3 },
    activity_feed:  { enabled: false, order: 4 },
    hero:           { enabled: true,  order: 5 },
    chart:          { enabled: true,  order: 6 },
    mood:           { enabled: true,  order: 7 },
    spotlight:      { enabled: true,  order: 8 },
    genre:          { enabled: true,  order: 9 },
    main_list:      { enabled: true,  order: 10 },
    suggest:        { enabled: true,  order: 11 },
  },
  hero_track_id: '',
  top10_override: [],
  spotlight_creators: [],
  featured_tracks: [],
  creator_order: [],
  recommend_tracks: [],
  gen_modes: {
    custom:  { enabled: true,  order: 1 },
    simple:  { enabled: true,  order: 2 },
    youtube: { enabled: true,  order: 3 },
    mv:      { enabled: true,  order: 4 },
    suno:    { enabled: true,  order: 5 },
  },
};

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? '' : 'return=representation,resolution=merge-duplicates',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ───── GET — 커뮤니티 설정 조회 (인증 불필요, 30초 메모리 캐시) ───── */
  if (req.method === 'GET') {
    /* 메모리 캐시 (30초) — 동시 접속자 많아도 DB 호출 최소화 */
    if (_configCache && Date.now() - _configCacheAt < 30000) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(_configCache);
    }
    try {
      const rows = await sb('GET', `/settings?select=key,value&key=eq.${SETTINGS_KEY}`);
      if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
        const saved = rows[0].value;
        const merged = {
          ...DEFAULT_CONFIG,
          ...saved,
          sections: { ...DEFAULT_CONFIG.sections, ...(saved.sections || {}) },
          gen_modes: { ...DEFAULT_CONFIG.gen_modes, ...(saved.gen_modes || {}) },
        };
        _configCache = merged; _configCacheAt = Date.now();
        return res.status(200).json(merged);
      }
      _configCache = DEFAULT_CONFIG; _configCacheAt = Date.now();
      return res.status(200).json(DEFAULT_CONFIG);
    } catch (e) {
      return res.status(200).json(_configCache || DEFAULT_CONFIG);
    }
  }

  /* ───── POST — 커뮤니티 설정 저장 (관리자 인증 필요) ───── */
  if (req.method === 'POST') {
    const auth = (req.headers.authorization || '').replace('Bearer ', '');
    if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
      return res.status(401).json({ error: '관리자 인증 필요' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: '유효한 설정 데이터가 필요합니다' });
    }

    /* 허용된 필드만 추출 */
    const allowedFields = [
      'sections', 'hero_track_id', 'top10_override',
      'spotlight_creators', 'featured_tracks', 'creator_order',
      'recommend_tracks', 'gen_modes',
    ];
    const config = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        config[field] = body[field];
      }
    }

    if (Object.keys(config).length === 0) {
      return res.status(400).json({ error: '저장할 설정 필드가 없습니다' });
    }

    try {
      /* 기존 설정과 병합 (부분 업데이트 지원) */
      let existing = { ...DEFAULT_CONFIG };
      try {
        const rows = await sb('GET', `/settings?select=key,value&key=eq.${SETTINGS_KEY}`);
        if (Array.isArray(rows) && rows.length > 0 && rows[0].value) {
          existing = { ...DEFAULT_CONFIG, ...rows[0].value };
        }
      } catch (_) { /* 기존 설정 없으면 기본값 사용 */ }

      const merged = {
        ...existing,
        ...config,
        sections: config.sections
          ? { ...existing.sections, ...config.sections }
          : existing.sections,
        gen_modes: config.gen_modes
          ? { ...existing.gen_modes, ...config.gen_modes }
          : existing.gen_modes,
      };

      await sb('POST', '/settings?on_conflict=key', {
        key: SETTINGS_KEY,
        value: merged,
        updated_at: new Date().toISOString(),
      });

      return res.status(200).json({ ok: true, config: merged });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
