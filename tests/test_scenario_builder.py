from pool_builder import PooledActivity
from scenario_builder import build_scenarios


def act(id, trigger, tier="3-4", template="색_찾기", category="관찰_이해", status="ready"):
    return PooledActivity(
        id=id, trigger_sec=trigger, age_tier=tier, category=category, template=template,
        question="", options=None, answer="", confidence=0.9, evidence="",
        evidence_times=[], status=status,
    )


def test_every_tier_gets_a_key_even_when_empty():
    assert set(build_scenarios([], target_count=3)) == {"3-4", "5-6", "7"}
    assert build_scenarios([], target_count=3)["7"] == []


def test_activities_are_picked_in_trigger_order():
    pool = [
        act("a01", 60.0, template="색_찾기", category="관찰_이해"),
        act("a02", 20.0, template="사물_첫글자_찾기", category="글자_어휘"),
        act("a03", 40.0, template="수량_확인", category="관찰_이해"),
    ]
    assert build_scenarios(pool, target_count=3)["3-4"] == ["a02", "a03", "a01"]


def test_target_count_bounds_the_scenario_not_the_pool():
    pool = [act(f"a{n:02d}", float(n * 10), template=f"t{n}") for n in range(1, 8)]
    assert len(build_scenarios(pool, target_count=3)["3-4"]) == 3


def test_only_that_tier_is_used():
    pool = [act("a01", 20.0, tier="3-4"), act("a02", 40.0, tier="7")]
    scenarios = build_scenarios(pool, target_count=3)
    assert scenarios["3-4"] == ["a01"]
    assert scenarios["7"] == ["a02"]


def test_non_ready_activities_are_not_used():
    pool = [act("a01", 20.0, status="review"), act("a02", 40.0, status="regenerate")]
    assert build_scenarios(pool, target_count=3)["3-4"] == []


def test_the_same_template_never_runs_twice_in_a_row():
    pool = [
        act("a01", 20.0, template="색_찾기", category="관찰_이해"),
        act("a02", 30.0, template="색_찾기", category="관찰_이해"),
        act("a03", 40.0, template="수량_확인", category="관찰_이해"),
    ]
    assert build_scenarios(pool, target_count=3)["3-4"] == ["a01", "a03"]


def test_categories_are_spread_before_one_of_them_repeats():
    pool = [
        act("a01", 10.0, template="색_찾기", category="관찰_이해"),
        act("a02", 20.0, template="수량_확인", category="관찰_이해"),
        act("a03", 30.0, template="사물_첫글자_찾기", category="글자_어휘"),
    ]
    assert build_scenarios(pool, target_count=2)["3-4"] == ["a01", "a03"]


def test_second_pass_fills_up_when_the_category_cap_blocks_it():
    pool = [
        act("a01", 10.0, template="색_찾기", category="관찰_이해"),
        act("a02", 20.0, template="수량_확인", category="관찰_이해"),
        act("a03", 30.0, template="그림_속_대상_찾기", category="관찰_이해"),
    ]
    assert build_scenarios(pool, target_count=3)["3-4"] == ["a01", "a02", "a03"]


def test_short_pool_gives_a_short_scenario():
    assert build_scenarios([act("a01", 10.0)], target_count=5)["3-4"] == ["a01"]
