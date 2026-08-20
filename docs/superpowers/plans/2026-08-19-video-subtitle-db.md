# 영상·자막 콘텐츠 DB 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 영상·자막·활동·아이기록을 SQLite에 담고 HTTP로 서빙하는 로컬 서버를 세운 뒤, 앱의 하드코딩 상수를 그 API로 교체한다.

**Architecture:** `patti-app/server/`에 의존성 없는 node `http` 서버(포트 5056)를 새로 만든다. DB는 Node 22 내장 `node:sqlite` 파일 하나(`server/data/stary.db`). 영상·이미지는 `server/media/`에 두고 Range 지원 라우트로 서빙한다. 앱은 `LIBRARY`·`ACTIVITIES`·`quiz` 상수를 지우고 fetch로 받는다.

**Tech Stack:** Node 22.16 (`node:sqlite`, `node:http`, `node:assert`), Expo SDK 57 / RN 0.86, expo-video.

## Global Constraints

- 서버 런타임 의존성 0개. `node:sqlite`·`node:http`·`node:fs`만 쓴다. npm 패키지 추가 금지.
- Node 22.16에서 `node:sqlite`는 `ExperimentalWarning`을 한 줄 찍는다. 정상이다. 플래그는 필요 없다.
- 서버 포트는 5056. 5055는 기존 캐릭터 변환 서버라 건드리지 않는다.
- 서버는 `0.0.0.0`에 바인딩한다. `127.0.0.1`이면 태블릿이 못 붙는다.
- API 응답의 경로는 전부 `/media/...` 상대 경로다. 서버는 절대 URL을 만들지 않는다.
- 시간 컬럼은 전부 정수 epoch ms. 자막 시간만 영상 시작 기준 ms.
- 테스트는 `server/test.js` 한 파일, `node:assert` 기반. 테스트 프레임워크 추가 금지.
- 앱 코드는 기존 스타일을 따른다. 주석은 영어, UI 문구는 한국어.
- 커밋 메시지는 `feat:`/`test:`/`chore:` 접두사를 쓴다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `server/db.js` | 스키마 생성, DB 핸들 하나 export, 쿼리 함수 전부 |
| `server/srt.js` | srt 문자열 → `{idx, start_ms, end_ms, text}[]` 파싱. 순수 함수 |
| `server/media.js` | Range 헤더 해석 + 파일 스트리밍 응답 |
| `server/index.js` | 라우팅. 요청을 db/media 함수에 연결 |
| `server/test.js` | srt 파서 · Range 해석 · 리포트 집계 검증 |
| `server/tools/ingest.js` | mp4 + srt를 media/로 복사하고 DB 행 생성 |
| `server/tools/generate.js` | 자막 읽어 activity 행 생성 (이번엔 목) |
| `App.js` | 상수 제거, fetch 연결 |

`db.js`가 쿼리를 전부 들고 있는 이유는 SQL이 한 곳에 모여야 스키마를 바꿀 때 찾을 데가 하나이기 때문이다. `index.js`는 SQL을 직접 쓰지 않는다.

---

## Task 1: 서버 뼈대와 스키마

**Files:**
- Create: `server/db.js`
- Create: `server/index.js`
- Modify: `package.json` (scripts)
- Create: `server/.gitignore`

**Interfaces:**
- Consumes: 없음
- Produces: `db.js`가 `openDb(path)` → `DatabaseSync` 인스턴스를 export. 스키마가 없으면 만든다. `index.js`는 `GET /health` → `{ ok: true }`.

- [ ] **Step 1: `server/db.js` 작성**

```js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS category (
  id    TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS video (
  id           TEXT PRIMARY KEY,
  category_id  TEXT NOT NULL REFERENCES category(id),
  title        TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  file_path    TEXT NOT NULL,
  thumb_path   TEXT,
  emoji        TEXT,
  color        TEXT,
  status       TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS subtitle (
  id       INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES video(id),
  idx      INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms   INTEGER NOT NULL,
  text     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS subtitle_video_time ON subtitle(video_id, start_ms);
CREATE TABLE IF NOT EXISTS activity (
  id       INTEGER PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES video(id),
  at_sec   INTEGER NOT NULL,
  type     TEXT NOT NULL,
  payload  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS activity_video_time ON activity(video_id, at_sec);
CREATE TABLE IF NOT EXISTS child (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  age             INTEGER NOT NULL,
  daily_limit_min INTEGER NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS child_name_age ON child(name, age);
CREATE TABLE IF NOT EXISTS session (
  id          INTEGER PRIMARY KEY,
  child_id    TEXT NOT NULL REFERENCES child(id),
  video_id    TEXT NOT NULL REFERENCES video(id),
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER,
  watched_sec INTEGER
);
CREATE INDEX IF NOT EXISTS session_child_time ON session(child_id, started_at);
CREATE TABLE IF NOT EXISTS activity_result (
  id           INTEGER PRIMARY KEY,
  session_id   INTEGER NOT NULL REFERENCES session(id),
  activity_id  INTEGER NOT NULL REFERENCES activity(id),
  result       TEXT NOT NULL,
  drawing_path TEXT,
  created_at   INTEGER NOT NULL
);
`;

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}
```

- [ ] **Step 2: `server/index.js` 작성**

```js
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.STARY_PORT || 5056);
export const MEDIA_DIR = path.join(__dirname, 'media');

