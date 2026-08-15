import json

import pytest

from activity_generator import build_prompt, parse_activity_response, generate_activity
from schemas import CandidatePoint, SubtitleSegment


def make_candidate():
    seg = SubtitleSegment(text="펭귄이 눈 위를 걷고 있어요.", start_sec=40.0, end_sec=42.3)
    return CandidatePoint(timestamp_sec=42.3, context_segments=[seg])


def test_build_prompt_includes_context_text_and_meta():
    candidate = make_candidate()
    prompt = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "4-6"})
    assert "펭귄이 눈 위를 걷고 있어요." in prompt
    assert "동물" in prompt
    assert "4-6" in prompt


def test_parse_activity_response_carries_reason_into_result():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "is_suitable": False,
            "score": 0.5,
            "reason": "카메라가 패닝 중이라 장면이 계속 이어짐",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.reason == "카메라가 패닝 중이라 장면이 계속 이어짐"


def test_parse_activity_response_valid_suitable_json():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "is_suitable": True,
            "score": 0.9,
            "type": "선택",
            "question": "펭귄처럼 세 걸음 걸어볼까?",
            "options": ["네", "아니요"],
            "answer": None,
            "difficulty": "easy",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.is_suitable is True
    assert result.type == "선택"
    assert result.timestamp_sec == 42.3
    assert result.source_subtitle_range == (40.0, 42.3)


def test_parse_activity_response_valid_unsuitable_json():
    candidate = make_candidate()
    raw = json.dumps({"is_suitable": False, "score": 0.2}, ensure_ascii=False)
    result = parse_activity_response(raw, candidate)
    assert result.is_suitable is False
    assert result.type is None


def test_parse_activity_response_rejects_invalid_type_enum():
    candidate = make_candidate()
    raw = json.dumps(
        {"is_suitable": True, "score": 0.9, "type": "존재하지않는유형", "question": "q"},
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_malformed_json():
    candidate = make_candidate()
    with pytest.raises(ValueError):
        parse_activity_response("이건 JSON이 아님", candidate)


class FakeBackend:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def generate(self, prompt, image_paths):
        self.calls += 1
        return self.responses.pop(0)


def test_generate_activity_returns_result_on_first_success():
    candidate = make_candidate()
    good = json.dumps({"is_suitable": True, "score": 0.8, "type": "관찰", "question": "무엇을 봤나요?"}, ensure_ascii=False)
    backend = FakeBackend([good])

    result = generate_activity(candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물"}, backend=backend)

    assert result is not None
    assert result.type == "관찰"
    assert backend.calls == 1


def test_generate_activity_retries_once_then_succeeds():
    candidate = make_candidate()
    good = json.dumps({"is_suitable": True, "score": 0.8, "type": "관찰", "question": "무엇을 봤나요?"}, ensure_ascii=False)
    backend = FakeBackend(["이건 JSON이 아님", good])

    result = generate_activity(candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물"}, backend=backend)

    assert result is not None
    assert backend.calls == 2


def test_generate_activity_returns_none_after_retry_fails():
    candidate = make_candidate()
    backend = FakeBackend(["이건 JSON이 아님", "여전히 JSON이 아님"])

    result = generate_activity(candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물"}, backend=backend)

    assert result is None
    assert backend.calls == 2
