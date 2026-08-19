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
    assert [a.answer for a in acts] == ["3마리", "2개"]   # 나비는 마리, 나무는 개
    assert all(a.template == "수량_확인" for a in acts)
    assert "나비" in acts[0].question and "나무" in acts[1].question


def test_count_offers_a_neighbouring_number_as_distractor():
    act = make_count(scene(개수=[("나비", 3)]))[0]
    assert set(act.options) == {"3마리", "4마리"}
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


from activity_assembler import make_first_letter, make_mimetic, make_missing_letter, make_same_initial


def test_first_letter_makes_one_activity_per_subject():
    acts = make_first_letter(scene(주체들=["나비", "호랑이"]))
    assert [a.answer for a in acts] == ["나", "호"]
    assert all(a.template == "사물_첫글자_찾기" for a in acts)


def test_first_letter_skips_single_syllable_subjects():
    assert make_first_letter(scene(주체들=["공"])) == []


def test_same_initial_needs_a_word_with_a_different_initial():
    acts = make_same_initial(scene(주체들=["나비"], 사물=["모자"]))
    assert len(acts) == 1
    act = acts[0]
    assert act.template == "같은_글자로_시작하는_낱말"
    assert "ㄴ" in act.question
    assert act.answer == "나비"
    assert "모자" in act.options


def test_same_initial_is_empty_when_every_word_shares_the_initial():
    assert make_same_initial(scene(주체들=["나비"], 사물=["나무"])) == []


def test_missing_letter_blanks_the_second_syllable():
    acts = make_missing_letter(scene(주체들=["호랑이"]))
    assert len(acts) == 1
    assert "호□이" in acts[0].question
    assert acts[0].answer == "랑"


def test_missing_letter_needs_three_syllables():
    assert make_missing_letter(scene(주체들=["나비", "공"])) == []


def test_mimetic_inserts_a_blank_before_the_modified_word():
    context = "공이 계단 아래로 굴러갔어요."
    acts = make_mimetic(scene(흉내말들=[("데굴데굴", "굴러갔어요")]), context)
    assert len(acts) == 1
    act = acts[0]
    assert act.template == "흉내_내는_말_이해"
    assert "____ 굴러갔어요" in act.question
    assert "데굴데굴" not in act.question      # 정답이 질문에 노출되면 안 된다
    assert act.answer == "데굴데굴"
    assert len(act.options) == 2


def test_mimetic_distractor_is_from_another_category():
    from activity_dictionaries import MIMETIC_WORDS

    act = make_mimetic(scene(흉내말들=[("데굴데굴", "굴러갔어요")]), "공이 굴러갔어요.")[0]
    other = [o for o in act.options if o != act.answer][0]
    assert MIMETIC_WORDS[other][1] != MIMETIC_WORDS["데굴데굴"][1]


def test_mimetic_is_empty_without_a_choice():
    assert make_mimetic(scene(흉내말들=[]), "공이 굴러갔어요.") == []


from activity_assembler import make_antonym, make_compound, make_spelling


def test_antonym_answers_with_the_opposite():
    acts = make_antonym("코끼리는 정말 크다.", 시각=20.0)
    assert len(acts) == 1
    act = acts[0]
    assert act.template == "반대말_찾기"
    assert "크다" in act.question
    assert act.answer == "작다"
    assert act.confidence == 1.0
    assert act.evidence_times == [20.0]


def test_antonym_is_empty_without_a_dictionary_word():
    assert make_antonym("오늘은 학교에 갔어요.", 시각=20.0) == []


def test_spelling_offers_a_real_and_a_corrupted_form():
    act = make_spelling("레몬 주세요.", 시각=20.0)[0]
    assert act.template == "올바른_낱말_찾기"
    assert act.answer == "레몬"
    wrong = [o for o in act.options if o != act.answer][0]
    assert wrong == "래몬"              # ㅔ → ㅐ 치환
    assert len(wrong) == len("레몬")


def test_spelling_uses_the_first_corruptible_word():
    # "노란"의 ㅗ가 "레몬"의 ㅔ보다 앞서므로 "노란"이 선택된다
    act = make_spelling("노란 레몬을 먹었어요.", 시각=20.0)[0]
    assert act.answer == "노란"
    assert "누란" in act.options


def test_spelling_is_empty_without_a_confusable_word():
    assert make_spelling("우리 집", 시각=20.0) == []


def test_compound_asks_for_the_whole_word():
    act = make_compound("마당에 눈사람을 만들었어요.", 시각=20.0)[0]
    assert act.template == "두_낱말_합치기"
    assert "눈" in act.question and "사람" in act.question
    assert act.answer == "눈사람"


def test_compound_is_empty_without_a_compound_word():
    assert make_compound("오늘은 학교에 갔어요.", 시각=20.0) == []


from activity_assembler import (
    make_cause_effect,
    make_emotion,
    make_event_order,
    make_recall,
    make_theme,
)
from story_material import Causal, EmotionCue, Event, Intent, StoryMaterial, Theme


