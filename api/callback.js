/**
 * /api/callback — kie.ai 웹훅 콜백 수신
 *
 * 음악/가사 생성 완료 시 kie.ai가 호출하는 엔드포인트.
 * 현재는 클라이언트 폴링으로 결과를 수신하므로,
 * 이 엔드포인트는 404 방지 + 향후 확장용.
 */
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const body = req.body;
    return res.status(200).json({ ok: true, received: true });
  }

  // GET for health check
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, endpoint: 'callback' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
