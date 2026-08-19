from pool_builder import assign_materials
from scene_inventory import SceneInventory
from schemas import SubtitleSegment


def inv(시각, 주체="공", 색=None, 플래그=None):
    return SceneInventory(
        시각=시각, 주체=주체, 보이는_색=색 or [], 셀_수_있는_것=[],
        다른_사물=[], 흉내말=None, 안전_플래그=플래그 or [],
    )


SEGMENTS = [
    SubtitleSegment(text="공이 굴러갔어요.", start_sec=8.0, end_sec=10.0),
    SubtitleSegment(text="나비가 날아왔어요.", start_sec=28.0, end_sec=30.0),
]


def test_each_point_takes_the_span_since_the_previous_point():
    points = assign_materials([20.0, 40.0], [inv(10.0, "공"), inv(30.0, "나비")], SEGMENTS)
    assert [p.trigger_sec for p in points] == [20.0, 40.0]
    assert points[0].scene.주체들 == ["공"]
    assert points[1].scene.주체들 == ["나비"]


def test_first_point_takes_everything_from_zero():
    points = assign_materials([40.0], [inv(10.0, "공"), inv(30.0, "나비")], SEGMENTS)
    assert points[0].scene.주체들 == ["공", "나비"]


def test_context_text_is_the_subtitles_of_that_span():
    points = assign_materials([20.0, 40.0], [], SEGMENTS)
    assert points[0].context_text == "공이 굴러갔어요."
    assert points[1].context_text == "나비가 날아왔어요."


def test_point_without_any_material_is_kept_with_an_empty_scene():
    points = assign_materials([20.0], [], [])
    assert len(points) == 1
    assert points[0].scene.주체들 == []
    assert points[0].context_text == ""


def test_inventories_after_the_last_point_are_dropped():
    points = assign_materials([20.0], [inv(10.0, "공"), inv(50.0, "나비")], SEGMENTS)
    assert points[0].scene.주체들 == ["공"]


def test_unsafe_flag_in_the_span_marks_the_whole_point_unsafe():
    points = assign_materials([20.0], [inv(10.0, "공", 플래그=["폭력"])], SEGMENTS)
    assert points[0].scene.안전함 is False
