// Put one video and its subtitles into the library.
//   node server/tools/ingest.js <video.mp4> <subs.srt|-> --id <id> --category <cat> --title <title>
// Pass "-" for the subtitle file when there are no subtitles yet.
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
for (let i = 0; i < rest.length; i += 2) {
  const flagRaw = rest[i];
  const val = rest[i + 1];
  if (!flagRaw.startsWith('--')) {
    console.error(`error: expected flag but got "${flagRaw}"`);
    process.exit(1);
  }
  if (val === undefined) {
    console.error(`error: flag ${flagRaw} is missing a value`);
    process.exit(1);
  }
  if (val.startsWith('--')) {
    console.error(`error: flag ${flagRaw} has no value (got another flag "${val}" instead)`);
    process.exit(1);
  }
  opt[flagRaw.replace(/^--/, '')] = val;
}

if (!videoArg || !srtArg || !opt.id || !opt.category || !opt.title) {
  console.error('usage: ingest.js <video.mp4> <subs.srt> --id <id> --category <cat> --title <title>');
  process.exit(1);
}

// ffprobe gives the real duration. Without ffmpeg installed, pass --duration <seconds>.
function probeDuration(file) {
  let dur;
  if (opt.duration) {
    dur = Number(opt.duration);
  } else {
    try {
      const out = execFileSync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', file,
      ]).toString().trim();
      dur = Number(out);
    } catch (err) {
      console.error('ffprobe failed. pass --duration <seconds>');
      process.exit(1);
    }
  }
  if (!Number.isFinite(dur) || dur <= 0) {
    console.error(`error: duration must be a positive number, got: ${dur}`);
    process.exit(1);
  }
  return Math.round(dur);
}

function makeThumb(file, outPath) {
  if (opt.thumb) {
    fs.copyFileSync(opt.thumb, outPath);
    return true;
  }
  try {
    execFileSync('ffmpeg', ['-y', '-ss', '3', '-i', file, '-frames:v', '1', '-vf', 'scale=480:-1', outPath]);
    // Verify that the thumbnail was actually created and is non-empty
    const stat = fs.statSync(outPath);
    if (stat.size > 0) {
      return true;
    } else {
      console.warn('no thumbnail: ffmpeg produced an empty file');
      fs.unlinkSync(outPath);
      return false;
    }
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

const cues = srtArg === '-' ? [] : parseSrt(fs.readFileSync(srtArg, 'utf8'));
if (cues.length) replaceSubtitles(db, opt.id, cues);

console.log(`ingested ${opt.id}: ${cues.length} cues, status=draft`);