const db = openDb(path.join(__dirname, 'data', 'stary.db'));

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(text);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  json(res, 404, { error: 'not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`stary content server on http://0.0.0.0:${PORT}`);
});
```

- [ ] **Step 3: `server/.gitignore` 작성**

```
data/
media/
```

DB 파일과 영상은 git에 넣지 않는다. 영상은 수백 MB가 된다.

- [ ] **Step 4: package.json에 스크립트 추가**

`scripts`에 아래 줄을 넣는다. 기존 `start`/`ios`/`android`는 그대로 둔다.

```json
"server": "node server/index.js",
"server:test": "node server/test.js"
```

- [ ] **Step 5: 서버를 띄우고 health 확인**

Run: `npm run server` (별도 터미널에서 계속 띄워둔다)
Run: `curl -s localhost:5056/health`
Expected: `{"ok":true}`. 콘솔에 SQLite ExperimentalWarning 한 줄이 같이 뜨는 건 정상이다.

- [ ] **Step 6: DB 파일이 생겼는지 확인**

Run: `ls -la server/data/stary.db`
Expected: 파일이 존재한다.

- [ ] **Step 7: 커밋**

```bash
git add server/db.js server/index.js server/.gitignore package.json
git commit -m "feat: add content server skeleton with sqlite schema"
```

---

## Task 2: srt 파서

**Files:**
- Create: `server/srt.js`
- Create: `server/test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `parseSrt(text)` → `{ idx: number, start_ms: number, end_ms: number, text: string }[]`. `text`는 여러 줄 자막이면 `\n`으로 이어 붙인다.

- [ ] **Step 1: 실패하는 테스트 작성 — `server/test.js`**

```js
import assert from 'node:assert/strict';
import { parseSrt } from './srt.js';

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('parseSrt reads index, timecodes and text', () => {
  const out = parseSrt('1\n00:00:08,000 --> 00:00:11,700\n아기 고래를 너무 사랑해서\n');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { idx: 1, start_ms: 8000, end_ms: 11700, text: '아기 고래를 너무 사랑해서' });
});

test('parseSrt handles hours, minutes and multi-line cues', () => {
  const out = parseSrt(
    '1\n00:00:01,000 --> 00:00:02,000\nfirst\n\n' +
    '2\n01:02:03,456 --> 01:02:04,000\nline one\nline two\n\n'
  );
  assert.equal(out.length, 2);
  assert.equal(out[1].start_ms, 3723456);
  assert.equal(out[1].text, 'line one\nline two');
});

test('parseSrt keeps the last cue when the file has no trailing blank line', () => {
  const out = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nonly');
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'only');
});

test('parseSrt tolerates CRLF and a BOM', () => {
  const out = parseSrt('﻿1\r\n00:00:01,000 --> 00:00:02,000\r\nhello\r\n');
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'hello');
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: 실패 확인**

Run: `npm run server:test`
Expected: `Cannot find module ... srt.js` 로 죽는다.

- [ ] **Step 3: `server/srt.js` 구현**

```js
// Parse an SRT subtitle file into cue rows. Times are milliseconds from the start of the video.
const TIME = /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

const toMs = (h, m, s, ms) => ((+h * 60 + +m) * 60 + +s) * 1000 + +ms;

