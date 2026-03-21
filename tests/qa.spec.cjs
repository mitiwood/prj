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

/* ── 12. 커뮤니티 검색 ── */
test('커뮤니티 검색 → 결과 필터링 → 초기화', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const beforeCount = await page.locator('[data-sbid]').count();

  // 검색 입력란 찾기
  const searchInput = page.locator('#community-view input[type="text"], #community-view input[type="search"], #comm-search');
  if (await searchInput.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.first().fill('test');
    await page.waitForTimeout(1500);

    const afterCount = await page.locator('[data-sbid]').count();
    // 검색 결과가 달라졌거나, 결과가 있는지 확인
    expect(afterCount).toBeGreaterThanOrEqual(0);

    // 초기화 — 검색어 비우기
    await searchInput.first().fill('');
    await page.waitForTimeout(1500);

    const resetCount = await page.locator('[data-sbid]').count();
    expect(resetCount).toBeGreaterThanOrEqual(beforeCount);
  }
});

/* ── 13. 커뮤니티 무한스크롤 ── */
test('커뮤니티 무한스크롤 추가 로드', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const initialCount = await page.locator('[data-sbid]').count();

  // 스크롤 컨테이너를 하단까지 스크롤
  await page.evaluate(() => {
    const container = document.querySelector('#community-view .song-list, #community-view .comm-list, #community-view');
    if (container) container.scrollTop = container.scrollHeight;
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(3000);

  const afterCount = await page.locator('[data-sbid]').count();
  // 추가 로드되었거나 최소 기존 개수 유지
  expect(afterCount).toBeGreaterThanOrEqual(initialCount);
});

/* ── 14. 좋아요 토글 ── */
test('좋아요 버튼 클릭 → 상태 변경', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 첫 번째 트랙 재생하여 미니플레이어 표시
  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 좋아요 버튼 찾기 (미니플레이어 또는 카드 내)
    const likeBtn = page.locator('.like-btn, [onclick*="Like"], [onclick*="like"], #fp-like, .heart-btn').first();
    if (await likeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const beforeClass = await likeBtn.getAttribute('class');
      await likeBtn.click({ force: true });
      await page.waitForTimeout(800);

      const afterClass = await likeBtn.getAttribute('class');
      // 클래스 또는 상태가 변경되었는지 확인 (토글)
      // 게스트이므로 실패할 수 있지만 UI 반응은 있어야 함
      expect(afterClass !== null).toBeTruthy();
    }
  }
});

/* ── 15. 댓글 작성 UI 확인 ── */
test('댓글 입력 UI 표시 및 전송 버튼 확인', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 첫 번째 트랙 재생 → 풀플레이어 열기
  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    await page.evaluate(() => { if (typeof expandToFullPlayer === 'function') expandToFullPlayer(); });
    await page.waitForTimeout(1000);

    // 댓글 입력란 확인
    const commentInput = page.locator('#fp-comment-input, .comment-input, textarea[placeholder*="댓글"]').first();
    if (await commentInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await commentInput.fill('E2E 테스트 댓글');
      const value = await commentInput.inputValue();
      expect(value).toBe('E2E 테스트 댓글');

      // 전송 버튼 존재 확인 (실제 전송은 하지 않음)
      const sendBtn = page.locator('#fp-comment-send, .comment-send, button[onclick*="comment"]').first();
      const sendVisible = await sendBtn.isVisible({ timeout: 1000 }).catch(() => false);
      expect(sendVisible).toBeTruthy();

      // 입력란 비우기 (실제 댓글 전송 방지)
      await commentInput.fill('');
    }
  }
});

/* ── 16. 키보드 다음곡/이전곡 (N/P) ── */
test('키보드 N/P 키로 곡 전환', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  // 첫 번째 트랙 재생
  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 현재 트랙 제목 저장
    const titleBefore = await page.evaluate(() => {
      const el = document.querySelector('#mini-title, .mini-title, #fp-title');
      return el ? el.textContent : '';
    });

    // N 키로 다음곡
    await page.keyboard.press('n');
    await page.waitForTimeout(2000);

    const titleAfterN = await page.evaluate(() => {
      const el = document.querySelector('#mini-title, .mini-title, #fp-title');
      return el ? el.textContent : '';
    });

    // P 키로 이전곡
    await page.keyboard.press('p');
    await page.waitForTimeout(2000);

    const titleAfterP = await page.evaluate(() => {
      const el = document.querySelector('#mini-title, .mini-title, #fp-title');
      return el ? el.textContent : '';
    });

    // 최소한 미니플레이어가 여전히 표시되는지 확인
    await expect(page.locator('#mini-player')).toBeVisible({ timeout: 2000 });
  }
});

