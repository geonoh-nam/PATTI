import argparse
import json
from pathlib import Path

from activity_generator import MlxVlmBackend, generate_activity
from event_boundary_detector import ClipEmbedder, detect_prediction_error_boundaries
from narrative_segmenter import find_narrative_beats
from frame_sampler import extract_frames
from post_filter import filter_and_cap
from scene_detector import detect_scene_cuts
from subtitle_parser import parse_subtitle_file

SUBTITLE_EXTENSIONS = (".srt", ".vtt")
STAGE1_MIN_SPACING_SEC = 5.0
CLIP_INTERVAL_SEC = 1.0
CLIP_TOP_K = 20
MERGE_TOLERANCE_SEC = 0.5


def merge_visual_signals(scene_cuts: list[float], clip_boundaries: list[float]) -> list[float]:
    """ffmpeg scene-cut과 CLIP 예측오차 후보를 합치고, 서로 MERGE_TOLERANCE_SEC 이내로
    가까운 값은 중복으로 보고 하나만 남긴다."""
    merged = sorted(scene_cuts + clip_boundaries)
    deduped: list[float] = []
    for ts in merged:
        if deduped and ts - deduped[-1] <= MERGE_TOLERANCE_SEC:
            continue
        deduped.append(ts)
    return deduped


def discover_video_subtitle_pairs(input_dir: str) -> list[tuple[str, str, str]]:
    directory = Path(input_dir)
    pairs = []
    for video_path in sorted(directory.glob("*.mp4")):
        video_id = video_path.stem
        for ext in SUBTITLE_EXTENSIONS:
            subtitle_path = directory / f"{video_id}{ext}"
            if subtitle_path.exists():
                pairs.append((str(video_path), str(subtitle_path), video_id))
                break
    return pairs


