from unittest.mock import patch, MagicMock
from pathlib import Path

from frame_sampler import extract_frames, compute_sharpness


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

    # 오프셋 3개 x 선명도 비교용 후보 3개(=-0.2/0/+0.2초 탐색창) = ffmpeg 9회 호출
    assert mock_run.call_count == 9
    assert len(paths) == 3
    for p in paths:
        assert Path(p).exists()
        assert Path(p).name.startswith("frame_")


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

    # offset=-1.0의 탐색창(-1.2~-0.8초)은 전부 음수라 통째로 스킵 -> 남은 두 오프셋만 3회씩
    assert mock_run.call_count == 6
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


@patch("frame_sampler.compute_sharpness")
@patch("frame_sampler.subprocess.run")
def test_extract_frames_keeps_only_sharpest_candidate_per_offset(mock_run, mock_sharpness, tmp_path):
    def fake_run(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(b"fake-jpeg")
        return MagicMock(returncode=0)

    mock_run.side_effect = fake_run
    # 후보 3개 중 두 번째(index 1)가 가장 선명하도록 점수 부여
    mock_sharpness.side_effect = [1.0, 9.0, 2.0]

    paths = extract_frames(
        video_path="video.mp4",
        timestamp_sec=42.0,
        output_dir=str(tmp_path),
        offsets=(0.0,),
    )

    assert len(paths) == 1
    # 선명도가 가장 높았던 후보만 최종 파일로 남고, 나머지 후보 파일은 삭제되어야 함
    remaining_files = list(tmp_path.iterdir())
    assert len(remaining_files) == 1
    assert remaining_files[0].name == "frame_42.0_+0.0.jpg"


def test_compute_sharpness_returns_zero_for_undecodable_image(tmp_path):
    bogus = tmp_path / "not_an_image.jpg"
    bogus.write_bytes(b"this is not a real jpeg")

    assert compute_sharpness(str(bogus)) == 0.0
