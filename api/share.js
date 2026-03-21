/**
 * /api/share — 동적 OG 태그를 포함한 공유 랜딩 페이지
 * 소셜 크롤러는 이 HTML에서 og:image 등을 읽고,
 * 실제 사용자는 JS 리다이렉트로 메인 앱으로 이동
 */
export default function handler(req, res) {
  const { t = 'AI Music', play = '', img = '' } = req.query;

  const _esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const title    = _esc(decodeURIComponent(t).slice(0, 120));
  const audioUrl = _esc(decodeURIComponent(play));
  const imgUrl   = _esc(decodeURIComponent(img));
  const appBase  = 'https://ai-music-studio-bice.vercel.app';

  const ogImg    = imgUrl || `${appBase}/api/og-image?title=${encodeURIComponent(t)}`;
  const appUrl   = `${appBase}/?play=${encodeURIComponent(audioUrl)}&img=${encodeURIComponent(imgUrl)}&t=${encodeURIComponent(t)}`;

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Kenny's Music Studio</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="music.song">
  <meta property="og:title"       content="${title} — Kenny's Music Studio">
  <meta property="og:description" content="AI로 만든 음악을 들어보세요! Kenny's Music Studio에서 생성됐어요 🎵">
  <meta property="og:image"       content="${ogImg}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url"         content="${appBase}/api/share?t=${encodeURIComponent(t)}&play=${encodeURIComponent(audioUrl)}&img=${encodeURIComponent(imgUrl)}">
  <meta property="og:site_name"   content="Kenny's Music Studio">

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${title} — Kenny's Music Studio">
  <meta name="twitter:description" content="AI로 만든 음악을 들어보세요!">
  <meta name="twitter:image"       content="${ogImg}">

  <!-- KakaoTalk -->
  <meta property="kakao:app_key" content="">

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
    .btn{display:block;width:100%;padding:15px;border-radius:14px;border:none;cursor:pointer;
      font-size:15px;font-weight:800;font-family:inherit;text-decoration:none;margin-bottom:10px;}
    .btn-primary{background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;}
    .spinner{font-size:13px;color:#6b5f8a;margin-top:12px;}
  </style>
</head>
<body>
  <div class="card">
    <div class="art">
      ${imgUrl
        ? `<img src="${imgUrl}" alt="${title}" onerror="this.parentNode.innerHTML='<div class=art-placeholder>🎵</div>'">`
        : '<div class="art-placeholder">🎵</div>'}
    </div>
    <div class="label">✦ 공유된 AI 음악</div>
    <div class="title">${title}</div>
    <div class="sub">Kenny's Music Studio</div>
    <a href="${appUrl}" class="btn btn-primary">▶ 음악 듣기 &amp; 나도 만들기</a>
    <div class="spinner">앱으로 이동 중...</div>
  </div>
  <script>
    /* 봇/크롤러가 아닌 경우 앱으로 즉시 이동 */
    const isBot = /bot|crawler|spider|facebookexternalhit|twitterbot|kakaotalk/i.test(navigator.userAgent);
    if(!isBot) setTimeout(()=>{ location.replace(${JSON.stringify(appUrl)}); }, 800);
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(200).send(html);
}
