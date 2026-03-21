// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'https://ai-music-studio-bice.vercel.app';

/* 게스트 로그인 헬퍼 — JS 직접 실행 */
async function loginAsGuest(page) {
  await page.goto(BASE);
  await page.waitForSelector('.app-wrap', { timeout: 10000 });
  await page.evaluate(() => {
    if (typeof guestLogin === 'function') guestLogin();
    else if (typeof socialLogin === 'function') socialLogin('guest');
  });
  await page.waitForTimeout(800);
}

/* ── 1. 사이트 로딩 ── */
test('사이트 정상 로딩', async ({ page }) => {
  const res = await page.goto(BASE);
  expect(res.status()).toBe(200);
  await expect(page.locator('.app-wrap')).toBeVisible({ timeout: 10000 });
});

/* ── 2. 게스트 로그인 → 로그인 버튼 표시 ── */
test('게스트 모드 → 로그아웃 버튼 없음', async ({ page }) => {
  await loginAsGuest(page);

  // 설정탭 이동
  await page.evaluate(() => { if (typeof switchTab === 'function') switchTab('settings-view'); });
  await page.waitForTimeout(500);

  const loginBtn = page.locator('#settings-login-btn');
  if (await loginBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    const text = await loginBtn.textContent();
    expect(text).not.toContain('로그아웃');
    expect(text).toContain('로그인');
  }
});

/* ── 3. 탭 전환 ── */
test('탭 전환 (커뮤니티/만들기/설정)', async ({ page }) => {
  await loginAsGuest(page);

  // 커뮤니티
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForTimeout(500);
  await expect(page.locator('#community-view')).toBeVisible();

  // 만들기
  await page.evaluate(() => switchTab('create-view'));
  await page.waitForTimeout(500);
  await expect(page.locator('#create-view')).toBeVisible();

  // 설정
  await page.evaluate(() => switchTab('settings-view'));
  await page.waitForTimeout(500);
  await expect(page.locator('#settings-view')).toBeVisible();
});

/* ── 4. 커뮤니티 트랙 리스트 렌더링 ── */
test('커뮤니티 트랙 리스트 로딩', async ({ page }) => {
  await loginAsGuest(page);

  await page.evaluate(() => switchTab('community-view'));
  // 트랙 로딩 대기 (최대 10초)
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const cards = page.locator('[data-sbid]');
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
});

/* ── 5. 트랙 클릭 → 미니플레이어 표시 ── */
test('트랙 클릭 시 미니플레이어 표시', async ({ page }) => {
  await loginAsGuest(page);

  await page.evaluate(() => switchTab('community-view'));
  await page.waitForTimeout(3000);

  // 첫 번째 트랙의 sbid를 가져와서 JS로 재생
  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => {
      if (typeof commPlaySb === 'function') commPlaySb(id);
    }, sbId);
    await page.waitForTimeout(1500);

    const miniPlayer = page.locator('#mini-player');
    await expect(miniPlayer).toBeVisible({ timeout: 3000 });
  }
});

/* ── 6. 미니플레이어 재생/일시정지 ── */
test('미니플레이어 재생/일시정지', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForTimeout(3000);

  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 재생 상태 확인
    const isPlaying = await page.evaluate(() => {
      return typeof fpAudio !== 'undefined' && fpAudio && !fpAudio.paused;
    });

    // 일시정지
    await page.evaluate(() => { if (fpAudio) fpAudio.pause(); });
    await page.waitForTimeout(500);
    const isPaused = await page.evaluate(() => fpAudio?.paused);
    expect(isPaused).toBeTruthy();

    // 다시 재생
    await page.evaluate(() => { if (fpAudio) fpAudio.play().catch(() => {}); });
    await page.waitForTimeout(500);
  }
});

/* ── 7. 풀플레이어 확장/축소 ── */
test('풀플레이어 확장/축소', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForTimeout(3000);

  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 풀플레이어 확장
    await page.evaluate(() => { if (typeof expandToFullPlayer === 'function') expandToFullPlayer(); });
    await page.waitForTimeout(1000);

    const fpVisible = await page.locator('#fullplayer.on').isVisible({ timeout: 2000 }).catch(() => false);
    expect(fpVisible).toBeTruthy();

    // 축소 (뒤로가기)
    const backBtn = page.locator('#fp-back');
    if (await backBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await backBtn.click({ force: true });
      await page.waitForTimeout(500);
    }
  }
});

/* ── 8. 만들기 탭 심플/커스텀 모드 전환 ── */
test('심플/커스텀 모드 전환', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('create-view'));
  await page.waitForTimeout(500);

  // 커스텀 모드 전환
  const customExists = await page.evaluate(() => {
    const btn = document.querySelector('[data-mode="custom"], .mode-btn[onclick*="custom"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  await page.waitForTimeout(500);

  // 심플 모드 전환
  const simpleExists = await page.evaluate(() => {
    const btn = document.querySelector('[data-mode="simple"], .mode-btn[onclick*="simple"]');
    if (btn) { btn.click(); return true; }
    return false;
  });

  await page.waitForTimeout(500);
  // 만들기 탭이 여전히 표시되는지
  await expect(page.locator('#create-view')).toBeVisible();
});

/* ── 9. 설정 탭 플랜카드 UI ── */
test('설정 탭 플랜카드 렌더링', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('settings-view'));
  await page.waitForTimeout(1000);

  const planExists = await page.evaluate(() => {
    return !!(document.querySelector('[id^="plan-card"]') || document.querySelector('.plan-card'));
  });
  expect(planExists).toBeTruthy();
});

/* ── 10. 모바일 반응형 (375x667) ── */
test('모바일 뷰포트 렌더링', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(BASE);
  await page.waitForSelector('.app-wrap', { timeout: 10000 });

  const box = await page.locator('.app-wrap').boundingBox();
  expect(box).not.toBeNull();
  expect(box.width).toBeLessThanOrEqual(375);
});

/* ── 11. API 엔드포인트 헬스체크 ── */
test('API 엔드포인트 응답', async ({ request }) => {
  const tracks = await request.get(`${BASE}/api/tracks?public=true&limit=1`);
  expect(tracks.ok()).toBeTruthy();

  const comments = await request.get(`${BASE}/api/comments?track_id=test&limit=1`);
  expect(comments.ok()).toBeTruthy();

  const kakao = await request.post(`${BASE}/api/kakao-webhook`, {
    data: { userRequest: { utterance: '상태', user: { id: 'e2e' } } },
  });
  expect(kakao.ok()).toBeTruthy();
  expect((await kakao.json()).version).toBe('2.0');
});
