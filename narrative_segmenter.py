import json

from schemas import CandidatePoint, SubtitleSegment

CONTEXT_BEFORE = 2
CONTEXT_AFTER = 0
SNAP_TOLERANCE_SEC = 0.5

PROMPT_TEMPLATE = """당신은 아동용 영상 학습 콘텐츠 기획자입니다.
아래는 영상 전체 자막입니다. 각 줄은 [시작초-끝초] 대사 형식입니다.
"(장면전환)" 표시가 붙은 줄은 그 줄 끝 부분에서 실제로 카메라 장면이 바뀐다는 뜻입니다(참고용).

영상 주제: {topic}

{lines}

이 중에서 "하나의 사건이나 대화 주고받음이 자연스럽게 마무리되는 지점"을 고르세요.
문장이나 대사가 중간에 끊기는 지점, 중요한 장면이 이어지는 지점은 고르지 마세요.
특히 다음 자막 줄이 지금 줄과 문법적으로 이어지는 하나의 문장이나 동작이면
(예: "이젠 내가" 다음 줄이 "해내겠어"처럼 한 문장이 두 줄로 나뉜 경우) 그 사이는 절대 고르지 마세요.
"(장면전환)" 표시가 붙은 줄 근처를 우선적으로 고려하되, 표시가 없다고 후보에서 무조건 제외하지는 마세요.

목록을 처음부터 끝까지 한 줄씩 순서대로 검토하세요. 조건에 맞는 지점은 하나도 빠짐없이 전부
breakpoints에 포함해야 합니다. 가장 확신이 드는 지점 한두 개만 고르고 멈추지 마세요 — 영상 전체에
걸쳐 조건을 만족하는 지점이 여러 개 있다면 전부 후보로 내야 합니다. 최종 선별은 이후 별도 단계에서
하므로, 지금 단계에서는 넓게 뽑는 것이 목표입니다.
고른 지점마다 왜 그 지점을 선택했는지, 특히 다음 줄과 이어지지 않는 이유를 한 문장으로 함께 적으세요.

응답 형식: {{"breakpoints": [{{"timestamp_sec": 22.0, "reason": "..."}}, {{"timestamp_sec": 43.7, "reason": "..."}}]}}
timestamp_sec은 반드시 위 자막 줄 목록에 나온 시작초 또는 끝초 값 중 하나를 그대로 사용하세요.
목록에 없는 임의의 숫자를 만들어내지 마세요.
"""

SCENE_CUT_PROXIMITY_SEC = 1.0


def build_segmenter_prompt(
    segments: list[SubtitleSegment], video_meta: dict, scene_cuts: list[float] | None = None
) -> str:
    scene_cuts = scene_cuts or []

    line_parts = []
    for s in segments:
        near_cut = any(abs(s.end_sec - cut) <= SCENE_CUT_PROXIMITY_SEC for cut in scene_cuts)
        marker = " (장면전환)" if near_cut else ""
        line_parts.append(f"[{s.start_sec}-{s.end_sec}]{marker} {s.text}")
    lines = "\n".join(line_parts)

    return PROMPT_TEMPLATE.format(topic=video_meta.get("topic", "미지정"), lines=lines)


def _repair_truncated_outer_brace(raw_json: str) -> str:
    """소형 모델이 breakpoints 배열은 닫고(']') 바깥 객체의 닫는 중괄호를 빠뜨린 채
    EOS를 내는 경우가 있어, 그 패턴이면 닫는 중괄호를 보충한다."""
    stripped = raw_json.rstrip()
    if stripped.endswith("]") and not stripped.endswith("]}"):
        return stripped + "}"
    return raw_json


def parse_beats_response(
    raw_json: str,
    segments: list[SubtitleSegment],
    video_duration_sec: float,
    min_spacing_sec: float = 45.0,
    edge_margin_sec: float = 15.0,
) -> list[CandidatePoint]:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError:
        try:
            data = json.loads(_repair_truncated_outer_brace(raw_json))
        except json.JSONDecodeError as exc:
            raise ValueError(f"내러티브 마디 응답이 JSON이 아닙니다: {exc}") from exc

    if "breakpoints" not in data:
        raise ValueError("필수 필드(breakpoints)가 없습니다")

    snapped: list[tuple[float, int, str | None]] = []
    for entry in data["breakpoints"]:
        if not isinstance(entry, dict) or "timestamp_sec" not in entry:
            continue
        ts = entry["timestamp_sec"]
        reason = entry.get("reason")
        for i, s in enumerate(segments):
            if abs(s.end_sec - ts) <= SNAP_TOLERANCE_SEC:
                snapped.append((s.end_sec, i, reason))
                break
            # 모델이 "끝초" 대신 다음 줄의 "시작초"를 반환하는 경우가 있어(예: 화자가
            # 바뀌는 지점을 새 대사의 시작으로 표현), 이전 줄의 끝초로 스냅한다.
            if abs(s.start_sec - ts) <= SNAP_TOLERANCE_SEC:
                if i > 0:
                    snapped.append((segments[i - 1].end_sec, i - 1, reason))
                else:
                    snapped.append((s.start_sec, i, reason))
                break

    snapped.sort(key=lambda item: item[0])

    candidates: list[CandidatePoint] = []
    last_accepted_ts: float | None = None
    for ts, idx, reason in snapped:
        if ts < edge_margin_sec or ts > video_duration_sec - edge_margin_sec:
            continue
        if last_accepted_ts is not None and ts - last_accepted_ts < min_spacing_sec:
            continue

        context_start = max(0, idx - CONTEXT_BEFORE)
        context_end = idx + 1 + CONTEXT_AFTER
        context_segments = segments[context_start:context_end]

        candidates.append(
            CandidatePoint(timestamp_sec=ts, context_segments=context_segments, reason=reason)
        )
        last_accepted_ts = ts

    return candidates


def find_narrative_beats(
    segments: list[SubtitleSegment],
    video_duration_sec: float,
    video_meta: dict,
    backend,
    min_spacing_sec: float = 45.0,
    edge_margin_sec: float = 15.0,
    scene_cuts: list[float] | None = None,
) -> list[CandidatePoint]:
    if not segments:
        return []

    prompt = build_segmenter_prompt(segments, video_meta, scene_cuts)

    for _attempt in range(2):
        raw = backend.generate(prompt, [])
        try:
            return parse_beats_response(
                raw, segments, video_duration_sec, min_spacing_sec, edge_margin_sec
            )
        except ValueError:
            continue

    return []
