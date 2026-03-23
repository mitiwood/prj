/**
 * 커뮤니티 더미 데이터 시드 스크립트
 * 실행: node scripts/seed-community.js
 *
 * DiceBear Adventurer 스타일 AI 아바타 사용
 */

const fs = require('fs');
const path = require('path');

// .env.local에서 환경변수 로드
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^(\w+)="?([^"]*)"?$/);
  if (m) env[m[1]] = m[2];
});

const SB_URL = env.SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not found in .env.local');
  process.exit(1);
}

async function sb(method, path, body = null) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
    Prefer: method === 'POST' ? 'return=representation,resolution=merge-duplicates' : 'count=exact',
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1${path}`, opts);
  const txt = await r.text();
  try { return JSON.parse(txt); } catch { return txt; }
}

// DiceBear Adventurer 아바타 URL
const avatar = (name) => `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

// 크리에이터 프로필
const creators = [
  { name: '하늘별', provider: 'kakao', tags: 'K-Pop, 댄스' },
  { name: '루나뮤직', provider: 'google', tags: 'R&B, 감성' },
  { name: '비트메이커준', provider: 'naver', tags: 'Hip-Hop, 트랩' },
  { name: '소리나래', provider: 'kakao', tags: '발라드, 피아노' },
  { name: '일렉트라', provider: 'google', tags: 'EDM, 하우스' },
  { name: '재즈캣', provider: 'naver', tags: 'Jazz, Lo-Fi' },
  { name: '오로라', provider: 'kakao', tags: 'OST, 시네마틱' },
  { name: '미드나잇', provider: 'google', tags: 'R&B, 힙합' },
  { name: '벚꽃엔딩', provider: 'kakao', tags: '어쿠스틱, 포크' },
  { name: '네온사운드', provider: 'naver', tags: 'Electronic, Future Bass' },
];

// 더미 트랙 데이터
const tracks = [
  // 하늘별
  { creator: 0, title: '별빛 아래 춤을', tags: 'K-Pop, dance, energetic, synth', lyrics: '[Verse]\n별빛이 내리는 밤\n우리 둘만의 무대\n[Chorus]\n춤을 춰 tonight' },
  { creator: 0, title: 'Moonlight Party', tags: 'K-Pop, party, upbeat, 130BPM', lyrics: '[Verse]\nMoonlight shining bright\n[Chorus]\nDance all night' },
  { creator: 0, title: '꿈꾸는 소녀', tags: 'K-Pop, dreamy, soft vocal', lyrics: '[Verse]\n구름 위를 걷는 기분\n[Chorus]\n꿈꾸는 소녀처럼' },
  // 루나뮤직
  { creator: 1, title: '새벽 감성', tags: 'R&B, emotional, smooth, 90BPM', lyrics: '[Verse]\n새벽 3시의 감성\n너를 생각해\n[Chorus]\n잠들 수 없는 밤' },
  { creator: 1, title: 'Velvet Night', tags: 'R&B, soul, groovy, bass', lyrics: '[Verse]\nVelvet night falls\n[Chorus]\nFeel the groove' },
  // 비트메이커준
  { creator: 2, title: '거리의 시', tags: 'Hip-Hop, trap, 808 bass, 140BPM', lyrics: '[Verse]\n거리를 걷다 보면\n비트가 들려와\n[Chorus]\n이건 우리의 시' },
  { creator: 2, title: 'Neon Flow', tags: 'Hip-Hop, rap, dark synth', lyrics: '[Verse]\nNeon lights flickering\n[Chorus]\nFlow like water' },
  { creator: 2, title: '야행성', tags: 'Hip-Hop, Korean rap, nocturnal', lyrics: '[Verse]\n밤이 되면 깨어나\n[Chorus]\n야행성 본능' },
  // 소리나래
  { creator: 3, title: '그리운 날에', tags: 'Ballad, piano, emotional, Korean', lyrics: '[Verse]\n창밖에 비가 내리면\n그때가 생각나\n[Chorus]\n그리운 날에' },
  { creator: 3, title: '첫눈', tags: 'Ballad, strings, winter, romantic', lyrics: '[Verse]\n하얀 눈이 내리던 날\n[Chorus]\n첫눈처럼 설레는' },
  // 일렉트라
  { creator: 4, title: 'Electric Sunrise', tags: 'EDM, progressive house, festival, 128BPM', lyrics: '' },
  { creator: 4, title: 'Drop Zone', tags: 'EDM, future bass, synth drop', lyrics: '' },
  { creator: 4, title: 'Cyber Dream', tags: 'Electronic, synthwave, retro', lyrics: '' },
  // 재즈캣
  { creator: 5, title: 'Rainy Café', tags: 'Jazz, lo-fi, chill, piano, study', lyrics: '' },
  { creator: 5, title: 'Midnight Sax', tags: 'Jazz, saxophone, smooth, nocturnal', lyrics: '' },
  // 오로라
  { creator: 6, title: '여명의 노래', tags: 'OST, cinematic, epic strings, orchestral', lyrics: '[Verse]\n빛이 밝아오는 순간\n[Chorus]\n새로운 시작' },
  { creator: 6, title: 'Eternal Light', tags: 'OST, cinematic, piano, emotional', lyrics: '' },
  // 미드나잇
  { creator: 7, title: '도시의 밤', tags: 'R&B, hip-hop, urban, groovy', lyrics: '[Verse]\n네온사인 아래\n[Chorus]\n도시의 밤은 길어' },
  { creator: 7, title: 'Purple Haze', tags: 'R&B, atmospheric, dreamy', lyrics: '[Verse]\nPurple haze fills the room\n[Chorus]\nLost in the vibe' },
  // 벚꽃엔딩
  { creator: 8, title: '봄날의 기억', tags: 'Acoustic, folk, warm, guitar', lyrics: '[Verse]\n벚꽃이 흩날리던\n그 봄날의 기억\n[Chorus]\n다시 올까요' },
  { creator: 8, title: 'Sunset Walk', tags: 'Acoustic, gentle, fingerpicking', lyrics: '' },
  // 네온사운드
  { creator: 9, title: 'Neon City', tags: 'Electronic, future bass, energetic', lyrics: '' },
  { creator: 9, title: 'Digital Love', tags: 'Electronic, synthwave, romantic, retro', lyrics: '' },
  { creator: 9, title: 'Quantum Beats', tags: 'Electronic, experimental, glitch', lyrics: '' },
];

