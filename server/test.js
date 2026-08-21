import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseSrt } from './srt.js';
import { parseRange } from './media.js';
import { toActivityRow, swatchFor, COLOR_SWATCHES, PALETTE } from './activity-payload.js';
import { openDb, upsertChild, startSession, endSession, addActivityResult, getReport,
         upsertCategory, insertVideo, replaceActivities } from './db.js';

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

test('swatchFor cycles the palette for non-colour activities', () => {
  const got = ['a', 'b', 'c', 'd', 'e'].map((l, i) => swatchFor('감정_추론', l, i));
  assert.deepEqual(got.slice(0, 4), PALETTE);
  assert.deepEqual(got[4], PALETTE[0], '팔레트를 한 바퀴 돌면 처음으로 돌아온다');
});

test('swatchFor matches the label for 색_찾기', () => {
  // 색을 묻는 문제에서 "파란색" 선택지가 팔레트 순서대로 노란색으로 칠해지면 문제가 깨진다.
  assert.deepEqual(swatchFor('색_찾기', '파란색', 0), COLOR_SWATCHES['파란색']);
  assert.deepEqual(swatchFor('색_찾기', '빨간색', 1), COLOR_SWATCHES['빨간색']);
  assert.notDeepEqual(swatchFor('색_찾기', '파란색', 0), PALETTE[0]);
});

test('swatchFor throws on a colour name it does not know', () => {
  // 틀린 색으로 칠한 문제를 아이에게 내보내느니 활동 하나를 잃는 편이 낫다.
  assert.throws(() => swatchFor('색_찾기', '형광색', 0), /형광색/);
});

test('toActivityRow maps a oneshot activity onto the app payload', () => {
  const row = toActivityRow({
    timestamp_sec: 55.4,
    activity_template: '감정_추론',
    question: '핑이는 어떤 마음일까요?',
    options: ['기뻐요', '슬퍼요', '무서워요'],
    answer: '기뻐요',
    scene_description: '핑이가 웃는다',
    why_here: '대사가 끝난 직후',
  });
  assert.equal(row.at_sec, 55, 'timestamp_sec 은 정수로 반올림한다');
  assert.equal(row.type, 'quiz');
  assert.equal(row.payload.title, '핑이는 어떤 마음일까요?', 'question 은 title 이 된다');
  assert.equal(row.payload.activity_template, '감정_추론', '유형은 리포트와 가중치가 쓰므로 보존한다');
  assert.equal(row.payload.options.length, 3);
  assert.equal(row.payload.options[0].label, '기뻐요');
  assert.ok(row.payload.options[0].color, '선택지마다 색이 붙는다');
  assert.equal(row.payload.answer, '기뻐요');
  assert.ok(row.payload.options.some((o) => o.label === row.payload.answer), '정답은 선택지 안에 있다');
});

test('toActivityRow paints 색_찾기 options by their own name', () => {
  const row = toActivityRow({
    timestamp_sec: 12,
    activity_template: '색_찾기',
    question: '화면에 없는 색은 무엇일까요?',
    options: ['빨간색', '파란색', '초록색'],
    answer: '초록색',
  });
  assert.deepEqual(
    row.payload.options.map((o) => o.color),
    ['빨간색', '파란색', '초록색'].map((n) => COLOR_SWATCHES[n].color)
  );
});

test('insertVideo stores crop_bottom and defaults to 0', () => {
  const db = openDb(':memory:');
  upsertCategory(db, { id: 'c', label: 'C', sort: 0 });
  insertVideo(db, { id: 'v1', category_id: 'c', title: 'T', duration_sec: 10, file_path: 'video/v1.mp4' });
  insertVideo(db, { id: 'v2', category_id: 'c', title: 'T', duration_sec: 10, file_path: 'video/v2.mp4', crop_bottom: 0.22 });
  // node:sqlite 는 null-prototype 객체를 돌려주므로 deepEqual 로 리터럴과 비교하면 실패한다.
  const rows = db.prepare('SELECT id, crop_bottom FROM video ORDER BY id').all()
    .map((r) => ({ id: r.id, crop_bottom: r.crop_bottom }));
  assert.deepEqual(rows, [{ id: 'v1', crop_bottom: 0 }, { id: 'v2', crop_bottom: 0.22 }]);
});

test('insertVideo updates crop_bottom on conflict', () => {
  const db = openDb(':memory:');
  upsertCategory(db, { id: 'c', label: 'C', sort: 0 });
  insertVideo(db, { id: 'v', category_id: 'c', title: 'T', duration_sec: 10, file_path: 'video/v.mp4', crop_bottom: 0.22 });
  insertVideo(db, { id: 'v', category_id: 'c', title: 'T', duration_sec: 10, file_path: 'video/v.mp4', crop_bottom: 0.3 });
  assert.equal(db.prepare('SELECT crop_bottom FROM video WHERE id = ?').get('v').crop_bottom, 0.3);
});

test('openDb adds crop_bottom to a database made before the column existed', () => {
  // CREATE TABLE IF NOT EXISTS 는 기존 테이블을 그냥 두므로, 마이그레이션이 없으면
  // 이미 쓰던 stary.db 에는 컬럼이 영영 안 생긴다.
  const file = path.join(os.tmpdir(), `stary-migrate-${Date.now()}.db`);
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE video (
    id TEXT PRIMARY KEY, category_id TEXT NOT NULL, title TEXT NOT NULL,
    duration_sec INTEGER NOT NULL, file_path TEXT NOT NULL, thumb_path TEXT,
    emoji TEXT, color TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL)`);
  old.prepare(`INSERT INTO video VALUES ('old', 'c', 'T', 10, 'video/old.mp4', null, null, null, 'ready', 0)`).run();
  old.close();

  const db = openDb(file);
  const cols = db.prepare('PRAGMA table_info(video)').all().map((c) => c.name);
  assert.ok(cols.includes('crop_bottom'));
  assert.equal(db.prepare('SELECT crop_bottom FROM video WHERE id = ?').get('old').crop_bottom, 0);
  db.close();
  fs.unlinkSync(file);
});

let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`ok   ${name}`); }
  catch (err) { failed++; console.log(`FAIL ${name}\n     ${err.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
