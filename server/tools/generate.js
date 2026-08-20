// Build the activity schedule for one video.
//   node server/tools/generate.js <video_id>
// The real analysis lands here later. For now it plants the schedule the app already ships with,
// so the DB → API → app path can be exercised end to end.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, getSubtitles, replaceActivities, setVideoStatus } from '../db.js';
import { toActivityRow } from '../activity-payload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = path.join(__dirname, '..');

const videoId = process.argv[2];
if (!videoId) {
  console.error('usage: generate.js <video_id>');
  process.exit(1);
}

const db = openDb(path.join(SERVER_DIR, 'data', 'stary.db'));
const video = db.prepare('SELECT id, duration_sec, file_path, crop_bottom FROM video WHERE id = ?').get(videoId);
if (!video) {
  console.error(`no video ${videoId}`);
  process.exit(1);
}

setVideoStatus(db, videoId, 'analyzing');
const cues = getSubtitles(db, videoId);
console.log(`${cues.length} cues, ${video.duration_sec}s, crop_bottom=${video.crop_bottom}`);
// 진짜 생성기가 들어오면 video.crop_bottom 을 oneshot.prep 의 --crop-bottom 으로 넘긴다.

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
