"""안전 지점 탐지 — 아이의 시청을 방해하지 않고 끊을 수 있는 지점을 신호로 계산한다.

기획서 §4.1-2("장면 전환, 침묵 구간, 대화 종료 지점을 찾는다")를 모델 호출 없이 구현한다.
판정 기준은 "여기서 문제를 만들 수 있는가"가 아니라 "여기서 끊어도 방해가 되지 않는가"다.
"""

from schemas import SubtitleSegment

SENTENCE_END_PUNCTUATION = (".", "!", "?", "…")
# 한국어 종결어미의 마지막 음절. 자막이 이미 문장 단위로 끊겨 있어 대부분 통과하므로
# 변별 신호가 아니라 필요조건으로만 쓴다(실측: 47줄 중 45줄 통과).
SENTENCE_END_SYLLABLES = ("다", "야", "어", "아", "지", "까", "네", "요", "자", "군", "걸", "래", "죠")

DEFAULT_MIN_SILENCE_SEC = 1.0


def is_sentence_closed(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.endswith(SENTENCE_END_PUNCTUATION):
        return True
    words = stripped.rstrip(".,!?~… ").split()
    return bool(words) and words[-1].endswith(SENTENCE_END_SYLLABLES)


def find_raw_safe_points(
    segments: list[SubtitleSegment],
    video_duration_sec: float,
    min_silence_sec: float = DEFAULT_MIN_SILENCE_SEC,
) -> list[tuple[int, float, float]]:
    """문장이 완결되고 뒤에 침묵이 있는 자막 줄을 (인덱스, 끝초, 침묵 길이)로 돌려준다.

    간격·가장자리 필터는 적용하지 않는다 — find_safe_points가 담당한다.
    """
    raw: list[tuple[int, float, float]] = []
    for i, segment in enumerate(segments):
        next_start = segments[i + 1].start_sec if i + 1 < len(segments) else video_duration_sec
        silence_sec = next_start - segment.end_sec
        if silence_sec < min_silence_sec:
            continue
        if not is_sentence_closed(segment.text):
            continue
        raw.append((i, segment.end_sec, silence_sec))
    return raw
