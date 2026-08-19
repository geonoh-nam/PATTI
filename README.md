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
② scene_detector          ffmpeg scene-cut으로 실제 장면전환 시각 추출 (참고 정보, 로그에만 남음)
        │
        ▼
③ event_boundary_detector CLIP 프레임 임베딩 거리로 사건 경계 후보 추출 (참고 정보, 로그에만 남음)
        │
        ▼
④ safe_point_detector     침묵 길이·문장 완결·간격만으로 안전 지점 판정 — 모델 호출 없음
        │
        ▼
⑤ frame_sampler           안전 지점마다 프레임 1장 추출
        │
        ▼
⑥ activity_generator      로컬 비전 LLM 호출 — 활동(관찰/선택/움직임/언어/마무리) 생성
        │
        ▼
⑦ post_filter             점수·간격·목표 개수(target-count)로 최종 선정
        │
        ▼
[<video_id>_activities.json]
```

②③은 아직 안전 지점 판정에 직접 반영되지 않고 로그로만 남는 참고 신호입니다. 실제 지점 선정은 ④가 자막 타이밍만으로 수행합니다.
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
     --age-range 5-6 \
     --video-duration-sec 123.4 \
     --target-count 5 \
     --min-silence-sec 1.0 \
     --min-spacing-sec 20.0
   ```

   `--input-dir` 폴더에 있는 모든 `.mp4`+`.srt`/`.vtt` 쌍을 순회하며 처리합니다. 영상 하나가 실패해도
   나머지는 계속 처리되고, 실패 목록은 `out/failures.json`에 남습니다.

   `--age-range`는 `3-4`/`5-6`/`7` 중 하나만 허용됩니다. `--min-silence-sec`(안전 지점으로 인정할
   최소 침묵 길이)와 `--min-spacing-sec`(활동 사이 최소 간격)는 값을 낮출수록 활동 후보가 늘어납니다.

### 출력

`out/<video_id>_activities.json`:

```json
{
  "video_id": "myvideo",
  "source": { "subtitle_file": "...", "video_file": "..." },
  "activities": [
    {
      "timestamp_sec": 21.7,
      "activity_template": "그림_단어_고르기",
      "question": "...",
      "options": null,
      "answer": null,
      "source_subtitle_range": [12.0, 21.7],
      "score": 0.8,
      "candidate_reason": "이 지점을 후보로 고른 이유 (safe_point_detector)",
      "candidate_subtitle_text": "해당 지점 주변 자막 원문",
      "activity_reason": "이 활동을 적합/생성한 이유 (activity_generator)",
      "scene_description": "이 시점 화면에 대한 설명 (activity_generator)"
    }
  ]
}
```

### 테스트

```bash
python3 -m pytest -v
```

단위 테스트가 있으며, ffmpeg·비전 모델 호출은 전부 모킹되어 있어 별도 설치 없이 실행됩니다.

### 프로젝트 구조

```
schemas.py               데이터클래스 정의
subtitle_parser.py       SRT/VTT 파싱
scene_detector.py        ffmpeg scene-cut 감지
event_boundary_detector.py CLIP 임베딩 기반 사건 경계 후보 탐지
safe_point_detector.py   안전 지점 탐지 (침묵·문장 완결·간격, 모델 호출 없음)
frame_sampler.py         ffmpeg 프레임 추출
activity_generator.py    활동 생성 (비전 LLM)
post_filter.py           점수·간격·개수 기반 최종 선정
run_pipeline.py          CLI 오케스트레이터
tests/                    단위 테스트
```