export function parseSrt(text) {
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const cues = [];
  for (const block of clean.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (lines.length < 2) continue;
    const timeLine = lines.findIndex((l) => TIME.test(l));
    if (timeLine === -1) continue;
    const m = TIME.exec(lines[timeLine]);
    cues.push({
      idx: Number(lines[timeLine - 1]) || cues.length + 1,
      start_ms: toMs(m[1], m[2], m[3], m[4]),
      end_ms: toMs(m[5], m[6], m[7], m[8]),
      text: lines.slice(timeLine + 1).join('\n'),
    });
  }
  return cues;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run server:test`
Expected: `4/4 passed`

- [ ] **Step 5: 실제 파일로 확인**

Run: `node -e "import('./server/srt.js').then(async m=>{const fs=await import('node:fs');const c=m.parseSrt(fs.readFileSync('1mindemo.srt','utf8'));console.log(c.length, c[0], c.at(-1))})"`
Expected: 큐 개수가 출력되고 첫 큐가 `{ idx: 1, start_ms: 8000, end_ms: 11700, text: '아기 고래를 너무 사랑해서' }`.

- [ ] **Step 6: 커밋**

```bash
git add server/srt.js server/test.js
git commit -m "test: add srt parser with cases for multi-line, CRLF and last cue"
```

---

## Task 3: Range 미디어 서빙

**Files:**
- Create: `server/media.js`
- Modify: `server/test.js` (테스트 추가)
- Modify: `server/index.js` (라우트 연결)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `parseRange(header, size)` → `{ start, end }` 또는 `null`(헤더 없음) 또는 `'invalid'`(범위가 파일 밖)
  - `serveFile(req, res, filePath)` → Range가 있으면 206, 없으면 200으로 파일을 흘려보낸다

- [ ] **Step 1: 실패하는 테스트 추가 — `server/test.js`의 import 줄 아래에 추가**

```js
import { parseRange } from './media.js';

test('parseRange returns null when there is no Range header', () => {
  assert.equal(parseRange(undefined, 1000), null);
});

test('parseRange reads a closed range', () => {
  assert.deepEqual(parseRange('bytes=0-499', 1000), { start: 0, end: 499 });
});

test('parseRange treats an open end as the last byte', () => {
  assert.deepEqual(parseRange('bytes=500-', 1000), { start: 500, end: 999 });
});

test('parseRange reads a suffix range', () => {
  assert.deepEqual(parseRange('bytes=-200', 1000), { start: 800, end: 999 });
});

test('parseRange rejects a start past the end of the file', () => {
  assert.equal(parseRange('bytes=2000-', 1000), 'invalid');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run server:test`
Expected: `media.js` 모듈이 없어서 죽는다.

- [ ] **Step 3: `server/media.js` 구현**

```js
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.mp4': 'video/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.srt': 'text/plain; charset=utf-8',
};

// Returns null for "no Range header", 'invalid' for a range outside the file, else {start, end}.
export function parseRange(header, size) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'invalid';
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return 'invalid';
  let start;
  let end;
  if (rawStart === '') {
    start = size - Number(rawEnd);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (start < 0) start = 0;
  if (end > size - 1) end = size - 1;
  if (start > end || start >= size) return 'invalid';
  return { start, end };
}

// Stream a file, honouring Range so expo-video can seek.
export function serveFile(req, res, filePath) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(404).end('not found');
    return;
  }
  const type = TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = parseRange(req.headers.range, stat.size);

  if (range === 'invalid') {
    res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
    return;
  }
  if (range === null) {
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  res.writeHead(206, {
    'Content-Type': type,
    'Content-Length': range.end - range.start + 1,
    'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
  });
  fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run server:test`
Expected: `9/9 passed`

- [ ] **Step 5: `server/index.js`에 `/media/` 라우트 추가**

`import { openDb }` 아래에 추가한다.

```js
import { serveFile } from './media.js';
```

`if (url.pathname === '/health')` 줄 아래에 추가한다.

```js
  if (url.pathname.startsWith('/media/')) {
    const rel = decodeURIComponent(url.pathname.slice('/media/'.length));
    const file = path.join(MEDIA_DIR, rel);
    // Keep a crafted path from escaping the media directory.
    if (!file.startsWith(MEDIA_DIR + path.sep)) return json(res, 400, { error: 'bad path' });
    return serveFile(req, res, file);
  }
```

- [ ] **Step 6: 실제 파일로 Range 확인**

Run: `mkdir -p server/media/video && cp 1mindemo.mp4 server/media/video/`
Run: 서버를 재시작한 뒤 `curl -s -D - -o /dev/null -H 'Range: bytes=0-99' localhost:5056/media/video/1mindemo.mp4`
Expected: `HTTP/1.1 206 Partial Content`, `Content-Range: bytes 0-99/37839816`, `Content-Length: 100`

Run: `curl -s -D - -o /dev/null localhost:5056/media/video/1mindemo.mp4`
Expected: `HTTP/1.1 200 OK`, `Accept-Ranges: bytes`

- [ ] **Step 7: 커밋**

```bash
git add server/media.js server/index.js server/test.js
git commit -m "feat: serve media with Range support for video seeking"
```

---

## Task 4: 인제스트 CLI

**Files:**
- Modify: `server/db.js` (쓰기 함수 추가)
- Create: `server/tools/ingest.js`

**Interfaces:**
- Consumes: `openDb`, `parseSrt`
- Produces: `db.js`가 아래를 export
  - `upsertCategory(db, { id, label, sort })` → void
  - `insertVideo(db, { id, category_id, title, duration_sec, file_path, thumb_path, emoji, color })` → void. `status`는 `'draft'`, `created_at`은 함수 안에서 채운다
  - `replaceSubtitles(db, videoId, cues)` → void. 기존 자막을 지우고 다시 넣는다

- [ ] **Step 1: `server/db.js`에 쓰기 함수 추가**

```js
export function upsertCategory(db, { id, label, sort }) {
  db.prepare(
    `INSERT INTO category (id, label, sort) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET label = excluded.label, sort = excluded.sort`
  ).run(id, label, sort);
}

export function insertVideo(db, v) {
  db.prepare(
    `INSERT INTO video (id, category_id, title, duration_sec, file_path, thumb_path, emoji, color, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id, title = excluded.title,
       duration_sec = excluded.duration_sec, file_path = excluded.file_path,
       thumb_path = excluded.thumb_path, emoji = excluded.emoji, color = excluded.color`
  ).run(v.id, v.category_id, v.title, v.duration_sec, v.file_path, v.thumb_path ?? null,
        v.emoji ?? null, v.color ?? null, Date.now());
}

export function replaceSubtitles(db, videoId, cues) {
  db.prepare('DELETE FROM subtitle WHERE video_id = ?').run(videoId);
  const insert = db.prepare('INSERT INTO subtitle (video_id, idx, start_ms, end_ms, text) VALUES (?, ?, ?, ?, ?)');
  for (const c of cues) insert.run(videoId, c.idx, c.start_ms, c.end_ms, c.text);
}
```

- [ ] **Step 2: `server/tools/ingest.js` 작성**

```js
// Put one video and its subtitles into the library.
//   node server/tools/ingest.js <video.mp4> <subs.srt> --id <id> --category <cat> --title <title>
// Optional: --label <카테고리 표시이름> --emoji 🐳 --color '#dbeafe' --thumb <file.png>
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openDb, upsertCategory, insertVideo, replaceSubtitles } from '../db.js';
import { parseSrt } from '../srt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');
const MEDIA_DIR = path.join(SERVER_DIR, 'media');

const [, , videoArg, srtArg, ...rest] = process.argv;
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];

if (!videoArg || !srtArg || !opt.id || !opt.category || !opt.title) {
  console.error('usage: ingest.js <video.mp4> <subs.srt> --id <id> --category <cat> --title <title>');
  process.exit(1);
}

// ffprobe gives the real duration. Without ffmpeg installed, pass --duration <seconds>.
function probeDuration(file) {
  if (opt.duration) return Number(opt.duration);
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', file,
    ]).toString().trim();
    return Math.round(Number(out));
  } catch {
    console.error('ffprobe not found. pass --duration <seconds>');
    process.exit(1);
  }
}

function makeThumb(file, outPath) {
  if (opt.thumb) {
    fs.copyFileSync(opt.thumb, outPath);
    return true;
  }
  try {
    execFileSync('ffmpeg', ['-y', '-ss', '3', '-i', file, '-frames:v', '1', '-vf', 'scale=480:-1', outPath]);
    return true;
  } catch {
    console.warn('no thumbnail: ffmpeg missing and --thumb not given');
    return false;
  }
}

fs.mkdirSync(path.join(MEDIA_DIR, 'video'), { recursive: true });
fs.mkdirSync(path.join(MEDIA_DIR, 'thumb'), { recursive: true });

const videoRel = `video/${opt.id}${path.extname(videoArg)}`;
const thumbRel = `thumb/${opt.id}.png`;
fs.copyFileSync(videoArg, path.join(MEDIA_DIR, videoRel));
const hasThumb = makeThumb(path.join(MEDIA_DIR, videoRel), path.join(MEDIA_DIR, thumbRel));

