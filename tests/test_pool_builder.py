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


from pool_builder import PointMaterial, build_pool
from scene_inventory import MergedScene
from story_material import Event, StoryMaterial


def merged(주체들=None, 색=None, 안전함=True, 시각=None):
    return MergedScene(
        주체들=주체들 if 주체들 is not None else [], 보이는_색=색 or [],
        셀_수_있는_것=[], 다른_사물=[], 흉내말들=[], 안전함=안전함,
        재료_시각=시각 or [10.0],
    )


def point(trigger, scene=None, text=""):
    return PointMaterial(trigger_sec=trigger, scene=scene or merged(), context_text=text)


EMPTY_STORY = StoryMaterial(사건=[], 인과=[], 인물_의도=[], 감정=[], 주제=None)


def test_pool_ids_run_in_order_and_are_unique():
    pool = build_pool([point(20.0, merged(주체들=["나비"], 색=["빨간색"]))], EMPTY_STORY)
    assert pool
    assert [a.id for a in pool] == [f"a{n:02d}" for n in range(1, len(pool) + 1)]


def test_every_activity_carries_its_tier_and_category():
    pool = build_pool([point(20.0, merged(주체들=["나비"], 색=["빨간색"]))], EMPTY_STORY)
    assert {a.age_tier for a in pool} <= {"3-4", "5-6", "7"}
    assert all(a.category in {"글자_어휘", "관찰_이해", "맥락_추론"} for a in pool)
    색 = next(a for a in pool if a.template == "색_찾기")
    assert 색.age_tier == "3-4"
    assert 색.trigger_sec == 20.0
    assert 색.status == "ready"
    assert 색.rejected_reason is None


def test_unsafe_span_yields_no_activity():
    unsafe = point(20.0, merged(주체들=["나비"], 색=["빨간색"], 안전함=False))
    assert build_pool([unsafe], EMPTY_STORY) == []


def test_one_subject_per_activity_so_three_subjects_give_three():
    # 첫 글자 활동은 2음절 이상만 만든다(Task 7) — 주체를 전부 다음절로 둔다
    pool = build_pool([point(20.0, merged(주체들=["나비", "구름", "별빛"]))], EMPTY_STORY)
    첫글자 = [a for a in pool if a.template == "사물_첫글자_찾기"]
    assert [a.answer for a in 첫글자] == ["나", "구", "별"]


def test_find_object_distractor_comes_from_another_point():
    pool = build_pool(
        [point(20.0, merged(주체들=["나비"])), point(40.0, merged(주체들=["우산"]))],
        EMPTY_STORY,
    )
    찾기 = [a for a in pool if a.template == "그림_속_대상_찾기"]
    assert 찾기[0].answer == "나비"
    assert "우산" in 찾기[0].options


def test_identical_activity_at_the_same_point_appears_once():
    pool = build_pool([point(20.0, merged(주체들=["나비", "나비"]))], EMPTY_STORY)
    첫글자 = [a for a in pool if a.template == "사물_첫글자_찾기"]
    assert len(첫글자) == 1


def test_same_activity_at_a_different_point_is_kept():
    scene = merged(주체들=["나비"])
    pool = build_pool([point(20.0, scene), point(40.0, scene)], EMPTY_STORY)
    첫글자 = [a for a in pool if a.template == "사물_첫글자_찾기"]
    assert [a.trigger_sec for a in 첫글자] == [20.0, 40.0]


def test_story_activities_only_attach_after_their_material():
    story = StoryMaterial(
        사건=[Event(시각=62.0, 요약="모였다"), Event(시각=88.0, 요약="올라갔다"),
             Event(시각=104.0, 요약="무너졌다")],
        인과=[], 인물_의도=[], 감정=[], 주제=None,
    )
    이른_풀 = build_pool([point(70.0)], story)
    늦은_풀 = build_pool([point(150.0)], story)
    assert not [a for a in 이른_풀 if a.template == "사건의_순서_파악"]
    assert [a for a in 늦은_풀 if a.template == "사건의_순서_파악"]
