"""자막 전체를 읽은 텍스트 호출의 산출물 — 영상당 한 벌의 이야기 재료.

사건의 순서·핵심 주제·원인과 결과·이야기 되새기기·감정 추론은 이 재료 없이 만들 수 없다.
검증에 실패한 항목만 버리고 나머지는 살린다 — 사건 하나가 잘못됐다고 전체를 버리면 수율이 무너진다.
"""

import json
from dataclasses import dataclass, field

from activity_dictionaries import EMOTIONS
from schemas import SubtitleSegment


@dataclass
class Event:
    시각: float
    요약: str


@dataclass
class Causal:
    원인_시각: float
    결과_시각: float


@dataclass
class Intent:
    시각: float
    인물: str
    하려던_행동: str
    다른_행동: str


@dataclass
class EmotionCue:
    시각: float
    인물: str
    감정: str
    근거_자막: str


@dataclass
class Theme:
    정답: str
    오답: list[str]


@dataclass
class StoryMaterial:
    사건: list[Event] = field(default_factory=list)
    인과: list[Causal] = field(default_factory=list)
    인물_의도: list[Intent] = field(default_factory=list)
    감정: list[EmotionCue] = field(default_factory=list)
    주제: Theme | None = None


def _subtitle_times(segments: list[SubtitleSegment]) -> set[float]:
    """모델이 시각을 지어내지 못하도록, 자막에 실제로 있는 시각만 허용한다."""
    times = set()
    for segment in segments:
        times.add(segment.start_sec)
        times.add(segment.end_sec)
    return times


def _parse_events(entries, valid_times: set[float]) -> list[Event]:
    events = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        시각 = entry.get("시각")
        요약 = entry.get("요약")
        if 시각 in valid_times and 요약:
            events.append(Event(시각=float(시각), 요약=요약))
    return events


def _parse_causals(entries, events: list[Event]) -> list[Causal]:
    event_times = {e.시각 for e in events}
    causals = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        원인 = entry.get("원인_시각")
        결과 = entry.get("결과_시각")
        if 원인 in event_times and 결과 in event_times and 원인 < 결과:
            causals.append(Causal(원인_시각=float(원인), 결과_시각=float(결과)))
    return causals


def _parse_intents(entries, valid_times: set[float]) -> list[Intent]:
    intents = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        시각 = entry.get("시각")
        하려던 = entry.get("하려던_행동")
        다른 = entry.get("다른_행동")
        if 시각 in valid_times and 하려던 and 다른 and 하려던 != 다른:
            intents.append(
                Intent(시각=float(시각), 인물=entry.get("인물") or "", 하려던_행동=하려던, 다른_행동=다른)
            )
    return intents


def _parse_emotions(entries, valid_times: set[float], subtitle_text: str) -> list[EmotionCue]:
    cues = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        시각 = entry.get("시각")
        감정 = entry.get("감정")
        근거 = entry.get("근거_자막")
        if 시각 not in valid_times or 감정 not in EMOTIONS:
            continue
        if not 근거 or 근거 not in subtitle_text:
            # 자막에 없는 대사를 근거로 든 감정은 버린다
            continue
        cues.append(
            EmotionCue(시각=float(시각), 인물=entry.get("인물") or "", 감정=감정, 근거_자막=근거)
        )
    return cues


def _parse_theme(entry) -> Theme | None:
    if not isinstance(entry, dict):
        return None
    정답 = entry.get("정답")
    오답 = entry.get("오답") or []
    if not 정답 or len(오답) != 2:
        return None
    if 정답 in 오답 or 오답[0] == 오답[1]:
        return None
    return Theme(정답=정답, 오답=list(오답))


def parse_story_material(raw_json: str, segments: list[SubtitleSegment]) -> StoryMaterial:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"이야기 재료 응답이 JSON이 아닙니다: {exc}") from exc

    valid_times = _subtitle_times(segments)
    subtitle_text = " ".join(s.text for s in segments)

    events = _parse_events(data.get("사건"), valid_times)
    return StoryMaterial(
        사건=events,
        인과=_parse_causals(data.get("인과"), events),
        인물_의도=_parse_intents(data.get("인물_의도"), valid_times),
        감정=_parse_emotions(data.get("감정"), valid_times, subtitle_text),
        주제=_parse_theme(data.get("주제")),
    )
