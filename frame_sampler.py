import subprocess
from pathlib import Path


def extract_frames(
    video_path: str,
    timestamp_sec: float,
    output_dir: str,
    offsets: tuple[float, ...] = (-1.0, 0.0, 1.0),
) -> list[str]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    extracted: list[str] = []

    try:
        for offset in offsets:
            t = timestamp_sec + offset
            if t < 0:
                continue

            out_path = out_dir / f"frame_{timestamp_sec:.1f}_{offset:+.1f}.jpg"
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
                extracted.append(str(out_path))
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return []

    return extracted
