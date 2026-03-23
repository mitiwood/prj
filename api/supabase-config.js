/**
 * /api/supabase-config — 클라이언트용 Supabase 설정 반환
 * anon key만 제공 (service key 절대 노출 안 함)
 */
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    url: (process.env.SUPABASE_URL || '').trim(),
    anonKey: (process.env.SUPABASE_ANON_KEY || '').trim(),
  });
}
