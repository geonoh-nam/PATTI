from post_filter import filter_and_cap
from schemas import ActivityCandidate


def make(ts, score, is_suitable=True):
    return ActivityCandidate(
        is_suitable=is_suitable,
        score=score,
        timestamp_sec=ts,
        source_subtitle_range=(ts - 2, ts),
        type="관찰" if is_suitable else None,
        question="q" if is_suitable else None,
    )


def test_drops_unsuitable_and_low_score_candidates():
    candidates = [
        make(10.0, 0.9),
        make(20.0, 0.3),
        make(30.0, 0.8, is_suitable=False),
    ]
    kept, dropped = filter_and_cap(candidates, score_threshold=0.5)
    assert [c.timestamp_sec for c in kept] == [10.0]
    assert len(dropped) == 2
    dropped_ts = {c.timestamp_sec for c, _ in dropped}
    assert dropped_ts == {20.0, 30.0}
    for c, reason in dropped:
        assert reason  # 이유가 비어있지 않아야 함


def test_reenforces_minimum_spacing_after_filtering():
    candidates = [
        make(10.0, 0.9),
        make(40.0, 0.9),
        make(60.0, 0.9),
    ]
    kept, dropped = filter_and_cap(candidates, score_threshold=0.5, min_spacing_sec=45.0)
    assert [c.timestamp_sec for c in kept] == [10.0, 60.0]
    assert len(dropped) == 1
    dropped_candidate, reason = dropped[0]
    assert dropped_candidate.timestamp_sec == 40.0
    assert "간격" in reason


def test_caps_total_count_by_keeping_highest_scores():
    candidates = [make(i * 100.0, score=1.0 - i * 0.1) for i in range(10)]
    kept, dropped = filter_and_cap(candidates, score_threshold=0.0, min_spacing_sec=0.0, max_per_video=3)
    assert len(kept) == 3
    timestamps = [c.timestamp_sec for c in kept]
    assert timestamps == sorted(timestamps)
    assert timestamps == [0.0, 100.0, 200.0]
    assert len(dropped) == 7
    for c, reason in dropped:
        assert "초과" in reason


def test_empty_input_returns_empty_kept_and_empty_dropped():
    kept, dropped = filter_and_cap([])
    assert kept == []
    assert dropped == []
