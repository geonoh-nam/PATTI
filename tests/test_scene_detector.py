from unittest.mock import patch, MagicMock

from scene_detector import parse_scene_cut_output, detect_scene_cuts


SAMPLE_FFMPEG_STDERR = """
[Parsed_showinfo_1 @ 0x600000000] n:0 pts:12345 pts_time:12.345 pos:1234 fmt:yuv420p sar:1/1
[Parsed_showinfo_1 @ 0x600000000] n:1 pts:44500 pts_time:44.5 pos:5678 fmt:yuv420p sar:1/1
some unrelated line without pts_time
[Parsed_showinfo_1 @ 0x600000000] n:2 pts:70123 pts_time:70.123 pos:9999 fmt:yuv420p sar:1/1
"""


def test_parse_scene_cut_output_extracts_pts_time_values():
    cuts = parse_scene_cut_output(SAMPLE_FFMPEG_STDERR)
    assert cuts == [12.345, 44.5, 70.123]


def test_parse_scene_cut_output_handles_no_matches():
    assert parse_scene_cut_output("아무 정보도 없음") == []


@patch("scene_detector.subprocess.run")
def test_detect_scene_cuts_parses_ffmpeg_output(mock_run):
    mock_run.return_value = MagicMock(stderr=SAMPLE_FFMPEG_STDERR, returncode=0)

    cuts = detect_scene_cuts("video.mp4", threshold=0.3)

    assert cuts == [12.345, 44.5, 70.123]
    called_cmd = mock_run.call_args.args[0]
    assert "ffmpeg" in called_cmd
    assert any("scene,0.3" in arg for arg in called_cmd)


@patch("scene_detector.subprocess.run")
def test_detect_scene_cuts_returns_empty_list_on_ffmpeg_failure(mock_run):
    mock_run.side_effect = FileNotFoundError("ffmpeg not found")

    cuts = detect_scene_cuts("video.mp4")

    assert cuts == []
