/**
 * /api/share — 동적 OG 태그를 포함한 공유 랜딩 페이지
 * 소셜 크롤러는 이 HTML에서 og:image 등을 읽고,
 * 실제 사용자는 JS 리다이렉트로 메인 앱으로 이동
 *
 * 쿼리 파라미터:
 *   trackId — Supabase tracks 테이블의 id (우선)
 *   t, play, img — 레거시 쿼리 파라미터 (하위 호환)
 */
export default async function handler(req, res) {
  const _esc = s =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const appBase = 'https://ddinggok.com';

  // --- 트랙 데이터 가져오기 ---
  let title = '';
  let audioUrl = '';
  let imgUrl = '';
  let artist = '';
  let tags = '';
  let duration = '';

  const { trackId, t = 'AI Music', play = '', img = '' } = req.query;

  if (trackId) {
    // Supabase에서 트랙 정보 조회
    try {
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

      if (supabaseUrl && supabaseKey) {
        const apiUrl = `${supabaseUrl}/rest/v1/tracks?id=eq.${encodeURIComponent(trackId)}&select=*&limit=1`;
        const resp = await fetch(apiUrl, {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        });

        if (resp.ok) {
          const rows = await resp.json();
          if (rows && rows.length > 0) {
            const track = rows[0];
            title = track.title || t;
            audioUrl = track.audio_url || '';
            imgUrl = track.image_url || track.cover_url || '';
            artist = track.artist || track.user_name || '';
            tags = Array.isArray(track.tags)
              ? track.tags.join(', ')
              : track.tags || '';
            duration = track.duration || '';
          }
        }
      }
    } catch (err) {
      console.error('[share] Supabase fetch error:', err.message);
    }
  }

  // 쿼리 파라미터 폴백 (Supabase 조회 실패 또는 trackId 없는 경우)
  if (!title) title = decodeURIComponent(t).slice(0, 120);
  if (!audioUrl && play) audioUrl = decodeURIComponent(play);
  if (!imgUrl && img) imgUrl = decodeURIComponent(img);

  // 이스케이프 처리
  const safeTitle = _esc(title);
  const safeAudioUrl = _esc(audioUrl);
  const safeImgUrl = _esc(imgUrl);
  const safeArtist = _esc(artist);
  const safeTags = _esc(tags);

  // OG 이미지: 트랙 이미지 → 폴백으로 동적 OG 이미지 생성
  const ogImg = safeImgUrl || `${appBase}/api/og-image?title=${encodeURIComponent(title)}`;

  // OG description 조합
  const descParts = [];
  if (artist) descParts.push(artist);
  if (tags) descParts.push(tags);
  const ogDescription = descParts.length > 0
    ? `${descParts.join(' · ')} — AI로 만든 음악을 들어보세요!`
    : 'AI로 만든 음악을 들어보세요! 띵곡에서 생성됐어요 🎵';

  // 앱 URL — trackId + play/img 폴백 모두 포함 (Supabase 조회 실패 대비)
  const appParams = new URLSearchParams();
  appParams.set('t', title);
  if (trackId) appParams.set('trackId', trackId);
  if (audioUrl) appParams.set('play', audioUrl);
  if (imgUrl) appParams.set('img', imgUrl);
  const appUrl = `${appBase}/?${appParams.toString()}`;

  // 현재 공유 페이지 URL
  const shareParams = new URLSearchParams();
  shareParams.set('t', title);
  if (trackId) shareParams.set('trackId', trackId);
  if (audioUrl) shareParams.set('play', audioUrl);
  if (imgUrl) shareParams.set('img', imgUrl);
  const shareUrl = `${appBase}/api/share?${shareParams.toString()}`;

  // JSON-LD 구조화된 데이터 (MusicRecording)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    name: title,
    url: shareUrl,
  };
  if (artist) jsonLd.byArtist = { '@type': 'Person', name: artist };
  if (audioUrl) {
    jsonLd.audio = {
      '@type': 'AudioObject',
      contentUrl: audioUrl,
      encodingFormat: 'audio/mpeg',
    };
  }
  if (imgUrl) jsonLd.image = imgUrl;
  if (duration) jsonLd.duration = duration;
  if (tags) jsonLd.genre = tags;

  const jsonLdScript = `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`;

  // --- HTML 렌더링 ---
  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${safeTitle} — 띵곡</title>

  <!-- Open Graph -->
  <meta property="og:type"         content="music.song">
  <meta property="og:title"        content="${safeTitle}">
  <meta property="og:description"  content="${_esc(ogDescription)}">
  <meta property="og:image"        content="${ogImg}">
  <meta property="og:image:width"  content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url"          content="${_esc(shareUrl)}">
  <meta property="og:site_name"    content="띵곡">
  ${safeAudioUrl ? `<meta property="og:audio"        content="${safeAudioUrl}">
  <meta property="og:audio:type"   content="audio/mpeg">` : ''}

  <!-- Twitter Card (Player) -->
  <meta name="twitter:card"        content="${safeAudioUrl ? 'player' : 'summary_large_image'}">
  <meta name="twitter:title"       content="${safeTitle}">
  <meta name="twitter:description" content="${_esc(ogDescription)}">
  <meta name="twitter:image"       content="${ogImg}">
  ${safeAudioUrl ? `<meta name="twitter:player"      content="${_esc(appUrl)}">
  <meta name="twitter:player:width" content="480">
  <meta name="twitter:player:height" content="200">` : ''}

  <!-- KakaoTalk -->
  <meta property="kakao:app_key" content="">

  <!-- 구조화된 데이터 (JSON-LD) -->
  ${jsonLdScript}

  <style>
    *{margin:0;padding:0;box-sizing:border-box;}
    body{background:#0d0d1a;color:#f0eeff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;}
    .card{background:#1c1035;border-radius:20px;padding:32px 28px;max-width:360px;width:100%;
      text-align:center;border:1px solid rgba(255,255,255,.08);}
    .art{width:120px;height:120px;border-radius:16px;overflow:hidden;margin:0 auto 20px;
      background:#2a1a4a;box-shadow:0 8px 32px rgba(0,0,0,.5);}
    .art img{width:100%;height:100%;object-fit:cover;}
    .art-placeholder{font-size:52px;line-height:120px;}
    .label{font-size:11px;color:#a78bfa;font-weight:700;margin-bottom:8px;letter-spacing:.05em;}
    .title{font-size:20px;font-weight:800;margin-bottom:6px;}
    .sub{font-size:12px;color:#6b5f8a;margin-bottom:28px;}
    .artist{font-size:14px;color:#a78bfa;margin-bottom:4px;}
    .tags{font-size:11px;color:#6b5f8a;margin-bottom:20px;}
    .btn{display:block;width:100%;padding:15px;border-radius:14px;border:none;cursor:pointer;
      font-size:15px;font-weight:800;font-family:inherit;text-decoration:none;margin-bottom:10px;}
    .btn-primary{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;}
    .spinner{font-size:13px;color:#6b5f8a;margin-top:12px;}
  </style>
</head>
<body>
  <div class="card">
    <div class="art">
      ${safeImgUrl
        ? `<img src="${safeImgUrl}" alt="${safeTitle}" onerror="this.parentNode.innerHTML='<div class=art-placeholder>🎵</div>'">`
        : '<div class="art-placeholder">🎵</div>'}
    </div>
    <div class="label">✦ 공유된 AI 음악</div>
    <div class="title">${safeTitle}</div>
    ${safeArtist ? `<div class="artist">${safeArtist}</div>` : ''}
    ${safeTags ? `<div class="tags">${safeTags}</div>` : ''}
    <div class="sub">띵곡</div>
    <a href="${_esc(appUrl)}" class="btn btn-primary">▶ 음악 듣기 &amp; 나도 만들기</a>
    <div class="spinner">앱으로 이동 중...</div>
  </div>
  <script>
    /* 봇/크롤러가 아닌 경우 앱으로 즉시 이동 */
    var isBot = /bot|crawler|spider|facebookexternalhit|twitterbot|kakaotalk|telegrambot|slackbot|linkedinbot|discordbot/i.test(navigator.userAgent);
    if(!isBot) setTimeout(function(){ location.replace(${JSON.stringify(appUrl)}); }, 800);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(html);
}
