import json
from pathlib import Path
from unittest.mock import patch

from run_pipeline import discover_video_subtitle_pairs, run_for_video, main, merge_visual_signals


def test_merge_visual_signals_dedupes_close_values():
    result = merge_visual_signals(scene_cuts=[10.0, 30.0], clip_boundaries=[10.2, 50.0])
    assert result == [10.0, 30.0, 50.0]


def test_merge_visual_signals_keeps_distinct_values_sorted():
    result = merge_visual_signals(scene_cuts=[30.0, 10.0], clip_boundaries=[20.0])
    assert result == [10.0, 20.0, 30.0]


SRT_CONTENT = """1
00:00:20,000 --> 00:00:22,000
펭귄이 걸어가요.

2
00:00:24,000 --> 00:00:26,000
이제 물속으로 들어가요.
"""


def test_discover_video_subtitle_pairs_matches_by_basename(tmp_path):
    (tmp_path / "penguin.mp4").write_bytes(b"fake-video")
    (tmp_path / "penguin.srt").write_text(SRT_CONTENT, encoding="utf-8")
    (tmp_path / "orphan.srt").write_text(SRT_CONTENT, encoding="utf-8")

    pairs = discover_video_subtitle_pairs(str(tmp_path))

    assert len(pairs) == 1
    video_path, subtitle_path, video_id = pairs[0]
    assert video_id == "penguin"
    assert video_path.endswith("penguin.mp4")
    assert subtitle_path.endswith("penguin.srt")


class FakeBackend:
    """activity_generator의 비전 호출에 대해 활동 JSON을 돌려준다."""

    def generate(self, prompt, image_paths):
        if not image_paths:
            return json.dumps(
                {"breakpoints": [{"timestamp_sec": 22.0, "reason": "펭귄 소개가 끝나는 지점"}]},
                ensure_ascii=False,
            )
        return json.dumps(
            {
                "scene_description": "하얀 펭귄이 화면 중앙에 서 있다.",
                "is_suitable": True,
                "score": 0.9,
                "activity_template": "색_찾기",
                "question": "무엇을 봤나요?",
                "answer": "하양",
            },
            ensure_ascii=False,
        )


def test_run_for_video_produces_valid_activities_dict(tmp_path):
    video_path = tmp_path / "penguin.mp4"
    video_path.write_bytes(b"fake-video")
    subtitle_path = tmp_path / "penguin.srt"
    subtitle_path.write_text(SRT_CONTENT, encoding="utf-8")

    with patch("run_pipeline.extract_frames", return_value=["frame1.jpg"]):
        result = run_for_video(
            video_path=str(video_path),
            subtitle_path=str(subtitle_path),
            video_id="penguin",
            video_meta={"topic": "동물", "age_range": "3-4"},
            output_dir=str(tmp_path / "out"),
            backend=FakeBackend(),
            video_duration_sec=100.0,
            target_count=5,
            clip_embedder=None,
            min_silence_sec=1.0,
            min_spacing_sec=20.0,
        )

    assert result["video_id"] == "penguin"
    assert result["source"]["subtitle_file"].endswith("penguin.srt")
    assert len(result["activities"]) == 1
    assert result["activities"][0]["timestamp_sec"] == 22.0
    assert (tmp_path / "out" / "penguin_activities.json").exists()


def test_run_for_video_skips_gracefully_on_bad_subtitle(tmp_path):
    video_path = tmp_path / "broken.mp4"
    video_path.write_bytes(b"fake-video")
    subtitle_path = tmp_path / "broken.srt"
    subtitle_path.write_text("이건 SRT 형식이 아닙니다", encoding="utf-8")

    result = run_for_video(
        video_path=str(video_path),
        subtitle_path=str(subtitle_path),
        video_id="broken",
        video_meta={},
        output_dir=str(tmp_path / "out"),
        backend=FakeBackend(),
        video_duration_sec=100.0,
        target_count=5,
        clip_embedder=None,
        min_silence_sec=1.0,
        min_spacing_sec=20.0,
    )

    assert result["activities"] == []


def test_main_processes_batch_and_writes_failures_report(tmp_path):
    input_dir = tmp_path / "in"
    input_dir.mkdir()
    (input_dir / "penguin.mp4").write_bytes(b"fake-video")
    (input_dir / "penguin.srt").write_text(SRT_CONTENT, encoding="utf-8")

    output_dir = tmp_path / "out"

    with patch("run_pipeline.extract_frames", return_value=["frame1.jpg"]), patch(
        "run_pipeline.MlxVlmBackend"
    ) as mock_backend_cls:
        mock_backend_cls.return_value = FakeBackend()
        exit_code = main(
            [
                "--input-dir",
                str(input_dir),
                "--output-dir",
                str(output_dir),
                "--video-duration-sec",
                "100.0",
                "--age-range",
                "3-4",
            ]
        )

    assert exit_code == 0
    assert (output_dir / "penguin_activities.json").exists()
    assert (output_dir / "failures.json").exists()
    failures = json.loads((output_dir / "failures.json").read_text(encoding="utf-8"))
    assert failures == []


def test_cli_exposes_silence_and_spacing_knobs(tmp_path):
    import run_pipeline

    # 빈 입력 디렉토리이므로 모델은 로드되지 않는다(백엔드는 지연 로딩).
    # 출력은 tmp_path로 보내 저장소에 파일을 남기지 않는다.
    argv = [
        "--input-dir", str(tmp_path / "in"),
        "--output-dir", str(tmp_path / "out"),
        "--age-range", "5-6",
        "--video-duration-sec", "100",
        "--min-silence-sec", "2.0",
        "--min-spacing-sec", "30.0",
    ]
    assert run_pipeline.main(argv) == 0


def test_narrative_segmenter_module_is_gone():
    import importlib

    try:
        importlib.import_module("narrative_segmenter")
    except ModuleNotFoundError:
        return
    raise AssertionError("narrative_segmenter는 삭제되어야 한다")