const db = openDb(path.join(SERVER_DIR, 'data', 'stary.db'));
upsertCategory(db, { id: opt.category, label: opt.label || opt.category, sort: Number(opt.sort || 0) });
insertVideo(db, {
  id: opt.id,
  category_id: opt.category,
  title: opt.title,
  duration_sec: probeDuration(path.join(MEDIA_DIR, videoRel)),
  file_path: videoRel,
  thumb_path: hasThumb ? thumbRel : null,
  emoji: opt.emoji,
  color: opt.color,
});

const cues = parseSrt(fs.readFileSync(srtArg, 'utf8'));
replaceSubtitles(db, opt.id, cues);

console.log(`ingested ${opt.id}: ${cues.length} cues, status=draft`);
```

- [ ] **Step 3: 데모 영상으로 실행**

Run:
```bash
node server/tools/ingest.js 1mindemo.mp4 1mindemo.srt \
  --id story-whale-legend --category story --label 동화 --sort 0 \
  --title "고래보석의 전설" --emoji 🐳 --color '#dbeafe'
```
Expected: `ingested story-whale-legend: 19 cues, status=draft` (큐 개수는 실제 파일 기준)

ffmpeg이 없으면 `--duration 60`을 붙이고 썸네일 경고는 무시한다.

- [ ] **Step 4: DB에 들어갔는지 확인**

Run: `node -e "import('./server/db.js').then(m=>{const db=m.openDb('server/data/stary.db');console.log(db.prepare('select id,title,status,duration_sec from video').all());console.log(db.prepare('select count(*) c from subtitle').get())})"`
Expected: video 행 1개(status `draft`), subtitle count가 큐 개수와 같다.

- [ ] **Step 5: 커밋**

```bash
git add server/db.js server/tools/ingest.js
git commit -m "feat: add ingest CLI for video and subtitles"
```

---

## Task 5: 활동 생성 (목)

**Files:**
- Modify: `server/db.js` (activity 쓰기 + status 갱신)
- Create: `server/tools/generate.js`

**Interfaces:**
- Consumes: `openDb`
- Produces: `db.js`가 아래를 export
  - `replaceActivities(db, videoId, rows)` — `rows`는 `{ at_sec, type, payload }[]`, `payload`는 객체이고 함수가 JSON 문자열로 만든다
  - `setVideoStatus(db, videoId, status)`
  - `getSubtitles(db, videoId)` → `{ idx, start_ms, end_ms, text }[]`

- [ ] **Step 1: `server/db.js`에 함수 추가**

```js
export function getSubtitles(db, videoId) {
  return db.prepare('SELECT idx, start_ms, end_ms, text FROM subtitle WHERE video_id = ? ORDER BY start_ms').all(videoId);
}

export function replaceActivities(db, videoId, rows) {
  db.prepare('DELETE FROM activity WHERE video_id = ?').run(videoId);
  const insert = db.prepare('INSERT INTO activity (video_id, at_sec, type, payload) VALUES (?, ?, ?, ?)');
  for (const r of rows) insert.run(videoId, r.at_sec, r.type, JSON.stringify(r.payload));
}

export function setVideoStatus(db, videoId, status) {
  db.prepare('UPDATE video SET status = ? WHERE id = ?').run(status, videoId);
}
```

- [ ] **Step 2: `server/tools/generate.js` 작성**

```js
// Build the activity schedule for one video.
//   node server/tools/generate.js <video_id>
// The real analysis lands here later. For now it plants the schedule the app already ships with,
// so the DB → API → app path can be exercised end to end.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getSubtitles, replaceActivities, setVideoStatus } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

const videoId = process.argv[2];
if (!videoId) {
  console.error('usage: generate.js <video_id>');
  process.exit(1);
}

const db = openDb(path.join(SERVER_DIR, 'data', 'stary.db'));
const video = db.prepare('SELECT id, duration_sec FROM video WHERE id = ?').get(videoId);
if (!video) {
  console.error(`no video ${videoId}`);
  process.exit(1);
}

setVideoStatus(db, videoId, 'analyzing');
const cues = getSubtitles(db, videoId);
console.log(`${cues.length} cues, ${video.duration_sec}s`);

// ponytail: fixed schedule stands in for the analysis. Swap this block for the real generator.
const rows = [
  {
    at_sec: 10,
    type: 'quiz',
    payload: {
      title: '우아핑의 색깔은?',
      options: [
        { label: '노랑색', color: '#f0ae03', bg: '#fffaf0' },
        { label: '보라색', color: '#9b5de5', bg: '#f6f0ff' },
        { label: '하늘색', color: '#00CFE9', bg: '#f1fdff' },
        { label: '핑크색', color: '#e24e9e', bg: '#fff4fa' },
      ],
      answer: '하늘색',
    },
  },
  { at_sec: 20, type: 'trace', payload: { imagePath: 'lineart/trace_lineart_v2.png' } },
  { at_sec: 30, type: 'puzzle', payload: { imagePath: 'lineart/puzzle_frame.png' } },
];

replaceActivities(db, videoId, rows);
setVideoStatus(db, videoId, 'ready');
console.log(`${videoId}: ${rows.length} activities, status=ready`);
```

- [ ] **Step 3: 도안 이미지를 media로 복사**

Run: `mkdir -p server/media/lineart && cp assets/trace_lineart_v2.png assets/puzzle_frame.png server/media/lineart/`
Expected: 두 파일이 복사된다.

- [ ] **Step 4: 실행**

Run: `node server/tools/generate.js story-whale-legend`
Expected: `story-whale-legend: 3 activities, status=ready`

- [ ] **Step 5: 커밋**

```bash
git add server/db.js server/tools/generate.js
git commit -m "feat: add activity generator with a stand-in schedule"
```

---

## Task 6: 콘텐츠 API

**Files:**
- Modify: `server/db.js` (읽기 함수)
- Modify: `server/index.js` (라우트)

**Interfaces:**
- Consumes: `openDb`
- Produces: `db.js`가 `getLibrary(db)`, `getVideo(db, id)`를 export
  - `getLibrary(db)` → `[{ id, label, videos: [{ id, title, duration_sec, emoji, color, thumbPath }] }]`
  - `getVideo(db, id)` → `{ id, title, videoPath, duration_sec, activities: [{ id, at, type, payload }] }` 또는 `null`. `payload`는 파싱된 객체다

- [ ] **Step 1: `server/db.js`에 읽기 함수 추가**

```js
export function getLibrary(db) {
  const cats = db.prepare('SELECT id, label FROM category ORDER BY sort, id').all();
  const videos = db.prepare(
    `SELECT id, category_id, title, duration_sec, emoji, color, thumb_path
     FROM video WHERE status = 'ready' ORDER BY created_at`
  ).all();
  return cats
    .map((c) => ({
      id: c.id,
      label: c.label,
      videos: videos
        .filter((v) => v.category_id === c.id)
        .map((v) => ({
          id: v.id, title: v.title, duration_sec: v.duration_sec,
          emoji: v.emoji, color: v.color,
          thumbPath: v.thumb_path ? `/media/${v.thumb_path}` : null,
        })),
    }))
    .filter((c) => c.videos.length > 0);
}

