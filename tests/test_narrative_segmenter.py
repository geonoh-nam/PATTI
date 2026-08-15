import json

import pytest

from narrative_segmenter import build_segmenter_prompt, parse_beats_response, find_narrative_beats
from schemas import SubtitleSegment


def seg(text, start, end):
    return SubtitleSegment(text=text, start_sec=start, end_sec=end)


def bp(ts, reason="이유"):
    return {"timestamp_sec": ts, "reason": reason}


def make_segments():
    return [
        seg("아기 고래를 너무 사랑해서", 8.0, 11.7),
        seg("항상 곁을 떠나지 않은대", 12.0, 17.7),
        seg("전설이 사실이었구나", 18.0, 18.7),
        seg("다시 나타났구나", 19.0, 21.7),
    ]


def test_build_segmenter_prompt_lists_all_segments_with_timestamps():
    segments = make_segments()
    prompt = build_segmenter_prompt(segments, video_meta={"topic": "판타지"})
    assert "[8.0-11.7] 아기 고래를 너무 사랑해서" in prompt
    assert "[19.0-21.7] 다시 나타났구나" in prompt
    assert "판타지" in prompt


def test_build_segmenter_prompt_marks_lines_near_scene_cuts():
    segments = make_segments()
    # 21.7과 아주 가까운(1초 이내) scene cut -> 해당 줄에만 마커가 붙어야 함
    prompt = build_segmenter_prompt(segments, video_meta={"topic": "판타지"}, scene_cuts=[21.9])
    assert "[19.0-21.7] (장면전환) 다시 나타났구나" in prompt
    assert "[8.0-11.7] 아기 고래를 너무 사랑해서" in prompt  # 마커 없는 줄은 그대로


def test_build_segmenter_prompt_marks_no_lines_when_scene_cuts_far_away():
    segments = make_segments()
    prompt = build_segmenter_prompt(segments, video_meta={"topic": "판타지"}, scene_cuts=[500.0])
    assert "] (장면전환)" not in prompt


def test_build_segmenter_prompt_marks_no_lines_when_scene_cuts_none():
    segments = make_segments()
    prompt = build_segmenter_prompt(segments, video_meta={"topic": "판타지"})
    assert "] (장면전환)" not in prompt


def test_parse_beats_response_snaps_to_real_segment_end_and_filters_edges_and_spacing():
    segments = make_segments()
    raw = json.dumps({"breakpoints": [bp(11.7), bp(21.7)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert [c.timestamp_sec for c in result] == [11.7, 21.7]


def test_parse_beats_response_carries_reason_into_candidate():
    segments = make_segments()
    raw = json.dumps(
        {"breakpoints": [bp(11.7, reason="아기 고래에 대한 소개가 끝나는 지점")]}, ensure_ascii=False
    )

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert len(result) == 1
    assert result[0].reason == "아기 고래에 대한 소개가 끝나는 지점"


def test_parse_beats_response_snaps_start_sec_to_previous_segment_end():
    segments = make_segments()
    # 19.0은 4번째 세그먼트("다시 나타났구나")의 시작초 -> 3번째 세그먼트의 끝초(18.7)로 스냅되어야 함
    raw = json.dumps({"breakpoints": [bp(19.0)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert [c.timestamp_sec for c in result] == [18.7]


def test_parse_beats_response_silently_drops_hallucinated_timestamp():
    segments = make_segments()
    raw = json.dumps({"breakpoints": [bp(11.7), bp(15.0)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert [c.timestamp_sec for c in result] == [11.7]


def test_parse_beats_response_silently_drops_malformed_entry():
    segments = make_segments()
    raw = json.dumps({"breakpoints": [{"reason": "timestamp_sec 없음"}, bp(11.7)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert [c.timestamp_sec for c in result] == [11.7]


def test_parse_beats_response_applies_edge_margin_and_min_spacing():
    segments = make_segments()
    raw = json.dumps({"breakpoints": [bp(11.7), bp(18.7), bp(21.7)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=25.0, min_spacing_sec=45.0, edge_margin_sec=10.0)

    assert [c.timestamp_sec for c in result] == [11.7]


def test_parse_beats_response_builds_context_from_surrounding_segments():
    segments = make_segments()
    raw = json.dumps({"breakpoints": [bp(18.7)]}, ensure_ascii=False)

    result = parse_beats_response(raw, segments, video_duration_sec=100.0, min_spacing_sec=0.0, edge_margin_sec=0.0)

    assert len(result) == 1
    context_texts = [s.text for s in result[0].context_segments]
    assert context_texts == ["아기 고래를 너무 사랑해서", "항상 곁을 떠나지 않은대", "전설이 사실이었구나"]


def test_parse_beats_response_rejects_malformed_json():
    segments = make_segments()
    with pytest.raises(ValueError):
        parse_beats_response("이건 JSON이 아님", segments, video_duration_sec=100.0)


def test_parse_beats_response_rejects_missing_key():
    segments = make_segments()
    with pytest.raises(ValueError):
        parse_beats_response(json.dumps({}), segments, video_duration_sec=100.0)


class FakeBackend:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0
        self.last_image_paths = None

    def generate(self, prompt, image_paths):
        self.calls += 1
        self.last_image_paths = image_paths
        return self.responses.pop(0)


def test_find_narrative_beats_calls_backend_with_no_images():
    segments = make_segments()
    good = json.dumps({"breakpoints": [bp(21.7)]}, ensure_ascii=False)
    backend = FakeBackend([good])

    result = find_narrative_beats(segments, video_duration_sec=100.0, video_meta={"topic": "판타지"}, backend=backend)

    assert len(result) == 1
    assert backend.last_image_paths == []


def test_find_narrative_beats_retries_once_then_succeeds():
    segments = make_segments()
    good = json.dumps({"breakpoints": [bp(21.7)]}, ensure_ascii=False)
    backend = FakeBackend(["이건 JSON이 아님", good])

    result = find_narrative_beats(segments, video_duration_sec=100.0, video_meta={}, backend=backend)

    assert len(result) == 1
    assert backend.calls == 2


def test_find_narrative_beats_returns_empty_list_after_retry_fails():
    segments = make_segments()
    backend = FakeBackend(["이건 JSON이 아님", "여전히 JSON이 아님"])

    result = find_narrative_beats(segments, video_duration_sec=100.0, video_meta={}, backend=backend)

    assert result == []
    assert backend.calls == 2
