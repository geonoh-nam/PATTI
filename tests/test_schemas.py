from schemas import (
    ACTIVITY_CATEGORY,
    TEMPLATES_BY_AGE_TIER,
    ActivityCandidate,
    CandidatePoint,
    SubtitleSegment,
    templates_for_tier,
)


def test_subtitle_segment_fields():
    seg = SubtitleSegment(text="안녕", start_sec=1.0, end_sec=2.5)
    assert seg.text == "안녕"
    assert seg.start_sec == 1.0
    assert seg.end_sec == 2.5


def test_candidate_point_holds_context():
    seg = SubtitleSegment(text="안녕", start_sec=1.0, end_sec=2.5)
    cp = CandidatePoint(timestamp_sec=2.5, context_segments=[seg])
    assert cp.timestamp_sec == 2.5
    assert cp.context_segments == [seg]


def test_activity_candidate_defaults_to_unsuitable_fields_none():
    ac = ActivityCandidate(
        is_suitable=False,
        score=0.1,
        timestamp_sec=2.5,
        source_subtitle_range=(1.0, 2.5),
    )
    assert ac.activity_template is None
    assert ac.question is None
    assert ac.options is None
    assert ac.scene_description is None


def test_each_tier_has_its_own_template_set():
    assert set(TEMPLATES_BY_AGE_TIER) == {"3-4", "5-6", "7"}
    assert len(TEMPLATES_BY_AGE_TIER["3-4"]) == 5
    assert len(TEMPLATES_BY_AGE_TIER["5-6"]) == 5
    assert len(TEMPLATES_BY_AGE_TIER["7"]) == 6
    names = [n for tier in TEMPLATES_BY_AGE_TIER.values() for n in tier]
    assert len(names) == len(set(names)) == 16


def test_templates_for_tier_returns_only_that_tier():
    assert "색_찾기" in templates_for_tier("3-4")
    assert "색_찾기" not in templates_for_tier("7")
    assert "반대말_찾기" in templates_for_tier("7")
    assert "반대말_찾기" not in templates_for_tier("3-4")


def test_unknown_tier_returns_empty_catalog():
    assert templates_for_tier("9-10") == {}


def test_every_template_has_a_category():
    for tier in TEMPLATES_BY_AGE_TIER.values():
        for name in tier:
            assert ACTIVITY_CATEGORY[name] in {"글자_어휘", "관찰_이해", "맥락_추론"}


def test_retired_templates_are_gone():
    names = {n for tier in TEMPLATES_BY_AGE_TIER.values() for n in tier}
    assert "맥락_대화_완성" not in names
    assert "표현_이해하기" not in names
    assert "글자_들어간_단어_찾기" not in names
