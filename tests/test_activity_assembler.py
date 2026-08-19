from activity_assembler import make_color, make_count, make_find_object, make_name
from scene_inventory import MergedScene


def scene(주체들=None, 색=None, 개수=None, 사물=None, 흉내말들=None, 시각=None):
    return MergedScene(
        주체들=주체들 if 주체들 is not None else ["나비"],
        보이는_색=색 or [], 셀_수_있는_것=개수 or [], 다른_사물=사물 or [],
        흉내말들=흉내말들 or [], 안전함=True, 재료_시각=시각 or [68.0],
    )


def test_color_answers_with_a_color_not_on_screen():
    acts = make_color(scene(색=["빨간색", "초록색", "파란색"]))
    assert len(acts) == 1
    act = acts[0]
    assert act.template == "색_찾기"
    assert "없는" in act.question
    assert act.answer not in ["빨간색", "초록색", "파란색"]
    assert act.answer in act.options and len(act.options) == 2
    assert act.confidence == 0.9
    assert act.evidence_times == [68.0]


def test_color_is_deterministic_and_empty_without_colors():
    assert make_color(scene(색=["빨간색"])) == make_color(scene(색=["빨간색"]))
    assert make_color(scene(색=[])) == []


def test_count_makes_one_activity_per_countable_item():
    acts = make_count(scene(개수=[("나비", 3), ("나무", 2)]))
    assert [a.answer for a in acts] == ["3개", "2개"]
    assert all(a.template == "수량_확인" for a in acts)
    assert "나비" in acts[0].question and "나무" in acts[1].question


def test_count_offers_a_neighbouring_number_as_distractor():
    act = make_count(scene(개수=[("나비", 3)]))[0]
    assert set(act.options) == {"3개", "4개"}
    act5 = make_count(scene(개수=[("별", 5)]))[0]
    assert set(act5.options) == {"5개", "4개"}


def test_name_makes_one_activity_per_subject():
    acts = make_name(scene(주체들=["나비", "공"], 사물=["나무"]))
    assert [a.answer for a in acts] == ["나비", "공"]
    assert all("나무" in a.options for a in acts)


def test_name_needs_a_distractor_object():
    assert make_name(scene(주체들=["나비"], 사물=[])) == []


def test_find_object_uses_an_object_absent_from_this_scene():
    acts = make_find_object(scene(주체들=["나비"], 사물=["나무"]), 외부_사물=["나무", "우산"])
    assert len(acts) == 1
    act = acts[0]
    assert act.template == "그림_속_대상_찾기"
    assert act.answer == "나비"
    assert "우산" in act.options       # 나무는 이 화면에 있으므로 오답이 될 수 없다
    assert "나무" not in act.options


def test_find_object_is_empty_without_an_absent_object():
    assert make_find_object(scene(주체들=["나비"], 사물=["나무"]), 외부_사물=["나무"]) == []
