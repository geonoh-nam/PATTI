import json

import pytest

from scene_inventory import parse_scene_inventory

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
