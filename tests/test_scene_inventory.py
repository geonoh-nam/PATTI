import json

import pytest

from scene_inventory import SceneInventory, merge_inventories, parse_scene_inventory

CONTEXT = "공이 계단 아래로 굴러갔어요."


def raw(**overrides):
    payload = {
        "주체": "공",
        "보이는_색": ["빨간색"],
        "셀_수_있는_것": [{"이름": "공", "개수": 1}],
        "다른_사물": ["계단"],
        "흉내말": {"단어": "데굴데굴", "범주": "이동", "꾸미는_말": "굴러갔어요"},
        "안전_플래그": [],
    }
    payload.update(overrides)
    return json.dumps(payload, ensure_ascii=False)


def test_parses_a_well_formed_inventory():
    inv = parse_scene_inventory(raw(), 68.0, CONTEXT)
    assert inv.시각 == 68.0
    assert inv.주체 == "공"
    assert inv.보이는_색 == ["빨간색"]
    assert inv.셀_수_있는_것 == [("공", 1)]
    assert inv.흉내말 == ("데굴데굴", "굴러갔어요")


def test_drops_colors_outside_the_palette():
    inv = parse_scene_inventory(raw(보이는_색=["푸른색", "빨간색"]), 68.0, CONTEXT)
    assert inv.보이는_색 == ["빨간색"]   # run21의 "푸른색" 사고가 여기서 걸린다


def test_rejects_mimetic_word_outside_the_fixed_list():
    inv = parse_scene_inventory(
        raw(흉내말={"단어": "슝슝", "범주": "이동", "꾸미는_말": "굴러갔어요"}), 68.0, CONTEXT
    )
    assert inv.흉내말 is None


def test_rejects_mimetic_word_whose_category_disagrees():
    inv = parse_scene_inventory(
        raw(흉내말={"단어": "데굴데굴", "범주": "소리", "꾸미는_말": "굴러갔어요"}), 68.0, CONTEXT
    )
    assert inv.흉내말 is None


def test_rejects_mimetic_word_not_grounded_in_the_subtitle():
    inv = parse_scene_inventory(
        raw(흉내말={"단어": "데굴데굴", "범주": "이동", "꾸미는_말": "날아갔어요"}), 68.0, CONTEXT
    )
    assert inv.흉내말 is None


def test_drops_counts_outside_one_to_five():
    inv = parse_scene_inventory(
        raw(셀_수_있는_것=[{"이름": "별", "개수": 12}, {"이름": "공", "개수": 3}]), 68.0, CONTEXT
    )
    assert inv.셀_수_있는_것 == [("공", 3)]


def test_raises_on_malformed_json():
    with pytest.raises(ValueError):
        parse_scene_inventory("not json", 68.0, CONTEXT)


def test_raises_when_subject_is_missing():
    with pytest.raises(ValueError):
        parse_scene_inventory(raw(주체=""), 68.0, CONTEXT)


def inv(시각=10.0, 주체="공", 색=None, 개수=None, 사물=None, 흉내말=None, 플래그=None):
    return SceneInventory(
        시각=시각, 주체=주체,
        보이는_색=색 or [], 셀_수_있는_것=개수 or [],
        다른_사물=사물 or [], 흉내말=흉내말, 안전_플래그=플래그 or [],
    )


def test_merge_keeps_every_subject_separately():
    merged = merge_inventories([inv(주체="공"), inv(주체="나비"), inv(주체="공")])
    assert merged.주체들 == ["공", "나비"]     # 중복만 제거, 서로 다른 주체는 전부 남는다


def test_merge_unions_colors_and_other_objects():
    merged = merge_inventories([
        inv(색=["빨간색"], 사물=["나무"]),
        inv(색=["초록색", "빨간색"], 사물=["돌"]),
    ])
    assert merged.보이는_색 == ["빨간색", "초록색"]
    assert merged.다른_사물 == ["나무", "돌"]


def test_merge_keeps_countable_items_per_entry():
    merged = merge_inventories([inv(개수=[("나비", 3)]), inv(개수=[("나무", 2)])])
    assert merged.셀_수_있는_것 == [("나비", 3), ("나무", 2)]


def test_merge_collects_every_mimetic_choice():
    merged = merge_inventories([
        inv(흉내말=("데굴데굴", "굴러갔어요")),
        inv(흉내말=None),
        inv(흉내말=("훨훨", "날아갔어요")),
    ])
    assert merged.흉내말들 == [("데굴데굴", "굴러갔어요"), ("훨훨", "날아갔어요")]


def test_merge_marks_segment_unsafe_when_any_flag_present():
    assert merge_inventories([inv(), inv(플래그=["폭력"])]).안전함 is False
    assert merge_inventories([inv(), inv()]).안전함 is True


def test_merge_records_material_timestamps():
    merged = merge_inventories([inv(시각=68.0), inv(시각=72.0)])
    assert merged.재료_시각 == [68.0, 72.0]


def test_merge_of_nothing_is_safe_and_empty():
    merged = merge_inventories([])
    assert merged.주체들 == [] and merged.안전함 is True and merged.재료_시각 == []
