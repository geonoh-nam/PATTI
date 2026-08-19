import json

import pytest

from schemas import SubtitleSegment
from story_material import parse_story_material

SEGMENTS = [
    SubtitleSegment(text="친구들이 다리 앞에 모였다.", start_sec=60.0, end_sec=62.0),
    SubtitleSegment(text="친구들이 한꺼번에 다리에 올라갔다.", start_sec=86.0, end_sec=88.0),
    SubtitleSegment(text="구름다리가 무너졌다.", start_sec=102.0, end_sec=104.0),
    SubtitleSegment(text="친구가 찾아주었어요.", start_sec=118.0, end_sec=120.0),
]


def raw(**overrides):
    payload = {
        "사건": [
            {"시각": 62.0, "요약": "친구들이 다리 앞에 모였다"},
            {"시각": 88.0, "요약": "친구들이 한꺼번에 다리에 올라갔다"},
            {"시각": 104.0, "요약": "구름다리가 무너졌다"},
        ],
        "인과": [{"원인_시각": 88.0, "결과_시각": 104.0}],
        "인물_의도": [
            {"시각": 62.0, "인물": "할머니", "하려던_행동": "청소하기", "다른_행동": "요리하기"}
        ],
        "감정": [
            {"시각": 120.0, "인물": "민수", "감정": "기뻐요", "근거_자막": "친구가 찾아주었어요"}
        ],
        "주제": {"정답": "힘을 합하면 해결된다", "오답": ["혼자 빨리 옮겨야 한다", "많이 가져야 한다"]},
    }
    payload.update(overrides)
    return json.dumps(payload, ensure_ascii=False)


def test_parses_a_well_formed_story():
    story = parse_story_material(raw(), SEGMENTS)
    assert [e.시각 for e in story.사건] == [62.0, 88.0, 104.0]
    assert story.인과[0].원인_시각 == 88.0
    assert story.감정[0].감정 == "기뻐요"
    assert story.주제.정답 == "힘을 합하면 해결된다"


def test_drops_events_whose_timestamp_is_not_in_the_subtitle():
    story = parse_story_material(
        raw(사건=[{"시각": 62.0, "요약": "진짜"}, {"시각": 999.0, "요약": "지어낸 것"}]), SEGMENTS
    )
    assert [e.시각 for e in story.사건] == [62.0]


def test_drops_causal_pairs_not_backed_by_events():
    story = parse_story_material(raw(인과=[{"원인_시각": 62.0, "결과_시각": 999.0}]), SEGMENTS)
    assert story.인과 == []


def test_drops_causal_pairs_in_the_wrong_order():
    story = parse_story_material(raw(인과=[{"원인_시각": 104.0, "결과_시각": 88.0}]), SEGMENTS)
    assert story.인과 == []


def test_drops_emotion_outside_the_fixed_list():
    story = parse_story_material(
        raw(감정=[{"시각": 120.0, "인물": "민수", "감정": "행복", "근거_자막": "친구가 찾아주었어요"}]),
        SEGMENTS,
    )
    assert story.감정 == []


def test_drops_emotion_whose_evidence_is_not_in_the_subtitle():
    story = parse_story_material(
        raw(감정=[{"시각": 120.0, "인물": "민수", "감정": "기뻐요", "근거_자막": "지어낸 대사"}]),
        SEGMENTS,
    )
    assert story.감정 == []


def test_drops_intent_whose_two_actions_are_identical():
    story = parse_story_material(
        raw(인물_의도=[{"시각": 62.0, "인물": "할머니", "하려던_행동": "청소", "다른_행동": "청소"}]),
        SEGMENTS,
    )
    assert story.인물_의도 == []


def test_drops_theme_without_exactly_two_distractors():
    assert parse_story_material(raw(주제={"정답": "가", "오답": ["나"]}), SEGMENTS).주제 is None
    assert parse_story_material(raw(주제={"정답": "가", "오답": ["가", "나"]}), SEGMENTS).주제 is None


def test_raises_on_malformed_json():
    with pytest.raises(ValueError):
        parse_story_material("not json", SEGMENTS)
