from unittest.mock import patch, MagicMock
from pathlib import Path

from frame_sampler import extract_frames


@patch("frame_sampler.subprocess.run")
def test_extract_frames_calls_ffmpeg_per_offset(mock_run, tmp_path):
    def fake_run(cmd, **kwargs):
        output_path = Path(cmd[-1])
        output_path.write_bytes(b"fake-jpeg")
        return MagicMock(returncode=0)

    mock_run.side_effect = fake_run

    paths = extract_frames(
        video_path="video.mp4",
        timestamp_sec=42.0,
        output_dir=str(tmp_path),
        offsets=(-1.0, 0.0, 1.0),
    )

    assert mock_run.call_count == 3
    assert len(paths) == 3
    for p in paths:
        assert Path(p).exists()


@patch("frame_sampler.subprocess.run")
def test_extract_frames_skips_negative_timestamps(mock_run, tmp_path):
    def fake_run(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(b"fake-jpeg")
        return MagicMock(returncode=0)

    mock_run.side_effect = fake_run

    paths = extract_frames(
        video_path="video.mp4",
        timestamp_sec=0.5,
        output_dir=str(tmp_path),
        offsets=(-1.0, 0.0, 1.0),
    )

    assert mock_run.call_count == 2
    assert len(paths) == 2


@patch("frame_sampler.subprocess.run")
def test_extract_frames_returns_empty_list_on_ffmpeg_failure(mock_run, tmp_path):
    mock_run.side_effect = FileNotFoundError("ffmpeg not found")

    paths = extract_frames(
        video_path="video.mp4",
        timestamp_sec=42.0,
        output_dir=str(tmp_path),
        offsets=(-1.0, 0.0, 1.0),
    )

    assert paths == []
