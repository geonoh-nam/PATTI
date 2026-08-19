from schemas import SubtitleSegment, CandidatePoint, ActivityCandidate, ACTIVITY_TEMPLATES, AGE_DIFFICULTY_GUIDANCE


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


def test_activity_templates_is_a_single_unified_catalog():
    # 연령별로 나뉘지 않은 단일 카탈로그 — 모든 연령대가 같은 목록을 본다
    assert len(ACTIVITY_TEMPLATES) > 0
    for name, description in ACTIVITY_TEMPLATES.items():
        assert isinstance(name, str) and name
        assert isinstance(description, str) and description


def test_age_difficulty_guidance_covers_three_fixed_tiers():
    assert set(AGE_DIFFICULTY_GUIDANCE.keys()) == {"3-4", "5-6", "7"}
    for tier, guidance in AGE_DIFFICULTY_GUIDANCE.items():
        assert isinstance(guidance, str) and guidance
