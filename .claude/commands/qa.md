QA 점검 후 결과를 텔레그램 + 카카오로 리포팅하는 스킬.

**Instructions:**
1. 사용자가 지정한 항목 또는 기본 QA 항목을 코드 레벨에서 점검한다
2. 기본 QA 항목 (지정 없을 시):
   - 미니플레이어 재생/일시정지
   - 커뮤니티 리스트 클릭 재생
   - 풀플레이어 확장/축소
   - 다음곡 버튼
   - 플랜카드 UI
   - 오디오 에러 핸들링
   - stopAllAudio
   - 모바일 반응형
   - 생성실패 곡 필터링 (크리에이터뷰에서 audio_url 없거나 duration 0인 곡 미노출 확인)
   - DB 생성실패 곡 제외 (profile.js, tracks.js에서 audio_url 빈값/null 필터 쿼리 확인)
   - A/B 레이아웃 재생 (renderTracks 내 batchWrap 스코프 이벤트 바인딩, togglePlay idx+URL 비교, 자동 오디오 중지)

3. **음악생성 모드별 점검 (필수 — 모든 모드 수행):**
   각 모드의 generate 함수 → renderTracks → 재생 플로우를 코드 레벨에서 점검한다.

   | 모드 | 함수/엔트리 | 점검 항목 |
   |------|-------------|-----------|
   | **커스텀 (custom)** | `generate()` | 프롬프트/스타일 전달, API 호출, pollResult, renderTracks, A/B 카드 재생, historyData 저장 |
   | **심플 (simple)** | `generate()` (isSimple 분기) | 원클릭 생성, 가사 자동생성, 가사탭 기본 활성화, renderTracks, A/B 카드 재생 |
   | **유튜브 (youtube)** | YouTube 분기 generate | YouTube URL 파싱, 스타일 추출, renderTracks, A/B 카드 재생 |
   | **뮤비 (mv)** | `generateMV()` | 트랙 선택, MV API 호출, 비디오 URL 처리, MV 결과 재생 |

   **모드별 공통 점검:**
   - `renderTracks(tracks, prompt, style, mode)` 호출 시 mode 파라미터 정확한지
   - `batchWrap.querySelectorAll('.ap-play-btn')` 이벤트 바인딩 정상인지
   - `togglePlay` → `new Audio(url)` → `audio.play()` 체인에 에러 핸들링 있는지
   - 생성 결과 `lastTracks`에 `audioUrl`/`audio_url` 존재하는지
   - `historyData.unshift()` 시 `audio_url` 필드 매핑 정확한지
   - A/B 선택 버튼 이벤트 → 라이브러리 전환 정상인지
   - `showCompletionPopup()` → `gotoHistoryTab()` 타이밍 (재생 차단 여부)

4. 각 항목별로 관련 코드를 읽고 로직/문법/런타임 이슈를 확인한다
5. 버그 발견 시 즉시 수정하고 deploy 스킬로 배포한다

6. **생성/재생 이슈 발견 시 즉시 봇 긴급 알림:**
   모드별 점검에서 생성 실패 또는 재생 불가 이슈가 발견되면, QA 결과 표 전송 전에 먼저 긴급 알림을 별도 전송한다.

   ```python
   # 긴급 알림 (생성/재생 이슈 발견 시에만)
   alert = "[긴급] 음악 생성/재생 이슈 발견\n\n"
   alert += "모드: {모드명}\n"
   alert += "증상: {구체적 증상}\n"
   alert += "원인: {코드 위치 + 원인}\n"
   alert += "상태: {수정완료/수정필요}\n"
   alert += "\n상세는 QA 리포트 참고"
   ```

   긴급 알림 전송 후 QA 결과 표를 이어서 전송한다.

7. 결과를 아래 표 형식으로 텔레그램 + 카카오에 전송한다:

```
QA 전체 점검 결과

┌─────┬────────────────────────────┬─────────┐
│  #  │         점검 항목          │  결과   │
├─────┼────────────────────────────┼─────────┤
│     │ [공통]                     │         │
├─────┼────────────────────────────┼─────────┤
│ 1   │ 미니플레이어               │ ✅ 정상 │
│ ... │ ...                        │         │
├─────┼────────────────────────────┼─────────┤
│     │ [커스텀 모드]              │         │
├─────┼────────────────────────────┼─────────┤
│ 11  │ 생성 플로우                │ ✅ 정상 │
│ 12  │ A/B 카드 재생              │ ✅ 정상 │
│ 13  │ 히스토리 저장              │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│     │ [심플 모드]                │         │
├─────┼────────────────────────────┼─────────┤
│ 14  │ 생성 플로우                │ ✅ 정상 │
│ 15  │ A/B 카드 재생              │ ✅ 정상 │
│ 16  │ 가사 자동생성              │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│     │ [유튜브 모드]              │         │
├─────┼────────────────────────────┼─────────┤
│ 17  │ 생성 플로우                │ ✅ 정상 │
│ 18  │ A/B 카드 재생              │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│     │ [MV 모드]                  │         │
├─────┼────────────────────────────┼─────────┤
│ 19  │ MV 생성 플로우             │ ✅ 정상 │
│ 20  │ MV 재생                    │ ✅ 정상 │
└─────┴────────────────────────────┴─────────┘

수정 내역: (있을 경우)
- 항목N: 원인 → 수정 내용
```

8. 전송 방법 (Python + UTF-8 인코딩, curl 금지):
```python
import urllib.request, json
# Telegram
tg = json.dumps({'text': msg, 'parse_mode': ''}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer kenny2024!'}))
# Kakao
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
```

**필수 점검 항목 (크리티컬):**
- 인라인 onclick 함수가 window에 전역 노출됐는지 (strict mode 대응)
- 인라인 style="pointer-events:none;opacity:0" 이 CSS .on을 덮는지
- data-lucide 아이콘 이름이 Lucide에 존재하는지
- 바텀시트/모달 z-index가 하단탭(9999)보다 높은지 (10001+)
- 바텀시트 bottom이 하단탭(56px) 위인지
- Mixed Content: 외부 이미지/아바타 URL이 http://로 시작하는지 (반드시 _ensureHttps() 적용)
- 관리자 전용 API(401)를 일반 사용자 코드에서 호출하는지 (공개 엔드포인트 사용 필수)

**Rules:**
- 결과 표는 반드시 유니코드 박스 드로잉 문자(┌├└│─┼┬┴┐┤┘)로 구성
- 정상: ✅ 정상 / 수정됨: 🔧 수정 / 실패: ❌ 실패
- 텔레그램 parse_mode는 빈 문자열 (plain text)
- curl 사용 금지, Python urllib만 사용
- 항목 수는 가변 — 사용자가 지정하면 해당 항목만 점검
- **모드별 점검은 항상 4개 모드(custom, simple, youtube, mv) 전부 수행**
- **생성/재생 이슈 발견 시 긴급 봇 알림을 QA 표 전송 전에 먼저 발송**
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
