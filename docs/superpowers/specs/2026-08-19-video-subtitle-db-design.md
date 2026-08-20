# 영상·자막 콘텐츠 DB 설계

작성: 2026-08-19 · 대상: Stary.(patti-app)

## 배경

지금 앱은 콘텐츠가 전부 상수다. `App.js:83`의 `LIBRARY`가 목데이터 22개고, `App.js:456`의 `ACTIVITIES`는 `{at:10,quiz} {at:20,trace} {at:30,puzzle}` 세 줄로 박혀 있다. 퀴즈도 `App.js:138`에 상수 하나뿐이다. 실제 영상은 `1mindemo.mp4`(37MB) 하나가 앱에 번들돼 있고, 같이 있는 `1mindemo.srt`는 코드 어디서도 안 쓴다.

부모 리포트가 쓰는 아이 기록도 메모리(`log` state)에만 있어서 앱을 껐다 켜면 날아간다.

영상은 계속 쌓일 예정이다. 영상 하나 늘 때마다 앱을 재배포할 수는 없다. 자막은 콘텐츠 생성 알고리즘의 입력으로 쓸 것이고, 그 결과물(퀴즈·따라그리기·퍼즐)도 어딘가 저장돼야 한다.

## 결정 사항

**콘텐츠와 아이 데이터를 한 DB에 담는다.** 처음엔 아이 데이터를 태블릿 SQLite로 빼려 했지만, 영상 자체가 서버에서 스트리밍되니 서버가 죽으면 앱도 못 돈다. 오프라인 대비가 값을 못 한다. DB 하나로 가면 부모 리포트를 맥에서 바로 조회할 수 있고 expo-sqlite 연동 코드도 안 쓴다.

**파이프라인은 사전 배치.** 영상을 넣을 때 분석·생성을 다 끝내고 DB에 넣는다. 앱은 완성된 것만 조회한다. 아이 그림 AI 변환만 지금처럼 런타임이다.

**서버는 맥에서 도는 로컬 노드 서버.** 지금 변환 서버(5055)가 이미 그렇게 동작하고 있어서 개발 흐름이 그대로 이어진다. 인터넷이 필요 없어 시연장 와이파이에 안 물린다. 나중에 클라우드로 옮길 때 스키마는 그대로 쓴다.

**자막은 항상 srt 파일로 들어온다.** 서버가 STT를 돌리지 않는다.

**콘텐츠 규모는 캐릭터 5개, 각 영상 2편으로 총 10편.** 파일은 직접 넣는다.

**목데이터 22개는 지운다.** 실제 영상 10편이면 라이브러리가 충분히 찬다. 껍데기 카드를 "준비중"으로 남기면 아이가 눌렀을 때 아무 일도 안 일어나 혼란만 준다.

## 구조

`patti-app/server/` 신규, 포트 5056, `npm run server`.

5055 변환 서버에 얹지 않는다. 그쪽은 `character-gen-test` 실험 리포고 콘텐츠 DB는 제품 핵심이라 수명이 다르다. 앱은 이미 `App.js:211`에서 `hostUri`로 host를 뽑으므로 포트만 하나 더 붙이면 된다. 나중에 변환 라우트를 이쪽으로 흡수하면 프로세스는 다시 하나가 된다.

DB는 `node:sqlite`. Node 22.16 내장이라 의존성이 0이다. 실행할 때 experimental 경고가 한 줄 뜨는 건 감수한다.

```
server/
  index.js          HTTP 서버
  db.js             스키마 + 쿼리
  srt.js            자막 파서
  test.js           자체검증
  tools/ingest.js   영상+자막 투입
  tools/generate.js 활동 생성
  data/stary.db
  media/            영상·썸네일·생성 이미지·아이 그림
```

## 스키마 — 콘텐츠

