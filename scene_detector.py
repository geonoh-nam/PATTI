import re
import subprocess

_PTS_TIME_RE = re.compile(r"pts_time:(\d+\.?\d*)")


def parse_scene_cut_output(ffmpeg_stderr: str) -> list[float]:
    return [float(m) for m in _PTS_TIME_RE.findall(ffmpeg_stderr)]


def detect_scene_cuts(video_path: str, threshold: float = 0.3) -> list[float]:
    cmd = [
        "ffmpeg",
        "-i",
        video_path,
        "-vf",
        f"select='gt(scene,{threshold})',showinfo",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
    except (subprocess.SubprocessError, FileNotFoundError, OSError):
        return []

    return parse_scene_cut_output(result.stderr or "")