def story():
    return StoryMaterial(
        사건=[
            Event(시각=62.0, 요약="친구들이 다리 앞에 모였다"),
            Event(시각=88.0, 요약="친구들이 다리에 올라갔다"),
            Event(시각=104.0, 요약="구름다리가 무너졌다"),
        ],
        인과=[Causal(원인_시각=88.0, 결과_시각=104.0)],
        인물_의도=[Intent(시각=62.0, 인물="할머니", 하려던_행동="청소하기", 다른_행동="요리하기")],
        감정=[EmotionCue(시각=104.0, 인물="민수", 감정="놀랐어요", 근거_자막="구름다리가 무너졌다")],
        주제=Theme(정답="힘을 합하면 해결된다", 오답=["혼자 옮겨야 한다", "많이 가져야 한다"]),
    )


def test_event_order_answer_is_chronological_and_options_are_none():
    act = make_event_order(story(), trigger_sec=150.0)[0]
    assert act.template == "사건의_순서_파악"
    assert act.options is None
    # 제시 순서는 [e1, e2, e0] 이므로 ㄱ=e1, ㄴ=e2, ㄷ=e0.
    # 시각순 정답은 e0, e1, e2 = ㄷ → ㄱ → ㄴ
    assert act.answer == "ㄷ → ㄱ → ㄴ"
    assert act.confidence == 1.0


def test_event_order_needs_three_events_before_the_trigger():
    assert make_event_order(story(), trigger_sec=90.0) == []   # 104.0 사건이 아직 안 지났다


def test_recall_offers_the_intended_action_against_another():
    act = make_recall(story(), trigger_sec=100.0)[0]
    assert act.template == "이야기_되새기기"
    assert act.answer == "청소하기"
    assert "요리하기" in act.options
    assert "할머니" in act.question


def test_recall_respects_the_trigger_boundary():
    assert make_recall(story(), trigger_sec=50.0) == []


def test_emotion_answer_comes_from_the_fixed_list():
    act = make_emotion(story(), trigger_sec=150.0)[0]
    assert act.template == "감정_추론"
    assert act.answer == "놀랐어요"
    assert len(act.options) == 2 and act.answer in act.options


def test_theme_offers_three_choices_with_lower_confidence():
    act = make_theme(story(), trigger_sec=150.0)[0]
    assert act.template == "이야기_핵심_주제"
    assert len(act.options) == 3
    assert act.answer == "힘을 합하면 해결된다"
    assert act.confidence == 0.7


def test_theme_needs_most_events_to_have_passed():
    assert make_theme(story(), trigger_sec=70.0) == []


def test_cause_effect_asks_for_the_cause_of_a_past_result():
    act = make_cause_effect(story(), trigger_sec=150.0)[0]
    assert act.template == "원인과_결과"
    assert "구름다리가 무너졌다" in act.question
    assert act.answer == "친구들이 다리에 올라갔다"
    # 사건이 3개면 원인·결과를 뺀 오답이 1개뿐이라 2지선다가 된다
    assert 2 <= len(act.options) <= 3
    assert act.confidence == 0.7


def test_cause_effect_respects_the_trigger_boundary():
    assert make_cause_effect(story(), trigger_sec=100.0) == []


# ── 구현 후 보정 4건 ───────────────────────────────────────────────────────

from activity_assembler import topic_particle


def test_mimetic_blanks_the_word_itself_when_the_subtitle_already_has_it():
    context = "노란 나비가 훨훨 날아갔어요."
    act = make_mimetic(scene(흉내말들=[("훨훨", "날아갔어요")]), context)[0]
    assert "훨훨" not in act.question      # 정답이 자막에 있으면 그 자리를 빈칸으로 만든다
    assert "____ 날아갔어요" in act.question
    assert act.answer == "훨훨"


def test_topic_particle_follows_the_final_consonant():
    assert topic_particle("나비") == "는"
    assert topic_particle("친구들") == "은"


def test_count_uses_the_right_counter_and_particle():
    act = make_count(scene(개수=[("나비", 3)]))[0]
    assert act.question == "나비는 모두 몇 마리인가요?"
    assert set(act.options) == {"3마리", "4마리"}
    assert act.answer == "3마리"

    사물 = make_count(scene(개수=[("공", 2)]))[0]
    assert 사물.question == "공은 모두 몇 개인가요?"
    assert 사물.answer == "2개"


def test_recall_question_has_no_bare_particle_placeholder():
    act = make_recall(story(), trigger_sec=100.0)[0]
    assert "은(는)" not in act.question
    assert "할머니는" in act.question


def test_color_answer_rotates_with_the_material_time():
    앞 = make_color(scene(색=["노란색"], 시각=[9.0]))[0]
    뒤 = make_color(scene(색=["노란색"], 시각=[10.0]))[0]
    assert 앞.answer != 뒤.answer          # 늘 팔레트 첫 색이면 아이가 정답을 외운다
    assert 앞.answer not in ["노란색"] and 뒤.answer not in ["노란색"]


def test_emotion_question_separates_the_quote_from_the_question():
    act = make_emotion(story(), trigger_sec=150.0)[0]
    assert act.question == "구름다리가 무너졌다\n이때 민수의 마음은 어떨까요?"