```sql
CREATE TABLE category (
  id    TEXT PRIMARY KEY,          -- 'story' 또는 캐릭터 id
  label TEXT NOT NULL,             -- 화면 칩에 뜨는 이름
  sort  INTEGER NOT NULL
);

CREATE TABLE video (
  id           TEXT PRIMARY KEY,   -- 'story-hachu-whale'
  category_id  TEXT NOT NULL REFERENCES category(id),
  title        TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  file_path    TEXT NOT NULL,      -- media/video/xxx.mp4
  thumb_path   TEXT,
  emoji        TEXT,               -- 지금 LIBRARY 카드가 쓰는 필드 그대로
  color        TEXT,
  status       TEXT NOT NULL,      -- draft | analyzing | ready | failed
  created_at   INTEGER NOT NULL
);

CREATE TABLE subtitle (
  id       INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES video(id),
  idx      INTEGER NOT NULL,       -- srt 번호
  start_ms INTEGER NOT NULL,
  end_ms   INTEGER NOT NULL,
  text     TEXT NOT NULL
);
CREATE INDEX subtitle_video_time ON subtitle(video_id, start_ms);

CREATE TABLE activity (
  id       INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES video(id),
  at_sec   INTEGER NOT NULL,
  type     TEXT NOT NULL,          -- quiz | trace | puzzle | color
  payload  TEXT NOT NULL           -- JSON
);
CREATE INDEX activity_video_time ON activity(video_id, at_sec);
```

카테고리를 캐릭터로 쓸지 장르로 쓸지는 스키마와 무관하다. 인제스트할 때 `--category`로 정하면 된다.

`activity.payload`는 타입마다 모양이 다르다. 앱 컴포넌트가 지금 받는 모양 그대로 넣는다.

```
quiz:   { title, options: [{ label, color, bg }], answer }   // App.js:138 quiz 상수와 같은 모양
trace:  { imagePath }                                        // 지금 trace_lineart_v2.png 자리
puzzle: { imagePath }                                        // 지금 puzzle_frame.png 자리, 조각은 런타임 랜덤
color:  { imagePath }
```

타입마다 필드가 다르니 컬럼으로 쪼개면 대부분 NULL이 된다. JSON 한 칸이 맞다.

`status`는 분석이 안 끝난 영상을 앱에 내보내지 않으려고 둔다. `ready`만 `/library`에 나간다. 파이프라인이 도는 중에 아이가 반쪽짜리 영상을 보는 사고를 막는다.

## 스키마 — 아이 데이터

```sql
CREATE TABLE child (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  age             INTEGER NOT NULL,
  daily_limit_min INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE TABLE session (                -- 영상 시청 1회
  id         INTEGER PRIMARY KEY,
  child_id   TEXT NOT NULL REFERENCES child(id),
  video_id   TEXT NOT NULL REFERENCES video(id),
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  watched_sec INTEGER
);
CREATE INDEX session_child_time ON session(child_id, started_at);

CREATE TABLE activity_result (        -- 활동 1개 수행 결과
  id           INTEGER PRIMARY KEY,
  session_id   INTEGER NOT NULL REFERENCES session(id),
  activity_id  INTEGER NOT NULL REFERENCES activity(id),
  result       TEXT NOT NULL,         -- correct | retry | skip | done
  drawing_path TEXT,                  -- 그림·AI 변환 결과 이미지
  created_at   INTEGER NOT NULL
);
```

`session.ended_at`이 NULL이면 아직 보는 중이거나 앱이 죽은 것이다. 리포트는 `watched_sec` 기준으로 집계하니 NULL 세션은 그냥 빠진다.

## API

기존 5055 서버와 같은 plain node `http` 스타일로 쓴다.

```
GET  /library
  → [{ id, label, videos: [{ id, title, duration_sec, emoji, color, thumbPath }] }]
    status='ready' 인 것만. 앱 LIBRARY 상수를 대체한다.

GET  /videos/:id
  → { id, title, videoPath, duration_sec, activities: [{ at, type, payload }] }
    앱 ACTIVITIES·quiz 상수를 대체한다.

GET  /media/*
  → mp4·이미지 서빙. Range 헤더 대응(206 Partial Content).

GET  /videos/:id/subtitles
  → [{ idx, start_ms, end_ms, text }]. 파이프라인·디버깅용이고 앱은 안 쓴다.

POST /children              → 온보딩에서 아이 등록. { name, age, daily_limit_min }
POST /sessions              → 시청 시작. { child_id, video_id } → { session_id }
PATCH /sessions/:id         → 시청 종료. { watched_sec }
POST /activity-results      → { session_id, activity_id, result, drawing }
GET  /children/:id/report   → 리포트 화면이 쓰는 집계
```

