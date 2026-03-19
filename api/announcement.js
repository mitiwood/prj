// /api/announcement.js — 인앱 공지 관리 API (Supabase 저장)
const { createClient } = require('@supabase/supabase-js');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'kenny2024!';

// 인메모리 폴백 (Supabase 없을 때)
let _memAnnouncement = null;

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) return null;
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

function isExpired(ann) {
  if (!ann) return true;
  if (ann.expires_at && new Date(ann.expires_at) < new Date()) return true;
  return false;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = getSupabase();

  // GET — 현재 활성 공지 조회 (인증 불필요)
  if (req.method === 'GET') {
    try {
      let ann = null;
      if (supabase) {
        const { data } = await supabase
          .from('announcements')
          .select('*')
          .eq('active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        ann = data?.[0] || null;
      } else {
        ann = _memAnnouncement;
      }
      if (isExpired(ann)) {
        return res.status(200).json({ hasAnnouncement: false, announcement: null });
      }
      return res.status(200).json({
        hasAnnouncement: !!ann,
        announcement: ann ? {
          id: ann.id,
          title: ann.title,
          body: ann.body,
          icon: ann.icon || '🎵',
          type: ann.type || 'info',
          url: ann.url || '',
          target: ann.target || 'all',
          createdAt: ann.created_at || ann.createdAt,
          expiresAt: ann.expires_at || ann.expiresAt || null,
        } : null
      });
    } catch (e) {
      return res.status(200).json({ hasAnnouncement: false, announcement: null, error: e.message });
    }
  }

  // POST/DELETE — 인증 필요
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  if (auth !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // POST — 공지 등록
  if (req.method === 'POST') {
    try {
      const { title, body, icon, type, url, target, expiresHours } = req.body || {};
      if (!title || !body) {
        return res.status(400).json({ success: false, error: '제목과 내용을 입력하세요' });
      }
      const now = new Date();
      const annData = {
        title,
        body,
        icon: icon || '🎵',
        type: type || 'info',
        url: url || '',
        target: target || 'all',
        active: true,
        created_at: now.toISOString(),
        expires_at: expiresHours ? new Date(now.getTime() + expiresHours * 3600000).toISOString() : null,
      };

      if (supabase) {
        // 기존 공지 비활성화
        await supabase.from('announcements').update({ active: false }).eq('active', true);
        // 새 공지 등록
        const { error } = await supabase.from('announcements').insert([annData]);
        if (error) throw error;
      } else {
        _memAnnouncement = { ...annData, id: 'mem-' + Date.now(), createdAt: now.toISOString(), expiresAt: annData.expires_at };
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  // DELETE — 공지 삭제
  if (req.method === 'DELETE') {
    try {
      if (supabase) {
        await supabase.from('announcements').update({ active: false }).eq('active', true);
      } else {
        _memAnnouncement = null;
      }
      return res.status(200).json({ success: true });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
