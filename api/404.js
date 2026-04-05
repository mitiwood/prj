export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(404).send(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>페이지를 찾을 수 없어요 — 띵곡</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{background:#0a0a1a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:20px;}
.wrap{max-width:400px;}
.emoji{font-size:80px;margin-bottom:20px;}
h1{font-size:24px;font-weight:800;margin-bottom:8px;}
p{font-size:14px;color:rgba(255,255,255,.5);margin-bottom:24px;}
a{display:inline-block;padding:14px 32px;border-radius:25px;background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;text-decoration:none;font-weight:700;font-size:14px;}
a:hover{filter:brightness(1.1);}
</style>
</head>
<body>
<div class="wrap">
<div class="emoji">🎵</div>
<h1>페이지를 찾을 수 없어요</h1>
<p>찾으시는 페이지가 존재하지 않거나 이동되었어요</p>
<a href="/">홈으로 돌아가기</a>
</div>
</body>
</html>`);
}