`duration_sec`는 초 단위 숫자로 내보내고 `'5:00'` 같은 표시 문자열은 앱이 만든다. `videoPath`·`thumbPath`·`drawing_path`는 `/media/...` 상대 경로다. 앱이 `hostUri`로 뽑은 base URL을 앞에 붙인다. 서버가 절대 URL을 만들면 IP가 바뀔 때마다 응답이 틀어진다.

**Range 대응이 핵심이다.** `expo-video`가 탐색하려면 서버가 206을 줘야 한다. 안 하면 재생은 되는데 seek이 죽거나 큰 파일에서 버퍼링이 이상해진다. 지금 5055 서버는 파일을 통째로 뱉는 방식이라 이 부분은 새로 쓴다.

## 인제스트

```bash
node server/tools/ingest.js 1mindemo.mp4 1mindemo.srt \
  --id story-hachu-whale --category story --title "고래보석의 전설"
```

파일을 `media/`로 복사하고, srt를 파싱해 `subtitle` 행을 넣고, `video` 행을 `status='draft'`로 만든다. 썸네일은 ffmpeg으로 프레임 한 장을 뽑아 자동 생성하고, ffmpeg이 없으면 `--thumb`으로 직접 지정한다. `video.id`는 자동 생성하지 않고 직접 준다. URL과 로그에서 읽기 쉽다.

```bash
node server/tools/generate.js story-hachu-whale
```

자막을 읽어 활동을 생성하고 `activity` 행과 도안 파일을 만든 뒤 `status='ready'`로 올린다.

**이번엔 `generate.js`를 목으로 만든다.** 지금 하드코딩된 세 줄과 퀴즈 상수를 그대로 DB에 꽂는 수준이다. 파이프라인 끝단(DB→API→앱)이 먼저 붙어 있어야 알고리즘을 개발할 때 결과를 바로 눈으로 확인할 수 있다. 진짜 알고리즘은 이 자리에 나중에 끼운다.

## 앱 변경 (App.js)

- `LIBRARY` 상수 삭제 → `GET /library`
- `ACTIVITIES`·`quiz` 상수 삭제 → `GET /videos/:id`의 activities
- `DEMO_VIDEO = require('./1mindemo.mp4')` → `{ uri }`. 번들에서 mp4를 뺀다(앱 37MB 감량)
- 온보딩에서 받은 이름·나이·사용시간을 `POST /children`으로 보내고 받은 `child_id`를 앱 상태에 둔다. AsyncStorage는 안 쓴다. 네이티브 모듈이라 EAS 빌드를 한 번 더 돌려야 하는데 그만한 값이 없다. 대신 `POST /children`이 이름+나이로 upsert하므로 앱을 껐다 켜고 같은 이름을 넣으면 같은 아이 행에 이어 쌓인다.
- 시청 시작·종료, 활동 결과를 서버로 보냄. 리포트는 `GET /children/:id/report`
- 서버 host는 기존 `hostUri` 방식을 그대로 쓰고 포트만 5056
- 서버가 죽었을 때는 에러 화면과 재시도 버튼. 캐시는 안 한다. 시연 때 캐시가 옛 데이터를 물고 있는 쪽이 더 위험하다.

## 테스트

`server/test.js` 하나. assert 기반 자체검증이고 프레임워크는 안 쓴다.

- srt 파서: 타임코드→ms 변환, 여러 줄 자막, 마지막 블록
- Range 응답: 206 상태코드, `Content-Range` 바이트 범위, 범위 없는 요청은 200
- 리포트 집계: 세션 여러 개에서 시청시간 합과 활동 정답 수

나머지는 CRUD라 검증할 로직이 없다.

## 안 하는 것

인증, 업로드 API(파일 복사는 CLI로 충분), 페이지네이션, 오프라인 캐시, STT.
