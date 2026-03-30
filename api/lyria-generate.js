/**
 * /api/lyria-generate — Google Lyria 3 Pro 음악 생성
 * kie.ai 대체 엔드포인트. 동기 방식으로 base64 오디오 반환.
 *
 * POST { prompt, style, instrumental, title, vocalGender }
 * → { audioBase64, mimeType, title, lyrics, duration }
 */

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!geminiKey) return res.status(500).json({ error: 'GEMINI_API_KEY 미설정' });

  let body = req.body;
  if (typeof body === 'string') try { body = JSON.parse(body); } catch { body = {}; }

  const {
    prompt = '',       // 가사 또는 설명
    style = '',        // 스타일 태그
    instrumental = false,
    title = 'Untitled',
    vocalGender = '',
    model = 'pro',     // 'pro' (2분) 또는 'clip' (30초)
    userName = '',
    userProvider = '',
  } = body || {};

  // ── 크레딧 체크 (kie-proxy와 동일 로직) ──
  if (SB_URL && SB_KEY && userName) {
    try {
      const creditOk = await _checkCredit(userName, userProvider);
      if (!creditOk.ok) {
        return res.status(403).json({
          error: 'credit_exceeded',
          reason: creditOk.reason,
          plan: creditOk.plan,
          used: creditOk.used,
          limit: creditOk.limit,
          upgrade: creditOk.upgrade,
        });
      }
    } catch (e) {
      console.warn('[lyria] credit check fail:', e.message);
    }
  }

  // ── Lyria 프롬프트 조합 ──
  const lyriaPrompt = _buildLyriaPrompt({ prompt, style, instrumental, vocalGender, title });
  const modelId = model === 'clip' ? 'lyria-3-clip-preview' : 'lyria-3-pro-preview';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${geminiKey}`;

  console.log(`[lyria] model=${modelId} style=${(style || '').slice(0, 80)}... title=${title}`);

  try {
    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: lyriaPrompt }] }],
        generationConfig: { responseModalities: ['AUDIO', 'TEXT'] },
      }),
    });

    if (!apiRes.ok) {
      const errData = await apiRes.json().catch(() => ({}));
      const errMsg = errData?.error?.message || `Lyria API ${apiRes.status}`;
      console.error('[lyria] API error:', errMsg);
      return res.status(apiRes.status).json({ error: errMsg });
    }

    const data = await apiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];

    let audioBase64 = '';
    let mimeType = 'audio/mp3';
    let generatedLyrics = '';

    for (const part of parts) {
      if (part.inlineData) {
        audioBase64 = part.inlineData.data;
        mimeType = part.inlineData.mimeType || 'audio/mp3';
      } else if (part.text) {
        generatedLyrics += part.text + '\n';
      }
    }

    if (!audioBase64) {
      return res.status(500).json({ error: '오디오 생성 실패 — Lyria가 오디오를 반환하지 않았어요' });
    }

    // ── Supabase Storage에 오디오 업로드 (URL 제공용) ──
    let audioUrl = '';
    const trackId = `lyria-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const ext = mimeType.includes('wav') ? 'wav' : 'mp3';
    const fileName = `${trackId}.${ext}`;

    if (SB_URL && SB_KEY) {
      try {
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        const uploadRes = await fetch(`${SB_URL}/storage/v1/object/tracks/${fileName}`, {
          method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': `Bearer ${SB_KEY}`,
            'Content-Type': mimeType,
            'x-upsert': 'true',
          },
          body: audioBuffer,
        });
        if (uploadRes.ok) {
          audioUrl = `${SB_URL}/storage/v1/object/public/tracks/${fileName}`;
        } else {
          console.warn('[lyria] storage upload fail:', uploadRes.status);
        }
      } catch (e) {
        console.warn('[lyria] storage upload error:', e.message);
      }
    }

    // Storage 실패 시 → data URL 폴백 (큰 파일은 느릴 수 있음)
    if (!audioUrl) {
      audioUrl = `data:${mimeType};base64,${audioBase64}`;
    }

    // ── 크레딧 차감 ──
    if (SB_URL && SB_KEY && userName) {
      try { await _deductCredit(userName, userProvider); } catch (e) {
        console.warn('[lyria] credit deduct fail:', e.message);
      }
    }

    // ── kie.ai 호환 응답 포맷 ──
    const trackData = {
      id: trackId,
      audioUrl,
      audio_url: audioUrl,
      title: title || 'Lyria Song',
      lyrics: generatedLyrics.trim(),
      imageUrl: '',
      tags: style.slice(0, 200),
      _provider: 'google-lyria',
      _model: modelId,
    };

    return res.status(200).json({
      code: 0,
      message: 'success',
      data: {
        taskId: trackId,
        status: 'SUCCESS',
        response: { sunoData: [trackData] },
      },
      // 클라이언트 직접 사용용
      tracks: [trackData],
      _provider: 'google-lyria',
    });

  } catch (e) {
    console.error('[lyria] generation error:', e);
    return res.status(500).json({ error: e.message || '음악 생성 실패' });
  }
}

/** Lyria용 텍스트 프롬프트 조합 */
function _buildLyriaPrompt({ prompt, style, instrumental, vocalGender, title }) {
  const parts = [];

  // 스타일 지시
  if (style) {
    parts.push(`Create a song with the following style: ${style}.`);
  }

  // 인스트루멘탈
  if (instrumental) {
    parts.push('This should be an instrumental track with no vocals.');
  } else if (vocalGender) {
    const genderMap = { m: 'male', f: 'female', mixed: 'mixed male and female' };
    parts.push(`Use ${genderMap[vocalGender] || vocalGender} vocals.`);
  }

  // 제목
  if (title && title !== 'Untitled') {
    parts.push(`The song title is "${title}".`);
  }

  // 가사 또는 설명
  if (prompt) {
    // 가사가 있는 경우 (줄바꿈 포함, 한글 포함 등)
    const looksLikeLyrics = prompt.includes('\n') || prompt.length > 100 || /[\uAC00-\uD7AF]/.test(prompt);
    if (looksLikeLyrics && !instrumental) {
      parts.push(`Here are the lyrics:\n${prompt}`);
    } else {
      parts.push(prompt);
    }
  }

  return parts.join('\n\n') || 'Create a beautiful song.';
}

/** 크레딧 체크 (간소화) */
async function _checkCredit(userName, userProvider) {
  if (!SB_URL || !SB_KEY) return { ok: true };
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/check_plan_limit`, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_name: userName, p_credit_type: 'song' }),
    });
    if (!r.ok) return { ok: true }; // RPC 없으면 통과
    const d = await r.json();
    if (d && d.exceeded) {
      return { ok: false, reason: 'limit_exceeded', plan: d.plan, used: d.used, limit: d.limit, upgrade: d.upgrade };
    }
    return { ok: true };
  } catch { return { ok: true }; }
}

/** 크레딧 차감 */
async function _deductCredit(userName, userProvider) {
  if (!SB_URL || !SB_KEY) return;
  await fetch(`${SB_URL}/rest/v1/rpc/deduct_credit`, {
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_user_name: userName, p_credit_type: 'song', p_provider: 'google-lyria' }),
  }).catch(() => {});
}
