from dataclasses import dataclass


@dataclass
class SubtitleSegment:
    text: str
    start_sec: float
    end_sec: float


@dataclass
class CandidatePoint:
    timestamp_sec: float
    context_segments: list[SubtitleSegment]
    reason: str | None = None


@dataclass
class ActivityCandidate:
    is_suitable: bool
    score: float
    timestamp_sec: float
    source_subtitle_range: tuple[float, float]
    type: str | None = None
    question: str | None = None
    options: list[str] | None = None
    answer: str | None = None
    difficulty: str | None = None
    reason: str | None = None


ACTIVITY_TYPES = {"관찰", "선택", "움직임", "언어", "마무리"}
DIFFICULTIES = {"easy", "medium", "hard"}