async function seed() {
  console.log('🌱 커뮤니티 더미 데이터 시드 시작...\n');

  let success = 0, fail = 0;

  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const c = creators[t.creator];
    const id = `seed_${Date.now()}_${i}`;
    const isInst = !t.lyrics;

    const row = {
      id,
      task_id: '',
      title: t.title,
      audio_url: 'https://cdn.example.com/demo.mp3',
      video_url: '',
      image_url: '',
      tags: t.tags,
      lyrics: t.lyrics || '',
      gen_mode: isInst ? 'custom' : 'custom',
      owner_name: c.name,
      owner_avatar: avatar(c.name),
      owner_provider: c.provider,
      is_public: true,
      comm_likes: Math.floor(Math.random() * 50) + 5,
      comm_dislikes: Math.floor(Math.random() * 3),
      comm_plays: Math.floor(Math.random() * 200) + 10,
      created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 86400000)).toISOString(),
    };

    try {
      const res = await sb('POST', '/tracks?on_conflict=id', row);
      if (Array.isArray(res) && res.length) {
        console.log(`  ✅ [${c.name}] ${t.title} — ❤️${row.comm_likes} ▶${row.comm_plays}`);
        success++;
      } else {
        console.log(`  ⚠️ [${c.name}] ${t.title} — ${JSON.stringify(res).slice(0, 80)}`);
        fail++;
      }
    } catch (e) {
      console.log(`  ❌ [${c.name}] ${t.title} — ${e.message}`);
      fail++;
    }
  }

  console.log(`\n🏁 완료: ${success}개 성공, ${fail}개 실패`);
  console.log(`👤 크리에이터 ${creators.length}명, 🎵 트랙 ${tracks.length}개`);
  console.log('\n아바타 예시:');
  creators.forEach(c => console.log(`  ${c.name}: ${avatar(c.name)}`));
}

seed().catch(e => { console.error('Fatal:', e); process.exit(1); });