def run_for_video(
    video_path: str,
    subtitle_path: str,
    video_id: str,
    video_meta: dict,
    output_dir: str,
    backend,
    video_duration_sec: float,
    target_count: int,
    clip_embedder,
) -> dict:
    result = {
        "video_id": video_id,
        "source": {"subtitle_file": subtitle_path, "video_file": video_path},
        "activities": [],
    }

    print(f"[{video_id}] 자막 파싱 중: {subtitle_path}")
    try:
        segments = parse_subtitle_file(subtitle_path)
    except OSError:
        segments = []
    print(f"[{video_id}] 자막 줄 {len(segments)}개 파싱됨")

    if segments:
        print(f"[{video_id}] 장면 전환 감지 중 (ffmpeg scene-cut)...")
        scene_cuts = detect_scene_cuts(video_path)
        print(f"[{video_id}] 장면 전환 {len(scene_cuts)}개 감지: {[round(t, 1) for t in scene_cuts]}")

        print(f"[{video_id}] 사건 경계 후보 감지 중 (CLIP 프레임 임베딩 거리, EST 예측오차 근사)...")
        clip_frames_dir = str(Path(output_dir) / f"{video_id}_clip_frames")
        clip_boundaries = detect_prediction_error_boundaries(
            video_path,
            video_duration_sec=video_duration_sec,
            embedder=clip_embedder,
            output_dir=clip_frames_dir,
            interval_sec=CLIP_INTERVAL_SEC,
            top_k=CLIP_TOP_K,
        )
        print(f"[{video_id}] CLIP 후보 {len(clip_boundaries)}개: {[round(t, 1) for t in clip_boundaries]}")

        visual_cuts = merge_visual_signals(scene_cuts, clip_boundaries)
        print(f"[{video_id}] 합산된 시각 신호 {len(visual_cuts)}개: {[round(t, 1) for t in visual_cuts]}")

        print(f"[{video_id}] 내러티브 마디 탐지 중 (LLM 호출 1회, 1차 후보는 최대한 넓게)...")
        candidates = find_narrative_beats(
            segments,
            video_duration_sec=video_duration_sec,
            video_meta=video_meta,
            backend=backend,
            scene_cuts=visual_cuts,
            min_spacing_sec=STAGE1_MIN_SPACING_SEC,
        )
        print(f"[{video_id}] 후보 지점 {len(candidates)}개")
        for c in candidates:
            context_text = " ".join(seg.text for seg in c.context_segments)
            print(f"[{video_id}]   {c.timestamp_sec}s: 대사=\"{context_text}\"")
            print(f"[{video_id}]   {c.timestamp_sec}s: 이유={c.reason}")

        generated = []
        reason_by_ts = {c.timestamp_sec: c.reason for c in candidates}
        context_text_by_ts = {
            c.timestamp_sec: " ".join(seg.text for seg in c.context_segments) for c in candidates
        }
        frames_dir = str(Path(output_dir) / f"{video_id}_frames")
        for candidate in candidates:
            ts = candidate.timestamp_sec
            print(f"[{video_id}]   {ts}s: 프레임 추출 중...")
            # 이미지 여러 장(전/후 비교용)을 한 번에 넣으면 모델이 화면 대신 자막 내용으로
            # 그럴듯한 장면을 상상해버리는 현상이 재현 확인됨(단일 이미지에서는 정확했음).
            # 연속성 판단 기준도 이미 제거된 상태라 여러 장을 쓸 이유가 없어 1장만 사용한다.
            frame_paths = extract_frames(video_path, ts, frames_dir, offsets=(0.0,))
            print(f"[{video_id}]   {ts}s: 프레임 {len(frame_paths)}장, 활동 생성 중...")
            activity = generate_activity(candidate, frame_paths, video_meta, backend)
            if activity is None:
                print(f"[{video_id}]   {ts}s: 스킵 (응답 검증 실패)")
            elif not activity.is_suitable:
                print(f"[{video_id}]   {ts}s: 화면 설명 — {activity.scene_description}")
                print(f"[{video_id}]   {ts}s: 부적합 판정 (score={activity.score}) — 이유: {activity.reason}")
                generated.append(activity)
            else:
                print(f"[{video_id}]   {ts}s: 화면 설명 — {activity.scene_description}")
                print(
                    f"[{video_id}]   {ts}s: 채택 (template={activity.activity_template}, score={activity.score}, "
                    f"question={activity.question!r}) — 이유: {activity.reason}"
                )
                generated.append(activity)

        final_activities, dropped_activities = filter_and_cap(generated, max_per_video=target_count)
        print(f"[{video_id}] 후처리 후 최종 활동 {len(final_activities)}개 (목표 {target_count}개)")
        for dropped_activity, drop_reason in dropped_activities:
            print(f"[{video_id}]   {dropped_activity.timestamp_sec}s: 최종 제외 — {drop_reason}")
        result["activities"] = [
            {
                "timestamp_sec": a.timestamp_sec,
                "activity_template": a.activity_template,
                "question": a.question,
                "options": a.options,
                "answer": a.answer,
                "source_subtitle_range": list(a.source_subtitle_range),
                "score": a.score,
                "candidate_reason": reason_by_ts.get(a.timestamp_sec),
                "candidate_subtitle_text": context_text_by_ts.get(a.timestamp_sec),
                "activity_reason": a.reason,
                "scene_description": a.scene_description,
            }
            for a in final_activities
        ]

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{video_id}_activities.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="영상·자막 기반 상호작용 콘텐츠 생성 파이프라인")
    parser.add_argument("--input-dir", required=True, help="video(.mp4)+subtitle(.srt/.vtt) 쌍이 있는 디렉토리")
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--topic", default="미지정")
    parser.add_argument(
        "--age-range",
        required=True,
        choices=["3-4", "5-6", "7"],
        help="아동 연령대 티어. 영상 하나당 하나의 티어로 고정되며, 해당 티어의 활동 템플릿만 사용된다.",
    )
    parser.add_argument(
        "--video-duration-sec",
        type=float,
        required=True,
        help="영상 길이(초). ffprobe 등으로 미리 구해서 전달한다.",
    )
    parser.add_argument(
        "--target-count",
        type=int,
        default=5,
        help="영상당 최종 생성할 활동 개수. 1차 후보는 이보다 훨씬 넓게 뽑고, 비전 판정을 통과한 것 중 점수 상위 N개만 최종 선정한다.",
    )
    args = parser.parse_args(argv)

    pairs = discover_video_subtitle_pairs(args.input_dir)
    print(f"영상 {len(pairs)}개 발견: {[video_id for _, _, video_id in pairs]}")
    backend = MlxVlmBackend()
    clip_embedder = ClipEmbedder()
    video_meta = {"topic": args.topic, "age_range": args.age_range}

    failures = []
    for video_path, subtitle_path, video_id in pairs:
        print(f"=== [{video_id}] 처리 시작 ===")
        try:
            run_for_video(
                video_path=video_path,
                subtitle_path=subtitle_path,
                video_id=video_id,
                video_meta=video_meta,
                output_dir=args.output_dir,
                backend=backend,
                video_duration_sec=args.video_duration_sec,
                target_count=args.target_count,
                clip_embedder=clip_embedder,
            )
        except Exception as exc:  # noqa: BLE001 - 배치 전체가 멈추지 않도록 광범위하게 잡는다
            print(f"[{video_id}] 실패: {exc}")
            failures.append({"video_id": video_id, "error": str(exc)})

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "failures.json").write_text(
        json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"완료: 성공 {len(pairs) - len(failures)}개, 실패 {len(failures)}개")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
