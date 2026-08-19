import math
from pathlib import Path
from unittest.mock import patch, MagicMock

from event_boundary_detector import (
    cosine_distance,
    compute_boundary_scores,
    select_boundary_candidates,
    extract_grid_frames,
    detect_prediction_error_boundaries,
)


def test_cosine_distance_identical_vectors_is_zero():
    assert cosine_distance([1.0, 0.0], [1.0, 0.0]) == 0.0


def test_cosine_distance_orthogonal_vectors_is_one():
    assert math.isclose(cosine_distance([1.0, 0.0], [0.0, 1.0]), 1.0, abs_tol=1e-9)


def test_cosine_distance_opposite_vectors_is_two():
    assert math.isclose(cosine_distance([1.0, 0.0], [-1.0, 0.0]), 2.0, abs_tol=1e-9)


def test_compute_boundary_scores_pairs_consecutive_embeddings():
    embeddings = [
        (0.0, [1.0, 0.0]),
        (1.0, [1.0, 0.0]),  # 이전과 동일 -> 거리 0
        (2.0, [0.0, 1.0]),  # 이전과 직교 -> 거리 1
    ]
    scores = compute_boundary_scores(embeddings)
    assert scores == [(1.0, 0.0), (2.0, 1.0)]


def test_select_boundary_candidates_picks_top_k_by_score():
    scores = [(10.0, 0.1), (20.0, 0.9), (30.0, 0.5), (40.0, 0.2)]
    result = select_boundary_candidates(scores, top_k=2, edge_margin_sec=0.0, video_duration_sec=100.0)
    assert result == [20.0, 30.0]


def test_select_boundary_candidates_applies_edge_margin():
    scores = [(5.0, 0.9), (50.0, 0.1)]
    result = select_boundary_candidates(scores, top_k=2, edge_margin_sec=15.0, video_duration_sec=100.0)
    assert result == [50.0]


@patch("event_boundary_detector.subprocess.run")
def test_extract_grid_frames_samples_at_fixed_interval(mock_run, tmp_path):
    def fake_run(cmd, **kwargs):
        Path(cmd[-1]).write_bytes(b"fake-jpeg")
        return MagicMock(returncode=0)

    mock_run.side_effect = fake_run

    frames = extract_grid_frames("video.mp4", video_duration_sec=3.0, output_dir=str(tmp_path), interval_sec=1.0)

    assert [ts for ts, _ in frames] == [0.0, 1.0, 2.0, 3.0]
    for _, path in frames:
        assert Path(path).exists()


@patch("event_boundary_detector.subprocess.run")
def test_extract_grid_frames_returns_empty_on_ffmpeg_failure(mock_run, tmp_path):
    mock_run.side_effect = FileNotFoundError("ffmpeg not found")

    frames = extract_grid_frames("video.mp4", video_duration_sec=3.0, output_dir=str(tmp_path), interval_sec=1.0)

    assert frames == []


class FakeEmbedder:
    def __init__(self, embeddings_by_index):
        self.embeddings_by_index = embeddings_by_index
        self.calls = 0

    def embed(self, image_path):
        emb = self.embeddings_by_index[self.calls]
        self.calls += 1
        return emb


@patch("event_boundary_detector.extract_grid_frames")
def test_detect_prediction_error_boundaries_returns_high_distance_timestamps(mock_extract, tmp_path):
    mock_extract.return_value = [
        (0.0, "f0.jpg"),
        (20.0, "f1.jpg"),
        (40.0, "f2.jpg"),
        (60.0, "f3.jpg"),
    ]
    embedder = FakeEmbedder([[1.0, 0.0], [1.0, 0.0], [0.0, 1.0], [0.0, 1.0]])

    result = detect_prediction_error_boundaries(
        "video.mp4",
        video_duration_sec=80.0,
        embedder=embedder,
        output_dir=str(tmp_path),
        interval_sec=20.0,
        top_k=1,
        edge_margin_sec=15.0,
    )

    assert result == [40.0]


@patch("event_boundary_detector.extract_grid_frames")
def test_detect_prediction_error_boundaries_returns_empty_when_too_few_frames(mock_extract, tmp_path):
    mock_extract.return_value = [(0.0, "f0.jpg")]
    embedder = FakeEmbedder([[1.0, 0.0]])

    result = detect_prediction_error_boundaries(
        "video.mp4", video_duration_sec=80.0, embedder=embedder, output_dir=str(tmp_path)
    )

    assert result == []