export function getVideo(db, id) {
  const v = db.prepare('SELECT id, title, duration_sec, file_path FROM video WHERE id = ?').get(id);
  if (!v) return null;
  const acts = db.prepare('SELECT id, at_sec, type, payload FROM activity WHERE video_id = ? ORDER BY at_sec').all(id);
  return {
    id: v.id,
    title: v.title,
    duration_sec: v.duration_sec,
    videoPath: `/media/${v.file_path}`,
    activities: acts.map((a) => ({ id: a.id, at: a.at_sec, type: a.type, payload: JSON.parse(a.payload) })),
  };
}
```

`getLibrary`가 빈 카테고리를 걸러내는 이유는 영상이 하나도 없는 칩이 화면에 떠 있으면 눌렀을 때 빈 화면이 나오기 때문이다.

- [ ] **Step 2: `server/index.js`에 라우트 추가**

import 줄을 아래로 바꾼다.

```js
import { openDb, getLibrary, getVideo, getSubtitles } from './db.js';
```

`/media/` 블록 아래에 추가한다.

```js
  if (url.pathname === '/library') return json(res, 200, getLibrary(db));

  const videoMatch = /^\/videos\/([^/]+)$/.exec(url.pathname);
  if (videoMatch) {
    const v = getVideo(db, decodeURIComponent(videoMatch[1]));
    return v ? json(res, 200, v) : json(res, 404, { error: 'no such video' });
  }

  const subsMatch = /^\/videos\/([^/]+)\/subtitles$/.exec(url.pathname);
  if (subsMatch) return json(res, 200, getSubtitles(db, decodeURIComponent(subsMatch[1])));
```

- [ ] **Step 3: 서버 재시작 후 확인**

Run: `curl -s localhost:5056/library`
Expected: 카테고리 1개, 그 안에 `story-whale-legend` 1개. `thumbPath`가 `/media/thumb/...` 또는 `null`.

Run: `curl -s localhost:5056/videos/story-whale-legend`
Expected: `videoPath`가 `/media/video/story-whale-legend.mp4`, `activities` 3개, 첫 활동 `payload.answer`가 `하늘색`.

Run: `curl -s localhost:5056/videos/story-whale-legend/subtitles | head -c 200`
Expected: 자막 배열이 나온다.

Run: `curl -s -o /dev/null -w '%{http_code}' localhost:5056/videos/nope`
Expected: `404`

- [ ] **Step 4: 커밋**

```bash
git add server/db.js server/index.js
git commit -m "feat: serve library and video detail from the database"
```

---

## Task 7: 아이 데이터 API

**Files:**
- Modify: `server/db.js` (아이 데이터 함수)
- Modify: `server/index.js` (라우트 + POST 본문 읽기)
- Modify: `server/test.js` (리포트 집계 테스트)

**Interfaces:**
- Consumes: `openDb`
- Produces: `db.js`가 아래를 export
  - `upsertChild(db, { name, age, daily_limit_min })` → `{ id }`. 같은 이름+나이면 기존 행을 준다
  - `startSession(db, { child_id, video_id })` → `{ id }`
  - `endSession(db, id, watched_sec)` → void
  - `addActivityResult(db, { session_id, activity_id, result, drawing_path })` → void
  - `getReport(db, childId)` → `{ watched_sec, videos, quiz_correct, drawing, skip, recent: [{ video_id, title, started_at, watched_sec }] }`

- [ ] **Step 1: 실패하는 리포트 테스트를 `server/test.js`에 추가**

파일 위쪽 import에 추가한다.

```js
import { openDb, upsertChild, startSession, endSession, addActivityResult, getReport,
         upsertCategory, insertVideo, replaceActivities } from './db.js';
