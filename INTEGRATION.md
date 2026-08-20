# 통합 작업 브랜치

**이 브랜치는 머지하지 않는다.** 백엔드와 앱을 실제로 붙여보고 확인하는 작업 공간이다.

## 왜 따로 있나

빌드하려면 `app.json` 의 EAS `projectId` 를 각자 계정 것으로 바꿔야 한다. 그 값을
`feat/app-server-wiring`(PR #9)에 커밋하면 머지될 때 `main` 으로 올라가고, 다른 사람은
"Entity not authorized" 로 빌드가 막힌다. 그래서 그런 변경은 전부 여기 담는다.

## 규칙

- **여기서 검증하고, 통과한 변경만 `feat/app-server-wiring` 으로 옮긴다.**
- `app.json` 의 `projectId`, 로컬 경로, 임시 디버그 코드는 여기 남긴다.
- PR 을 열지 않는다.

## 처음 한 번 — 내 EAS 프로젝트로 바꾸기

```bash
python3 -c "
import json
d = json.load(open('app.json'))
d['expo'].setdefault('extra', {}).setdefault('eas', {}).pop('projectId', None)
json.dump(d, open('app.json','w'), ensure_ascii=False, indent=2)"
npx eas-cli@latest init
git add app.json && git commit -m 'chore: 내 EAS 프로젝트로 빌드'
```

## dev client 빌드 (네이티브 모듈이 바뀔 때만)

```bash
npx eas-cli@latest build --profile development --platform android
```

QR 을 태블릿에서 찍어 APK 설치. **JS 만 고칠 때는 재빌드가 필요 없다** — Metro 가 실어 나른다.

## 매번 하는 실행

터미널 셋을 쓴다.

```bash
npm run server                                  # A: 콘텐츠 서버 :5056
npx expo start --dev-client -c --port 8081      # B: Metro (하나만!)
```

콘텐츠가 비어 있으면 C 에서 한 번:

```bash
node server/tools/ingest.js <영상.mp4> <자막.srt> \
  --id tinyping-001 --category story --label "이야기" \
  --title "슈팅스타 캐치! 티니핑" --emoji "⭐" --color "#FFD966" --crop-bottom 0.22
node server/tools/from-oneshot.js tinyping-001 <activities.json>
```

## 무엇을 보면 되나

| | 서버 연결됨 | 폴백(연결 실패) |
|---|---|---|
| 첫 퀴즈 | 27초 | 10초 |
| 문제 | 노란 머리 친구가 머리에 쓰고 있는 것은? | 우아핑의 색깔은? |
| 낱말 카드 | 모자 / 목도리 / 안경 | 노랑색 / 보라색 / … |

폴백이 걸려도 앱은 정상 동작한다 — 서버가 없으면 데모 상수로 도는 구조다.
다만 그건 연결 실패라는 뜻이다.

## 안 될 때

- **퀴즈가 10초에 뜬다** → 태블릿이 5056 에 못 닿는다. 태블릿 브라우저로
  `http://<맥IP>:5056/health` 를 열어본다. 맥 IP 는 `ipconfig getifaddr en0`.
  안 열리면 맥 방화벽이다.
- **영상이 안 나온다** → `curl -r 0-99 -o /dev/null -w "%{http_code}\n" \
  localhost:5056/media/video/tinyping-001.mp4` 가 206 이어야 한다.
- **iOS 실기기** → `contentBase()` 가 iOS 에서 `localhost` 로 고정돼 있어 시뮬레이터에서만
  된다. 5055 캐릭터 서버도 같은 제약이다. 실기기로 쓰려면 여기를 고쳐야 한다.

## 검증되면

변경을 `feat/app-server-wiring` 으로 옮긴다.

```bash
git checkout feat/app-server-wiring
git cherry-pick <커밋>          # app.json 커밋은 빼고
```
