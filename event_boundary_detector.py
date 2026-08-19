import subprocess
from pathlib import Path


def cosine_distance(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    denom = norm_a * norm_b
    if denom == 0:
        return 0.0
    similarity = dot / denom
    return 1.0 - similarity


def compute_boundary_scores(
    timestamped_embeddings: list[tuple[float, list[float]]],
) -> list[tuple[float, float]]:
    """연속 프레임 임베딩 사이 거리(예측 오차 근사치)를 계산한다.

    Event Segmentation Theory(Zacks et al.)의 예측 오차 신호를, 여기서는
    CLIP 임베딩 간 코사인 거리로 근사한다. 첫 프레임은 비교 대상이 없어 제외한다.
    """
    scores = []
    for i in range(1, len(timestamped_embeddings)):
        ts, emb = timestamped_embeddings[i]
        _, prev_emb = timestamped_embeddings[i - 1]
        scores.append((ts, cosine_distance(prev_emb, emb)))
    return scores


def select_boundary_candidates(
    scores: list[tuple[float, float]],
    top_k: int,
    edge_margin_sec: float = 15.0,
    video_duration_sec: float | None = None,
) -> list[float]:
    filtered = scores
    if video_duration_sec is not None:
        filtered = [
            (ts, s) for ts, s in scores if edge_margin_sec <= ts <= video_duration_sec - edge_margin_sec
        ]
    ranked = sorted(filtered, key=lambda item: item[1], reverse=True)[:top_k]
    return sorted(ts for ts, _ in ranked)


def extract_grid_frames(
    video_path: str,
    video_duration_sec: float,
    output_dir: str,
    interval_sec: float = 1.0,
) -> list[tuple[float, str]]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    frames: list[tuple[float, str]] = []
    t = 0.0
    try:
        while t <= video_duration_sec:
            out_path = out_dir / f"grid_{t:.1f}.jpg"
            cmd = [
                "ffmpeg",
                "-y",
                "-ss",
                f"{t:.3f}",
                "-i",
                video_path,
                "-frames:v",
                "1",
                str(out_path),
            ]
            subprocess.run(cmd, check=True, capture_output=True)
            if out_path.exists():
                frames.append((t, str(out_path)))
            t += interval_sec
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return frames

    return frames


class ClipEmbedder:
    """openai/clip-vit-base-patch32를 이용한 로컬 이미지 임베딩 백엔드."""

    def __init__(self, model_id: str = "openai/clip-vit-base-patch32"):
        self.model_id = model_id
        self._model = None
        self._processor = None

    def _load(self):
        from transformers import CLIPModel, CLIPProcessor

        self._model = CLIPModel.from_pretrained(self.model_id)
        self._processor = CLIPProcessor.from_pretrained(self.model_id)

    def embed(self, image_path: str) -> list[float]:
        import torch
        from PIL import Image

        if self._model is None:
            self._load()

        image = Image.open(image_path).convert("RGB")
        inputs = self._processor(images=image, return_tensors="pt")
        with torch.no_grad():
            features = self._model.get_image_features(**inputs)
        return features.pooler_output[0].tolist()


def detect_prediction_error_boundaries(
    video_path: str,
    video_duration_sec: float,
    embedder,
    output_dir: str,
    interval_sec: float = 1.0,
    top_k: int = 10,
    edge_margin_sec: float = 15.0,
) -> list[float]:
    frames = extract_grid_frames(video_path, video_duration_sec, output_dir, interval_sec)
    if len(frames) < 2:
        return []

    timestamped_embeddings = [(ts, embedder.embed(path)) for ts, path in frames]
    scores = compute_boundary_scores(timestamped_embeddings)
    return select_boundary_candidates(scores, top_k, edge_margin_sec, video_duration_sec)