```

테스트를 추가한다.

```js
test('getReport sums watch time and counts activity results', () => {
  const db = openDb(':memory:');
  upsertCategory(db, { id: 'c', label: 'c', sort: 0 });
  insertVideo(db, { id: 'v1', category_id: 'c', title: 'V1', duration_sec: 60, file_path: 'video/v1.mp4' });
  replaceActivities(db, 'v1', [
    { at_sec: 10, type: 'quiz', payload: {} },
    { at_sec: 20, type: 'trace', payload: {} },
  ]);
  const acts = db.prepare('SELECT id FROM activity WHERE video_id = ? ORDER BY at_sec').all('v1');

  const child = upsertChild(db, { name: '아리', age: 5, daily_limit_min: 30 });
  const again = upsertChild(db, { name: '아리', age: 5, daily_limit_min: 60 });
  assert.equal(again.id, child.id);

  const s1 = startSession(db, { child_id: child.id, video_id: 'v1' });
  endSession(db, s1.id, 40);
  const s2 = startSession(db, { child_id: child.id, video_id: 'v1' });
  endSession(db, s2.id, 25);
  startSession(db, { child_id: child.id, video_id: 'v1' }); // still open, must not count

  addActivityResult(db, { session_id: s1.id, activity_id: acts[0].id, result: 'correct' });
  addActivityResult(db, { session_id: s1.id, activity_id: acts[1].id, result: 'done', drawing_path: 'draw/a.png' });
  addActivityResult(db, { session_id: s2.id, activity_id: acts[0].id, result: 'skip' });

  const r = getReport(db, child.id);
  assert.equal(r.watched_sec, 65);
  assert.equal(r.videos, 2);
  assert.equal(r.quiz_correct, 1);
  assert.equal(r.drawing, 1);
  assert.equal(r.skip, 1);
  assert.equal(r.recent[0].title, 'V1');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run server:test`
Expected: `upsertChild is not a function` 류로 실패한다.

- [ ] **Step 3: `server/db.js`에 아이 데이터 함수 추가**

```js
export function upsertChild(db, { name, age, daily_limit_min }) {
  const found = db.prepare('SELECT id FROM child WHERE name = ? AND age = ?').get(name, age);
  if (found) {
    db.prepare('UPDATE child SET daily_limit_min = ? WHERE id = ?').run(daily_limit_min, found.id);
    return { id: found.id };
  }
  const id = `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO child (id, name, age, daily_limit_min, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, name, age, daily_limit_min, Date.now());
  return { id };
}

export function startSession(db, { child_id, video_id }) {
  const info = db.prepare('INSERT INTO session (child_id, video_id, started_at) VALUES (?, ?, ?)')
    .run(child_id, video_id, Date.now());
  return { id: Number(info.lastInsertRowid) };
}

export function endSession(db, id, watchedSec) {
  db.prepare('UPDATE session SET ended_at = ?, watched_sec = ? WHERE id = ?').run(Date.now(), watchedSec, id);
}

export function addActivityResult(db, { session_id, activity_id, result, drawing_path }) {
  db.prepare(
    'INSERT INTO activity_result (session_id, activity_id, result, drawing_path, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(session_id, activity_id, result, drawing_path ?? null, Date.now());
}

export function getReport(db, childId) {
  const totals = db.prepare(
    `SELECT COALESCE(SUM(watched_sec), 0) AS watched_sec, COUNT(*) AS videos
     FROM session WHERE child_id = ? AND ended_at IS NOT NULL`
  ).get(childId);

  const counts = db.prepare(
    `SELECT a.type AS type, r.result AS result, COUNT(*) AS n
     FROM activity_result r
     JOIN session s ON s.id = r.session_id
     JOIN activity a ON a.id = r.activity_id
     WHERE s.child_id = ?
     GROUP BY a.type, r.result`
  ).all(childId);

  const sum = (fn) => counts.filter(fn).reduce((n, row) => n + row.n, 0);

  const recent = db.prepare(
    `SELECT s.video_id, v.title, s.started_at, s.watched_sec
     FROM session s JOIN video v ON v.id = s.video_id
     WHERE s.child_id = ? AND s.ended_at IS NOT NULL
     ORDER BY s.started_at DESC LIMIT 10`
  ).all(childId);

  return {
    watched_sec: totals.watched_sec,
    videos: totals.videos,
    quiz_correct: sum((r) => r.type === 'quiz' && r.result === 'correct'),
    drawing: sum((r) => (r.type === 'trace' || r.type === 'color') && r.result === 'done'),
    skip: sum((r) => r.result === 'skip'),
    recent,
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run server:test`
Expected: `10/10 passed`

- [ ] **Step 5: `server/index.js`에 본문 파서와 라우트 추가**

import를 아래로 바꾼다.

```js
import { openDb, getLibrary, getVideo, getSubtitles, upsertChild, startSession,
         endSession, addActivityResult, getReport } from './db.js';
```

`json` 함수 아래에 추가한다.

```js
async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
```

자막 라우트 아래에 추가한다.

```js
  if (url.pathname === '/children' && req.method === 'POST') {
    const b = await readJson(req);
    if (!b.name) return json(res, 400, { error: 'name required' });
    return json(res, 200, upsertChild(db, {
      name: b.name, age: Number(b.age ?? 5), daily_limit_min: Number(b.daily_limit_min ?? 30),
    }));
  }

  if (url.pathname === '/sessions' && req.method === 'POST') {
    const b = await readJson(req);
    return json(res, 200, startSession(db, { child_id: b.child_id, video_id: b.video_id }));
  }

  const sessionMatch = /^\/sessions\/(\d+)$/.exec(url.pathname);
  if (sessionMatch && req.method === 'PATCH') {
    const b = await readJson(req);
    endSession(db, Number(sessionMatch[1]), Number(b.watched_sec ?? 0));
    return json(res, 200, { ok: true });
  }

  if (url.pathname === '/activity-results' && req.method === 'POST') {
    const b = await readJson(req);
    addActivityResult(db, b);
    return json(res, 200, { ok: true });
  }

  const reportMatch = /^\/children\/([^/]+)\/report$/.exec(url.pathname);
  if (reportMatch) return json(res, 200, getReport(db, decodeURIComponent(reportMatch[1])));
```

- [ ] **Step 6: 서버 재시작 후 흐름 확인**

Run:
```bash
CHILD=$(curl -s -X POST localhost:5056/children -d '{"name":"아리","age":5,"daily_limit_min":30}' | sed 's/.*"id":"\([^"]*\)".*/\1/')
SESSION=$(curl -s -X POST localhost:5056/sessions -d "{\"child_id\":\"$CHILD\",\"video_id\":\"story-whale-legend\"}" | sed 's/.*"id":\([0-9]*\).*/\1/')
curl -s -X PATCH localhost:5056/sessions/$SESSION -d '{"watched_sec":42}'
curl -s localhost:5056/children/$CHILD/report
```
Expected: 마지막 응답의 `watched_sec`가 42, `videos`가 1, `recent[0].title`이 `고래보석의 전설`.

- [ ] **Step 7: 커밋**

```bash
git add server/db.js server/index.js server/test.js
git commit -m "feat: record child sessions and activity results"
```

---

## Task 8: 앱을 라이브러리·영상 API에 연결

**Files:**
- Modify: `App.js` (상수 제거, fetch 추가)

**Interfaces:**
- Consumes: `GET /library`, `GET /videos/:id`
- Produces: `App.js` 안의 `serverBase()` → `http://<host>:5056` 문자열. 이후 Task 9가 같은 함수를 쓴다

- [ ] **Step 1: `serverBase` 헬퍼 추가**

`App.js`에서 `Constants.expoConfig?.hostUri`를 쓰는 기존 코드(211행 근처) 위에 추가한다.

```js
// The dev server host doubles as the content server host; only the port differs.
function serverBase(port) {
  const hostUri = Constants.expoConfig?.hostUri || '';
  const host = hostUri.split(':')[0] || 'localhost';
  return `http://${host}:${port}`;
}
```

`fetch(\`http://${host}:5055/generate-character\`)` 부분은 `fetch(\`${serverBase(5055)}/generate-character\`)`로 바꾼다. 기존 `hostUri`/`host` 지역 변수는 안 쓰게 되면 지운다.

- [ ] **Step 2: 라이브러리 로딩 상태 추가**

`const [selectedVideo, setSelectedVideo] = useState(null);` 아래에 추가한다.

```js
  const [library, setLibrary] = useState(null);   // null = 로딩 중
  const [libraryError, setLibraryError] = useState('');
  const [videoDetail, setVideoDetail] = useState(null);

  const loadLibrary = useCallback(async () => {
    setLibraryError('');
    try {
      const res = await fetch(`${serverBase(5056)}/library`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLibrary(await res.json());
    } catch (err) {
      setLibrary([]);
      setLibraryError(`영상 목록을 불러오지 못했어요. ${err.message}`);
    }
  }, []);

  useEffect(() => { loadLibrary(); }, [loadLibrary]);
```

`useCallback`이 import에 없으면 `react` import 줄에 추가한다.

- [ ] **Step 3: 영상 선택 시 상세를 받아오게 수정**

`onStart={(v) => { setSelectedVideo(v || null); setScreen('watch'); }}` 를 아래로 바꾼다.

```js
              onStart={async (v) => {
                setSelectedVideo(v || null);
                setVideoDetail(null);
                setScreen('watch');
                try {
                  const res = await fetch(`${serverBase(5056)}/videos/${v.id}`);
                  setVideoDetail(await res.json());
                } catch {
                  setVideoDetail({ activities: [] });
                }
              }}
```

- [ ] **Step 4: `LIBRARY`·`ACTIVITIES`·`quiz`·`DEMO_VIDEO` 상수 삭제**

- `App.js:33` `const DEMO_VIDEO = require('./1mindemo.mp4');` 삭제
- `App.js:83` `const LIBRARY = [...]` 전체 삭제
- `App.js:138` `const quiz = {...}` 삭제
- `App.js:456` `const ACTIVITIES = [...]` 삭제

- [ ] **Step 5: `HomeScreen`이 서버 라이브러리를 받게 수정**

`HomeScreen`에 `library` prop을 넘기고, 내부의 `LIBRARY` 참조를 `library`로 바꾼다. `duration`은 이제 초 단위 숫자로 오므로 표시용 포맷 함수를 파일 상단 유틸 근처에 추가한다.

```js
const fmtDuration = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
```

카드에서 `{v.duration}`을 쓰던 자리는 `{fmtDuration(v.duration_sec)}`로 바꾼다.

`HomeScreen` 첫머리에 로딩·에러 처리를 넣는다.

```js
  if (!library) return <View style={styles.screen}><Text style={styles.libSubtitle}>불러오는 중…</Text></View>;
  if (library.length === 0) {
    return (
      <View style={styles.screen}>
        <Text style={styles.libTitle}>영상을 불러오지 못했어요</Text>
        <Text style={styles.libSubtitle}>{libraryError}</Text>
        <TapScale style={styles.libChip} onPress={onRetry}><Text style={styles.libChipText}>다시 시도</Text></TapScale>
      </View>
    );
  }
```

`libraryError`와 `onRetry`(= `loadLibrary`)도 prop으로 넘긴다.

- [ ] **Step 6: `WatchScreen`이 서버 활동·퀴즈를 쓰게 수정**

`WatchScreen`에 `activities`와 `quiz` prop을 넘긴다.

```js
              source={{ uri: `${serverBase(5056)}${videoDetail?.videoPath ?? ''}` }}
              activities={videoDetail?.activities ?? []}
              quiz={(videoDetail?.activities ?? []).find((a) => a.type === 'quiz')?.payload ?? null}
```

`WatchScreen` 시그니처를 `function WatchScreen({ source, activities, quiz, quizDone, ... })`로 바꾸고, 내부에서 전역 `ACTIVITIES`를 돌던 두 곳(744행 근처 `for (const a of ACTIVITIES)`)을 `for (const a of activities)`로 바꾼다. `QuizOverlay`도 `quiz`를 prop으로 받게 고친다. `quiz`가 `null`이면 퀴즈 오버레이를 띄우지 않는다.

`videoDetail`이 아직 없으면 영상 uri가 비어 있으므로, `videoDetail`이 `null`인 동안에는 `WatchScreen`을 렌더하지 말고 로딩 문구를 보여준다.

- [ ] **Step 7: 실기기 확인**

Run: 서버가 떠 있는지 확인하고 `~/Library/Android/sdk/platform-tools/adb -s R54W100HTWA reverse tcp:5056 tcp:5056`
Run: 앱을 리로드해서 라이브러리 → 영상 재생 → 10초 퀴즈까지 확인한다.
Expected: 카드가 서버 영상 1개만 뜨고, 재생되고, 탐색(seek)이 되고, 10초에 퀴즈가 뜬다.

- [ ] **Step 8: 커밋**

```bash
git add App.js
git commit -m "feat: load library, video and activities from the content server"
```

---

## Task 9: 앱이 아이 기록을 서버에 남기게 하기

**Files:**
- Modify: `App.js`

**Interfaces:**
- Consumes: `POST /children`, `POST /sessions`, `PATCH /sessions/:id`, `POST /activity-results`, `GET /children/:id/report`, Task 8의 `serverBase`
- Produces: 없음 (마지막 소비자)

- [ ] **Step 1: `childId`·`sessionId` 상태 추가**

```js
  const [childId, setChildId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [serverReport, setServerReport] = useState(null);
```

- [ ] **Step 2: 보호자 설정을 마칠 때 아이를 등록**

`guardian` 화면에서 다음으로 넘어가는 핸들러에 추가한다.

```js
  const registerChild = async () => {
    try {
      const res = await fetch(`${serverBase(5056)}/children`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: childProfile.name,
          age: childProfile.age,
          daily_limit_min: guardianSettings.dailyLimit,
        }),
      });
      const body = await res.json();
      setChildId(body.id);
    } catch {
      setChildId(null);   // 서버가 없으면 기록만 안 남고 앱은 계속 돈다
    }
  };
```

- [ ] **Step 3: 시청 시작·종료를 기록**

Task 8에서 고친 `onStart` 끝에 추가한다.

```js
                if (childId) {
                  try {
                    const r = await fetch(`${serverBase(5056)}/sessions`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ child_id: childId, video_id: v.id }),
                    });
                    setSessionId((await r.json()).id);
                  } catch { setSessionId(null); }
                }
```

영상이 끝나는 `onFinish` 핸들러에 추가한다.

```js
    if (sessionId) {
      fetch(`${serverBase(5056)}/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ watched_sec: videoDetail?.duration_sec ?? 0 }),
      }).catch(() => {});
    }
