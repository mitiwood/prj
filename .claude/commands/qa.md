QA 점검 후 결과를 텔레그램 + 카카오로 리포팅하는 스킬.

**Instructions:**
1. 사용자가 지정한 항목 또는 기본 QA 항목을 코드 레벨에서 점검한다
2. 기본 QA 항목 (지정 없을 시):
   - 미니플레이어 재생/일시정지
   - 커뮤니티 리스트 클릭 재생
   - 풀플레이어 확장/축소
   - 다음곡 버튼
   - 심플모드 가사+AI 작사
   - 커스텀모드 생성
   - 플랜카드 UI
   - 오디오 에러 핸들링
   - stopAllAudio
   - 모바일 반응형
3. 각 항목별로 관련 코드를 읽고 로직/문법/런타임 이슈를 확인한다
4. 버그 발견 시 즉시 수정하고 deploy 스킬로 배포한다
5. 결과를 아래 표 형식으로 텔레그램 + 카카오에 전송한다:

```
#{이슈번호} QA 전체 점검 결과

┌─────┬────────────────────────────┬─────────┐
│  #  │         점검 항목          │  결과   │
├─────┼────────────────────────────┼─────────┤
│ 1   │ 항목명                     │ ✅ 정상 │
├─────┼────────────────────────────┼─────────┤
│ 2   │ 항목명                     │ ❌ 수정 │
└─────┴────────────────────────────┴─────────┘

수정 내역: (있을 경우)
- 항목2: 원인 → 수정 내용
```

6. 전송 방법 (Python + UTF-8 인코딩, curl 금지):
```python
import urllib.request, json
# Telegram
tg = json.dumps({'text': msg, 'parse_mode': ''}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/telegram', data=tg, headers={'Content-Type':'application/json; charset=utf-8','Authorization':'Bearer kenny2024!'}))
# Kakao
kk = json.dumps({'text': msg}, ensure_ascii=False).encode('utf-8')
urllib.request.urlopen(urllib.request.Request('https://ai-music-studio-bice.vercel.app/api/kakao-notify', data=kk, headers={'Content-Type':'application/json; charset=utf-8'}))
```

**Rules:**
- 결과 표는 반드시 유니코드 박스 드로잉 문자(┌├└│─┼┬┴┐┤┘)로 구성
- 정상: ✅ 정상 / 수정됨: 🔧 수정 / 실패: ❌ 실패
- 텔레그램 parse_mode는 빈 문자열 (plain text)
- curl 사용 금지, Python urllib만 사용
- 항목 수는 가변 — 사용자가 지정하면 해당 항목만 점검
- Working directory: C:\Users\pc\Downloads\kenny\ai-music-studio
