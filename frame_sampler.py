import subprocess
from pathlib import Path

import cv2

SEARCH_RADIUS_SEC = 0.2
SEARCH_STEP_SEC = 0.2


def compute_sharpness(image_path: str) -> float:
    """Laplacian variance 기반 선명도 점수. 값이 클수록 선명함. 디코딩 실패 시 0."""
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return 0.0
    return float(cv2.Laplacian(image, cv2.CV_64F).var())


def _capture(video_path: str, t: float, out_path: Path) -> bool:
    cmd = ["ffmpeg", "-y", "-ss", f"{t:.3f}", "-i", video_path, "-frames:v", "1", str(out_path)]
    subprocess.run(cmd, check=True, capture_output=True)
    return out_path.exists()


def _search_window(offset: float) -> list[float]:
    steps = int(round(SEARCH_RADIUS_SEC / SEARCH_STEP_SEC)) if SEARCH_STEP_SEC > 0 else 0
    return [offset + i * SEARCH_STEP_SEC for i in range(-steps, steps + 1)]


def extract_frames(
    video_path: str,
    timestamp_sec: float,
    output_dir: str,
    offsets: tuple[float, ...] = (-1.0, 0.0, 1.0),
) -> list[str]:
    """오프셋(예: 1초 전/정확히/1초 후)마다 작은 시간 창 안에서 여러 후보 프레임을 뽑아
    Laplacian variance로 가장 선명한 것만 남긴다. 장면전환 근처 타임스탬프는 정확히 그
    순간의 프레임이 모션 블러일 확률이 높아, 근처에서 더 선명한 프레임을 고르기 위함이다."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    extracted: list[str] = []

    try:
        for offset in offsets:
            best_path: Path | None = None
            best_score = -1.0
            for i, sub_offset in enumerate(_search_window(offset)):
                t = timestamp_sec + sub_offset
                if t < 0:
                    continue

                cand_path = out_dir / f"_cand_{timestamp_sec:.1f}_{offset:+.1f}_{i}.jpg"
                if not _capture(video_path, t, cand_path):
                    continue

                score = compute_sharpness(str(cand_path))
                if score > best_score:
                    if best_path is not None:
                        best_path.unlink(missing_ok=True)
                    best_path, best_score = cand_path, score
                else:
                    cand_path.unlink(missing_ok=True)

            if best_path is not None:
                final_path = out_dir / f"frame_{timestamp_sec:.1f}_{offset:+.1f}.jpg"
                best_path.rename(final_path)
                extracted.append(str(final_path))
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return []

    return extracted
