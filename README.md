# PATTI
SKT FLY AI 열정4팀 최종 프로젝트

## 영상·자막 기반 상호작용 콘텐츠 파이프라인

영상 파일과 자막(SRT/VTT)이 주어지면, 상호작용(퀴즈·퍼즐 등) 활동을 넣을 지점을 자동으로 판단하고
각 지점의 활동 내용을 생성하는 배치 파이프라인입니다.

### 동작 흐름

```
[영상(.mp4) + 자막(.srt/.vtt)]
        │
        ▼
① subtitle_parser        자막을 줄 단위로 파싱
        │
        ▼
② scene_detector          ffmpeg scene-cut으로 실제 장면전환 시각 추출 (참고 정보)
        │
        ▼
③ narrative_segmenter     LLM(텍스트 전용) 호출 1회 — "서사가 마디를 짓는 지점"을 넓게 탐지
        │
        ▼
④ frame_sampler           후보 지점마다 −1s/0s/+1s 프레임 3장 추출
        │
        ▼
⑤ activity_generator      로컬 비전 LLM 호출 — 프레임 연속성 판단 + 활동(관찰/선택/움직임/언어/마무리) 생성
        │
        ▼
⑥ post_filter             점수·간격·목표 개수(target-count)로 최종 선정
        │
        ▼
[<video_id>_activities.json]
```

각 단계의 판단 근거(왜 이 지점을 골랐는지, 왜 제외됐는지)는 실행 로그와 출력 JSON에 함께 남습니다.

### 요구 사항

- Python 3.11+
- [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`)
- [mlx-vlm](https://github.com/Blaizzy/mlx-vlm) (`pip install mlx-vlm`) — Apple Silicon Mac 전제. 최초 실행 시
  `mlx-community/Qwen2.5-VL-7B-Instruct-4bit` 모델을 자동 다운로드합니다.

### 사용법

1. 영상과 자막을 같은 이름(basename)으로 한 폴더에 둡니다.

   ```
   samples/
     myvideo.mp4
     myvideo.srt
   ```

2. 영상 길이(초)를 구합니다.

   ```bash
   ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 samples/myvideo.mp4
   ```

3. 파이프라인을 실행합니다.

   ```bash
   python3 run_pipeline.py \
     --input-dir samples \
     --output-dir out \
     --topic "동물" \
     --age-range 4-6 \
     --video-duration-sec 123.4 \
     --target-count 5
   ```

   `--input-dir` 폴더에 있는 모든 `.mp4`+`.srt`/`.vtt` 쌍을 순회하며 처리합니다. 영상 하나가 실패해도
   나머지는 계속 처리되고, 실패 목록은 `out/failures.json`에 남습니다.

### 출력

`out/<video_id>_activities.json`:

```json
{
  "video_id": "myvideo",
  "source": { "subtitle_file": "...", "video_file": "..." },
  "activities": [
    {
      "timestamp_sec": 21.7,
      "type": "관찰",
      "question": "...",
      "options": null,
      "answer": null,
      "difficulty": "easy",
      "source_subtitle_range": [12.0, 21.7],
      "score": 0.8,
      "candidate_reason": "이 지점을 후보로 고른 이유 (narrative_segmenter)",
      "candidate_subtitle_text": "해당 지점 주변 자막 원문",
      "activity_reason": "이 활동을 적합/생성한 이유 (activity_generator)"
    }
  ]
}
```

### 테스트

```bash
python3 -m pytest -v
```

45개 단위 테스트가 있으며, ffmpeg·비전 모델 호출은 전부 모킹되어 있어 별도 설치 없이 실행됩니다.

### 프로젝트 구조

```
schemas.py             데이터클래스 정의
subtitle_parser.py     SRT/VTT 파싱
scene_detector.py      ffmpeg scene-cut 감지
narrative_segmenter.py 후보 지점 탐지 (LLM, 텍스트 전용)
frame_sampler.py       ffmpeg 프레임 추출
activity_generator.py  활동 생성 (비전 LLM)
post_filter.py         점수·간격·개수 기반 최종 선정
run_pipeline.py         CLI 오케스트레이터
tests/                  단위 테스트
```