```

- [ ] **Step 4: 활동 결과를 기록**

`setLog`를 부르는 자리 네 곳(퀴즈 정답, 그림 완료, 건너뛰기 두 곳) 옆에 헬퍼 호출을 넣는다.

```js
  const recordActivity = (activityId, result, drawingPath) => {
    if (!sessionId || !activityId) return;
    fetch(`${serverBase(5056)}/activity-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, activity_id: activityId, result, drawing_path: drawingPath ?? null }),
    }).catch(() => {});
  };
```

`activityId`는 `videoDetail.activities`에서 해당 타입의 `id`를 찾아 쓴다.

```js
  const activityIdOf = (type) => (videoDetail?.activities ?? []).find((a) => a.type === type)?.id ?? null;
```

- [ ] **Step 5: 리포트를 서버 집계로 바꾸기**

리포트 화면으로 넘어갈 때 불러온다.

```js
  const loadReport = async () => {
    if (!childId) return;
    try {
      const res = await fetch(`${serverBase(5056)}/children/${childId}/report`);
      setServerReport(await res.json());
    } catch { setServerReport(null); }
  };
```

기존 `report` useMemo를 서버 값 우선으로 바꾼다.

```js
  const report = useMemo(
    () => ({
      quiz: serverReport?.quiz_correct ?? log.quiz,
      drawing: serverReport?.drawing ?? log.drawing,
      skip: serverReport?.skip ?? log.skip,
      watched: serverReport?.recent?.[0]?.title || selectedVideo?.title || '',
      interests: ['고래', '용기', '친구', '색깔'],
    }),
    [log, selectedVideo, serverReport]
  );
```

`interests`는 아직 분석 결과가 없어서 그대로 둔다. 실제 알고리즘이 붙을 때 `activity.payload`에서 끌어온다.

- [ ] **Step 6: 실기기 확인**

Run: 온보딩부터 다시 진행해서 영상 하나 보고 퀴즈 풀고 리포트까지 간다.
Run: `curl -s localhost:5056/children/<child_id>/report`
Expected: `videos`가 1 이상, `quiz_correct`가 방금 맞힌 수와 같다. 앱을 껐다 켜고 같은 이름·나이로 온보딩하면 리포트 숫자가 이어진다.

- [ ] **Step 7: 커밋**

```bash
git add App.js
git commit -m "feat: record watch sessions and activity results from the app"
```

---

## Task 10: 번들 정리

**Files:**
- Delete: `1mindemo.mp4`, `1mindemo.srt` (서버 media로 이미 옮겨진 뒤)
- Modify: `docs/진행상황.md`

- [ ] **Step 1: 앱 번들에서 데모 영상이 빠졌는지 확인**

Run: `grep -n "1mindemo" App.js`
Expected: 결과 없음.

- [ ] **Step 2: 원본 파일을 리포에서 제거**

영상과 자막은 `server/media/`와 DB에 들어가 있고 `server/.gitignore`가 그쪽을 제외한다. 원본은 리포 밖 백업 위치로 옮긴다.

```bash
mkdir -p ../stary-source-media
mv 1mindemo.mp4 1mindemo.srt ../stary-source-media/
```

- [ ] **Step 3: `docs/진행상황.md`에 서버 항목 추가**

"실행 메모"의 코드 블록에 아래 줄을 넣는다.

```bash
# 콘텐츠 서버 (5056) — 라이브러리·활동·아이기록
npm run server
# 영상 투입: node server/tools/ingest.js <mp4> <srt> --id <id> --category <cat> --title <제목>
# 활동 생성: node server/tools/generate.js <id>
# 태블릿 USB 연결 시: adb reverse tcp:5056 tcp:5056
```

- [ ] **Step 4: 전체 테스트와 실기기 최종 확인**

Run: `npm run server:test`
Expected: `10/10 passed`

Run: 앱을 리로드해 온보딩 → 라이브러리 → 시청 → 활동 → 리포트를 한 번 통과한다.
Expected: 어느 화면에서도 목데이터가 보이지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "chore: drop bundled demo video and document the content server"
```

---

## 다음 회차

- `generate.js`의 고정 스케줄을 실제 자막 분석으로 교체
- `report.interests`를 활동 payload에서 뽑기
- 콘텐츠 10편 투입 (캐릭터 5 × 2편)