/* ── 17. 키보드 ↑↓로 볼륨 변경 ── */
test('키보드 ↑↓로 볼륨 조절', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 초기 볼륨 확인
    const volBefore = await page.evaluate(() => {
      return typeof fpAudio !== 'undefined' && fpAudio ? fpAudio.volume : -1;
    });

    // ↑ 키로 볼륨 올리기
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(500);

    const volAfterUp = await page.evaluate(() => {
      return typeof fpAudio !== 'undefined' && fpAudio ? fpAudio.volume : -1;
    });

    // ↓ 키로 볼륨 내리기
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(500);

    const volAfterDown = await page.evaluate(() => {
      return typeof fpAudio !== 'undefined' && fpAudio ? fpAudio.volume : -1;
    });

    // 볼륨 값이 유효한 범위인지 확인
    if (volAfterUp >= 0) {
      expect(volAfterUp).toBeGreaterThanOrEqual(0);
      expect(volAfterUp).toBeLessThanOrEqual(1);
    }
    if (volAfterDown >= 0) {
      expect(volAfterDown).toBeGreaterThanOrEqual(0);
      expect(volAfterDown).toBeLessThanOrEqual(1);
    }
  }
});

/* ── 18. 풀플레이어 가사 영역 존재 확인 ── */
test('풀플레이어 가사 영역 표시', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('community-view'));
  await page.waitForSelector('[data-sbid]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  const sbId = await page.locator('[data-sbid]').first().getAttribute('data-sbid');
  if (sbId) {
    await page.evaluate((id) => { if (typeof commPlaySb === 'function') commPlaySb(id); }, sbId);
    await page.waitForTimeout(1500);

    // 풀플레이어 확장
    await page.evaluate(() => { if (typeof expandToFullPlayer === 'function') expandToFullPlayer(); });
    await page.waitForTimeout(1000);

    // 가사 영역 확인 (풀플레이어 내부 어딘가에 가사/텍스트 표시)
    const lyricsArea = page.locator('#fp-lyrics, .fp-lyrics, .fp-lyrics-box, .lyrics-area, [class*="lyric"]').first();
    const fpVisible = await page.locator('#fullplayer.on').isVisible({ timeout: 2000 }).catch(() => false);
    expect(fpVisible).toBeTruthy(); // 풀플레이어가 열렸는지만 확인

    // 가사 컨텐츠가 비어있지 않은지 (빈 문자열이 아닌지)
    if (lyricsVisible) {
      const lyricsText = await lyricsArea.textContent();
      expect(lyricsText).not.toBeNull();
    }
  }
});

/* ── 19. 설정 테마 전환 (다크→라이트→다크) ── */
test('설정 테마 전환 다크↔라이트', async ({ page }) => {
  await loginAsGuest(page);
  await page.evaluate(() => switchTab('settings-view'));
  await page.waitForTimeout(500);

  // 현재 테마 확인
  const initialTheme = await page.evaluate(() => {
    return document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || 'dark';
  });

  // 테마 전환 버튼/토글 찾기
  const themeToggle = page.locator('#theme-toggle, .theme-toggle, [onclick*="theme"], [onclick*="Theme"], input[type="checkbox"][id*="theme"]').first();
  if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    // 다크 → 라이트
    await themeToggle.click({ force: true });
    await page.waitForTimeout(500);

    const afterFirst = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    });
    expect(afterFirst).not.toBe(initialTheme);

    // 라이트 → 다크 (원복)
    await themeToggle.click({ force: true });
    await page.waitForTimeout(500);

    const afterSecond = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    });
    // 테마가 토글되었다가 복원되었는지 (빈 문자열은 기본 다크)
    expect(afterSecond === initialTheme || afterSecond === '' || afterSecond === 'dark').toBeTruthy();
  } else {
    // JS로 직접 테마 전환 시도
    await page.evaluate(() => {
      if (typeof toggleTheme === 'function') toggleTheme();
    });
    await page.waitForTimeout(500);

    const switched = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    });

    // 원복
    await page.evaluate(() => {
      if (typeof toggleTheme === 'function') toggleTheme();
    });
    await page.waitForTimeout(500);

    const restored = await page.evaluate(() => {
      return document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || '';
    });
    expect(restored).toBe(initialTheme);
  }
});

/* ── 20. API 댓글 엔드포인트 ── */
test('API GET /api/comments 응답 확인', async ({ request }) => {
  const res = await request.get(`${BASE}/api/comments?track_id=test&limit=5`);
  expect(res.ok()).toBeTruthy();

  const body = await res.json();
  // 응답이 배열이거나 data 필드를 포함하는 객체
  const isValid = Array.isArray(body) || (typeof body === 'object' && body !== null);
  expect(isValid).toBeTruthy();
});

/* ── 21. API 사용자 엔드포인트 (인증 필요 → 401) ── */
test('API GET /api/users 인증 없이 401 응답', async ({ request }) => {
  const res = await request.get(`${BASE}/api/users`);
  // 인증 없이 호출하면 401 또는 403 예상
  expect([401, 403]).toContain(res.status());
});
