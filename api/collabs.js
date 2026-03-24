/**
 * /api/collabs — 콜라보 요청/수락/워크스페이스 API
 *
 * GET  ?action=inbox&name=X&provider=Y   → 받은 콜라보 요청 (pending)
 * GET  ?action=sent&name=X&provider=Y    → 보낸 콜라보 요청
 * GET  ?action=active&name=X&provider=Y  → 진행 중 콜라보 (accepted)
 * GET  ?action=detail&id=UUID            → 콜라보 상세
 *
 * POST action=request   → 콜라보 요청 보내기
 * POST action=accept    → 수락
 * POST action=decline   → 거절
 * POST action=cancel    → 취소 (요청자)
 * POST action=submit    → 프롬프트/스타일 제출
 * POST action=complete  → 완료 (트랙 ID 연결)
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function sb(method, path, body = null) {
  if (!SB_URL || !SB_KEY) throw new Error('Supabase 미설정');
  const headers = {
    apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'GET' ? '' : 'return=representation',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  if (!r.ok) throw new Error(`SB ${r.status}: ${txt.slice(0, 200)}`);
  return txt ? JSON.parse(txt) : null;
}

async function _notify(userName, userProvider, type, title, body, data = {}) {
  try {
    await sb('POST', '/notifications', {
      user_name: userName, user_provider: userProvider,
      type, title, body, data: JSON.stringify(data),
    });
  } catch (e) { console.warn('[collab notify]', e.message); }
}

/* Rate limit */
const _rateMap = {};
function _checkRate(key, maxPerMin) {
  const now = Date.now();
  if (!_rateMap[key]) _rateMap[key] = [];
  _rateMap[key] = _rateMap[key].filter(t => now - t < 60000);
  if (_rateMap[key].length >= maxPerMin) return false;
  _rateMap[key].push(now);
  return true;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  /* ─── GET ─── */
  if (req.method === 'GET') {
    const action = req.query?.action || '';
    const name = req.query?.name || '';
    const provider = req.query?.provider || '';

    if (!name || !provider) return res.status(400).json({ error: 'name and provider required' });

    try {
      let rows;
      const encName = encodeURIComponent(name);
      const encProv = encodeURIComponent(provider);

      if (action === 'inbox') {
        rows = await sb('GET', `/collabs?to_name=ilike.${encName}&to_provider=eq.${encProv}&status=eq.pending&order=created_at.desc&limit=20`);
      } else if (action === 'sent') {
        rows = await sb('GET', `/collabs?from_name=ilike.${encName}&from_provider=eq.${encProv}&order=created_at.desc&limit=20`);
      } else if (action === 'active') {
        rows = await sb('GET', `/collabs?status=eq.accepted&or=(and(from_name.ilike.${encName},from_provider.eq.${encProv}),and(to_name.ilike.${encName},to_provider.eq.${encProv}))&order=updated_at.desc&limit=20`);
      } else if (action === 'detail') {
        const id = req.query?.id;
        if (!id) return res.status(400).json({ error: 'id required' });
        rows = await sb('GET', `/collabs?id=eq.${encodeURIComponent(id)}&limit=1`);
        return res.status(200).json({ ok: true, collab: (rows && rows[0]) || null });
      } else {
        /* 전체 (나와 관련된 모든 콜라보) */
        rows = await sb('GET', `/collabs?or=(and(from_name.ilike.${encName},from_provider.eq.${encProv}),and(to_name.ilike.${encName},to_provider.eq.${encProv}))&order=created_at.desc&limit=50`);
      }
      return res.status(200).json({ ok: true, collabs: rows || [] });
    } catch (e) {
      return res.status(200).json({ ok: true, collabs: [], error: e.message });
    }
  }

  /* ─── POST ─── */
  if (req.method === 'POST') {
    let b = req.body;
    if (typeof b === 'string') try { b = JSON.parse(b); } catch { b = {}; }
    b = b || {};
    const { action } = b;

    /* ── request: 콜라보 요청 ── */
    if (action === 'request') {
      const { fromName, fromProvider, fromAvatar, toName, toProvider, message } = b;
      if (!fromName || !fromProvider || !toName || !toProvider)
        return res.status(400).json({ error: '필수 필드 누락' });
      if (!fromProvider)
        return res.status(400).json({ error: '로그인이 필요합니다' });
      if (fromName === toName && fromProvider === toProvider)
        return res.status(400).json({ error: '자기 자신에게 요청할 수 없습니다' });

      const ip = req.headers['x-forwarded-for'] || 'unknown';
      if (!_checkRate('collab:' + ip, 5))
        return res.status(429).json({ error: '요청이 너무 많습니다' });

      try {
        /* 중복 방지: 같은 상대에게 pending 요청이 있는지 */
        const existing = await sb('GET',
          `/collabs?from_name=ilike.${encodeURIComponent(fromName)}&from_provider=eq.${encodeURIComponent(fromProvider)}&to_name=ilike.${encodeURIComponent(toName)}&to_provider=eq.${encodeURIComponent(toProvider)}&status=eq.pending&limit=1`
        );
        if (existing && existing.length > 0)
          return res.status(409).json({ error: '이미 보낸 요청이 있습니다' });

        const row = {
          from_name: fromName, from_provider: fromProvider, from_avatar: fromAvatar || '',
          to_name: toName, to_provider: toProvider,
          status: 'pending', message: (message || '').slice(0, 200),
          collab_data: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        };
        const result = await sb('POST', '/collabs', row);

        /* 알림 전송 */
        await _notify(toName, toProvider, 'collab',
          '🤝 콜라보 요청', `${fromName}님이 콜라보를 요청했어요!`,
          { collabId: result?.[0]?.id, fromName, fromProvider, fromAvatar }
        );

        return res.status(200).json({ ok: true, collab: result?.[0] || row });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    /* ── accept: 수락 ── */
    if (action === 'accept') {
      const { id, name, provider } = b;
      if (!id || !name) return res.status(400).json({ error: 'id, name required' });
      try {
        const rows = await sb('GET', `/collabs?id=eq.${encodeURIComponent(id)}&limit=1`);
        const collab = rows?.[0];
        if (!collab) return res.status(404).json({ error: '콜라보를 찾을 수 없습니다' });
        if (collab.status !== 'pending') return res.status(400).json({ error: '이미 처리된 요청입니다' });

        await sb('PATCH', `/collabs?id=eq.${encodeURIComponent(id)}`, {
          status: 'accepted', updated_at: new Date().toISOString(),
        });

        /* 요청자에게 알림 */
        await _notify(collab.from_name, collab.from_provider, 'collab',
          '🎉 콜라보 수락됨', `${name}님이 콜라보를 수락했어요!`,
          { collabId: id, action: 'accepted' }
        );

        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    /* ── decline: 거절 ── */
    if (action === 'decline') {
      const { id, name } = b;
      if (!id) return res.status(400).json({ error: 'id required' });
      try {
        await sb('PATCH', `/collabs?id=eq.${encodeURIComponent(id)}`, {
          status: 'declined', updated_at: new Date().toISOString(),
        });

        const rows = await sb('GET', `/collabs?id=eq.${encodeURIComponent(id)}&limit=1`);
        const collab = rows?.[0];
        if (collab) {
          await _notify(collab.from_name, collab.from_provider, 'collab',
            '콜라보 거절', `${name || '상대방'}님이 콜라보를 정중히 거절했어요.`,
            { collabId: id, action: 'declined' }
          );
        }
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    /* ── cancel: 요청 취소 ── */
    if (action === 'cancel') {
      const { id } = b;
      if (!id) return res.status(400).json({ error: 'id required' });
      try {
        await sb('PATCH', `/collabs?id=eq.${encodeURIComponent(id)}`, {
          status: 'cancelled', updated_at: new Date().toISOString(),
        });
        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    /* ── submit: 프롬프트/스타일 제출 ── */
    if (action === 'submit') {
      const { id, name, provider, prompt, style, genre, mood } = b;
      if (!id || !name) return res.status(400).json({ error: 'id, name required' });
      try {
        const rows = await sb('GET', `/collabs?id=eq.${encodeURIComponent(id)}&limit=1`);
        const collab = rows?.[0];
        if (!collab) return res.status(404).json({ error: '콜라보를 찾을 수 없습니다' });
        if (collab.status !== 'accepted') return res.status(400).json({ error: '수락된 콜라보만 수정 가능합니다' });

        const data = collab.collab_data || {};
        /* from/to 구분 */
        const isFrom = collab.from_name.toLowerCase() === name.toLowerCase() && collab.from_provider === provider;
        const side = isFrom ? 'a' : 'b';
        data[`prompt_${side}`] = (prompt || '').slice(0, 500);
        data[`style_${side}`] = (style || '').slice(0, 200);
        data[`genre_${side}`] = (genre || '').slice(0, 100);
        data[`mood_${side}`] = (mood || '').slice(0, 100);

        /* 양쪽 다 제출했으면 자동 머지 */
        if (data.prompt_a && data.prompt_b) {
          data.merged_prompt = `${data.prompt_a}\n${data.prompt_b}`.trim();
          data.merged_style = [data.style_a, data.style_b].filter(Boolean).join(', ');
          data.merged_genre = data.genre_a || data.genre_b || '';
          data.merged_mood = [data.mood_a, data.mood_b].filter(Boolean).join(', ');
          data.ready = true;
        }

        await sb('PATCH', `/collabs?id=eq.${encodeURIComponent(id)}`, {
          collab_data: data, updated_at: new Date().toISOString(),
        });

        /* 상대방에게 알림 */
        const partnerName = isFrom ? collab.to_name : collab.from_name;
        const partnerProv = isFrom ? collab.to_provider : collab.from_provider;
        await _notify(partnerName, partnerProv, 'collab',
          '🎵 콜라보 업데이트', `${name}님이 아이디어를 제출했어요!`,
          { collabId: id, action: 'submitted' }
        );

        return res.status(200).json({ ok: true, collab_data: data });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    /* ── complete: 트랙 생성 완료 → 콜라보 완료 ── */
    if (action === 'complete') {
      const { id, trackId } = b;
      if (!id || !trackId) return res.status(400).json({ error: 'id, trackId required' });
      try {
        const rows = await sb('GET', `/collabs?id=eq.${encodeURIComponent(id)}&limit=1`);
        const collab = rows?.[0];
        if (!collab) return res.status(404).json({ error: '콜라보를 찾을 수 없습니다' });

        await sb('PATCH', `/collabs?id=eq.${encodeURIComponent(id)}`, {
          status: 'completed', track_id: trackId, updated_at: new Date().toISOString(),
        });

        /* 트랙에 co-owner 정보 추가 */
        try {
          await sb('PATCH', `/tracks?id=eq.${encodeURIComponent(trackId)}`, {
            collab_id: id,
            co_owner_name: collab.to_name,
            co_owner_avatar: '',
            co_owner_provider: collab.to_provider,
          });
        } catch (e) { console.warn('[collab complete] track patch:', e.message); }

        /* 양쪽 알림 */
        await _notify(collab.from_name, collab.from_provider, 'collab',
          '🎉 콜라보 곡 완성!', '콜라보 곡이 생성되었어요! 라이브러리에서 확인하세요.',
          { collabId: id, trackId, action: 'completed' }
        );
        await _notify(collab.to_name, collab.to_provider, 'collab',
          '🎉 콜라보 곡 완성!', '콜라보 곡이 생성되었어요! 라이브러리에서 확인하세요.',
          { collabId: id, trackId, action: 'completed' }
        );

        return res.status(200).json({ ok: true });
      } catch (e) {
        return res.status(500).json({ error: e.message });
      }
    }

    return res.status(400).json({ error: 'unknown action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
