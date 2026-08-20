#!/usr/bin/env node
// Veo 3.1 one-off video generator. No deps (node 18+ fetch).
//   node tools/veo-gen.js --prompt "..." --image char.png --tier lite --out assets/intro-blue.mp4
// Tiers are a cost dial: lite ~1/8 of standard. Explore on lite, final shot on standard.
const fs = require('fs');
const path = require('path');

const TIERS = {
  lite:     { model: 'veo-3.1-lite-generate-preview', price: { '720p': 0.05, '1080p': 0.08 } },
  fast:     { model: 'veo-3.1-fast-generate-preview', price: { '720p': 0.10, '1080p': 0.12, '4k': 0.30 } },
  standard: { model: 'veo-3.1-generate-preview',      price: { '720p': 0.40, '1080p': 0.40, '4k': 0.60 } },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

// The key already lives in the character server's .env; don't make the user re-export it.
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = path.join(__dirname, '..', '..', 'character-gen-test', '.env');
  if (fs.existsSync(envFile)) {
    const hit = fs.readFileSync(envFile, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    // values in .env are often quoted; an unstripped quote reads as part of the key
    if (hit) return hit[1].trim().replace(/^["']|["']$/g, '');
  }
  throw new Error('GEMINI_API_KEY가 없습니다. export 하거나 character-gen-test/.env에 넣어주세요.');
}

function buildRequest(args) {
  const tierName = String(args.tier || 'lite');
  const tier = TIERS[tierName];
  if (!tier) throw new Error(`--tier는 ${Object.keys(TIERS).join('|')} 중 하나여야 합니다: ${tierName}`);

  const resolution = String(args.res || '720p');
  if (!tier.price[resolution]) {
    throw new Error(`${tierName} 티어는 ${resolution}를 지원하지 않습니다 (가능: ${Object.keys(tier.price).join(', ')})`);
  }

  const duration = String(args.dur || '8');
  if (!['4', '6', '8'].includes(duration)) throw new Error(`--dur는 4|6|8만 가능합니다: ${duration}`);
  // API rule: anything above 720p only comes back at 8s.
  if (resolution !== '720p' && duration !== '8') {
    throw new Error(`${resolution}는 8초만 지원합니다. --dur 8 로 하거나 --res 720p 로 내리세요.`);
  }

  const prompt = args.prompt;
  if (!prompt || prompt === true) throw new Error('--prompt 가 필요합니다.');

  const instance = { prompt };
  if (args.image) {
    const file = String(args.image);
    if (!fs.existsSync(file)) throw new Error(`시작 이미지가 없습니다: ${file}`);
    const ext = path.extname(file).toLowerCase();
    instance.image = {
      inlineData: {
        mimeType: ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png',
        data: fs.readFileSync(file).toString('base64'),
      },
    };
  }

  const parameters = {
    aspectRatio: String(args.aspect || '16:9'),
    resolution,
    durationSeconds: Number(duration),
  };
  if (instance.image) parameters.personGeneration = 'allow_adult';

  return {
    model: tier.model,
    cost: tier.price[resolution] * Number(duration),
    body: { instances: [instance], parameters },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const req = buildRequest(args);
  const out = String(args.out || 'veo-out.mp4');

  console.log(`model     ${req.model}`);
  console.log(`params    ${JSON.stringify(req.body.parameters)}`);
  console.log(`image     ${args.image ? args.image : '(없음, text-to-video)'}`);
  console.log(`out       ${out}`);
  console.log(`예상 비용  $${req.cost.toFixed(2)}`);
  if (args['dry-run']) return console.log('\n[dry-run] 호출하지 않고 종료합니다.');

  const key = apiKey();
  const headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' };
  const base = 'https://generativelanguage.googleapis.com/v1beta';

  const start = await fetch(`${base}/models/${req.model}:predictLongRunning`, {
    method: 'POST', headers, body: JSON.stringify(req.body),
  });
  const started = await start.json();
  if (!start.ok) throw new Error(`시작 실패 ${start.status}: ${JSON.stringify(started).slice(0, 400)}`);
  console.log(`\n생성 시작: ${started.name}`);

  let op = started;
  while (!op.done) {
    await new Promise((r) => setTimeout(r, 10000));
    const poll = await fetch(`${base}/${started.name}`, { headers });
    op = await poll.json();
    if (!poll.ok) throw new Error(`폴링 실패 ${poll.status}: ${JSON.stringify(op).slice(0, 400)}`);
    process.stdout.write('.');
  }
  console.log('');
  if (op.error) throw new Error(`생성 실패: ${JSON.stringify(op.error).slice(0, 400)}`);

  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error(`응답에 영상 URI가 없습니다: ${JSON.stringify(op).slice(0, 400)}`);

  const file = await fetch(uri, { headers: { 'x-goog-api-key': key } });
  if (!file.ok) throw new Error(`다운로드 실패 ${file.status}`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await file.arrayBuffer()));
  console.log(`저장 완료: ${out} ($${req.cost.toFixed(2)} 과금)`);
}

main().catch((err) => { console.error(`\n에러: ${err.message}`); process.exit(1); });
