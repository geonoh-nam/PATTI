from schemas import SubtitleSegment, CandidatePoint, ActivityCandidate, ACTIVITY_TYPES, DIFFICULTIES


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
    assert ac.type is None
    assert ac.question is None
    assert ac.options is None


def test_activity_types_and_difficulties_are_fixed_sets():
    assert ACTIVITY_TYPES == {"관찰", "선택", "움직임", "언어", "마무리"}
    assert DIFFICULTIES == {"easy", "medium", "hard"}
