import json

import pytest

from activity_generator import build_prompt, parse_activity_response, generate_activity
from schemas import CandidatePoint, SubtitleSegment


def make_candidate():
    seg = SubtitleSegment(text="포도가 나무에 매달려 있어요.", start_sec=40.0, end_sec=42.3)
    return CandidatePoint(timestamp_sec=42.3, context_segments=[seg])


def make_candidate_with_context(text):
    seg = SubtitleSegment(text=text, start_sec=40.0, end_sec=42.3)
    return CandidatePoint(timestamp_sec=42.3, context_segments=[seg])


def test_build_prompt_includes_context_text_meta_and_template_catalog():
    candidate = make_candidate()
    prompt = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "3-4"})
    assert "포도가 나무에 매달려 있어요." in prompt
    assert "동물" in prompt
    assert "3-4" in prompt
    assert "색_찾기" in prompt  # 3-4세 템플릿 카탈로그가 프롬프트에 나열됨


def test_build_prompt_shows_full_catalog_regardless_of_age_tier():
    # 연령별로 카탈로그를 좁히지 않고, 모든 연령이 14개 전체 유형을 다 본다
    candidate = make_candidate()
    prompt_3_4 = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "3-4"})
    prompt_7 = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "7"})
    assert "반대말_찾기" in prompt_3_4
    assert "반대말_찾기" in prompt_7


def test_build_prompt_uses_different_difficulty_guidance_per_age_tier():
    candidate = make_candidate()
    prompt_3_4 = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "3-4"})
    prompt_7 = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "7"})
    assert "아직 글을 읽거나" in prompt_3_4
    assert "아직 글을 읽거나" not in prompt_7
    assert "추상적인 활동을 우선" in prompt_7
    assert "추상적인 활동을 우선" not in prompt_3_4


def test_build_prompt_requires_scene_description_before_judgment():
    # 화면 그라운딩을 강제하기 위해, 판단보다 먼저 장면 설명을 쓰도록 지시해야 함
    candidate = make_candidate()
    prompt = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "5-6"})
    assert "scene_description" in prompt
    assert "먼저" in prompt


def test_build_prompt_requires_objective_answers_and_combined_inference():
    # 표정만 보고 주관적으로 감정을 추측하는 대신, 대부분은 객관적으로 검증 가능한 정답만
    # 만들게 하고, 추론형 활동은 화면과 자막을 함께 근거로 삼게 해야 함
    candidate = make_candidate()
    prompt = build_prompt(candidate, video_meta={"topic": "동물", "age_range": "5-6"})
    assert "객관적으로 검증 가능" in prompt
    assert "화면과 자막을 함께" in prompt


def test_parse_activity_response_carries_reason_into_result():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "카메라가 좌우로 움직이며 배경 건물이 흐르듯 지나간다.",
            "is_suitable": False,
            "score": 0.5,
            "reason": "카메라가 패닝 중이라 장면이 계속 이어짐",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.reason == "카메라가 패닝 중이라 장면이 계속 이어짐"


def test_parse_activity_response_carries_scene_description_into_result():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "포도송이가 화면 중앙에 뚜렷하게 보인다. 짙은 보라색이다.",
            "is_suitable": True,
            "score": 0.9,
            "activity_template": "색_찾기",
            "question": "포도의 색깔은 무슨색일까?",
            "options": None,
            "answer": "보라",
            "reason": "포도가 뚜렷하게 보임",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.scene_description == "포도송이가 화면 중앙에 뚜렷하게 보인다. 짙은 보라색이다."


def test_parse_activity_response_rejects_missing_scene_description():
    # 화면 설명이 없으면 is_suitable 값과 무관하게 거부해서 그라운딩을 강제한다
    candidate = make_candidate()
    raw = json.dumps(
        {
            "is_suitable": True,
            "score": 0.9,
            "activity_template": "색_찾기",
            "question": "포도의 색깔은?",
            "answer": "보라",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_valid_suitable_json():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "포도송이가 화면 중앙에 뚜렷하게 보인다. 짙은 보라색이다.",
            "is_suitable": True,
            "score": 0.9,
            "activity_template": "색_찾기",
            "question": "포도의 색깔은 무슨색일까?",
            "options": None,
            "answer": "보라",
            "reason": "포도가 뚜렷하게 보임",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.is_suitable is True
    assert result.activity_template == "색_찾기"
    assert result.answer == "보라"
    assert result.timestamp_sec == 42.3
    assert result.source_subtitle_range == (40.0, 42.3)


def test_parse_activity_response_valid_unsuitable_json():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "화면이 흔들리며 무엇이 보이는지 알아보기 어렵다.",
            "is_suitable": False,
            "score": 0.2,
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.is_suitable is False
    assert result.activity_template is None


def test_parse_activity_response_snaps_near_miss_template_name():
    candidate = make_candidate()
    # "이야기_되새기"는 정확한 템플릿명("이야기_되새기기")에서 글자 하나가 빠진 경우
    raw = json.dumps(
        {
            "scene_description": "포도송이가 화면에 보인다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "이야기_되새기",
            "question": "q",
            "answer": "a",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.activity_template == "이야기_되새기기"


def test_parse_activity_response_maps_known_alias_template_names_to_real_template():
    # 모델이 "표정_찾기"/"표정_추론"처럼 카탈로그에 없는 이름을 반복해서 지어내는 경우가 있는데,
    # 이건 철자가 아니라 의미가 겹치는 것(표현_이해하기)이라 유사도 매칭으로는 안 잡힌다.
    candidate = make_candidate()
    for alias in ["표정_찾기", "표정_추론"]:
        raw = json.dumps(
            {
                "scene_description": "소녀가 놀란 표정을 짓고 있다.",
                "is_suitable": True,
                "score": 0.8,
                "activity_template": alias,
                "question": "소녀의 표정은 어떤가?",
                "answer": "놀람",
            },
            ensure_ascii=False,
        )
        result = parse_activity_response(raw, candidate)
        assert result.activity_template == "표현_이해하기"


def test_parse_activity_response_rejects_unknown_template_name():
    candidate = make_candidate()
    # 통합 카탈로그 14개 중 어느 것과도 유사하지 않은, 완전히 무관한 이름
    raw = json.dumps(
        {
            "scene_description": "포도송이가 화면에 보인다.",
            "is_suitable": True,
            "score": 0.9,
            "activity_template": "완전히무관한활동명123",
            "question": "q",
            "answer": "a",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_corrects_near_miss_quoted_reference_using_context():
    # 모델이 인용부호로 자막을 인용하는 척하면서 이름을 한 글자 틀리게 씀
    # ("사랑의 하슈핑" vs 실제 자막의 "사랑의 하츄핑"). 근거가 자막에 있으므로 reject 대신 교정한다.
    candidate = make_candidate_with_context("사랑의 하츄핑 이야기가 시작돼요.")
    raw = json.dumps(
        {
            "scene_description": "캐릭터가 화면 중앙에 서 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "이야기_되새기기",
            "question": "이전 자막에서 '사랑의 하슈핑'이란 이름이 등장했었는데, 이 영화의 주제는 무엇일까요?",
            "answer": "사랑의 하슈핑",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert "사랑의 하츄핑" in result.question
    assert "하슈핑" not in result.question
    assert result.answer == "사랑의 하츄핑"


def test_parse_activity_response_rejects_ungrounded_quoted_reference():
    # 자막 어디에도 근거가 없는 인용은 교정할 수 없으므로 그대로 reject한다
    candidate = make_candidate_with_context("사랑의 하츄핑 이야기가 시작돼요.")
    raw = json.dumps(
        {
            "scene_description": "캐릭터가 화면 중앙에 서 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "이야기_되새기기",
            "question": "이전 자막에서 '완전히다른이름123'이 등장했는데, 주제는 무엇일까요?",
            "answer": "완전히다른이름123",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_when_question_equals_answer():
    # 모델이 질문 자리에 자막 원문을 그대로 복사하고 정답도 똑같이 복사하는 퇴화된 응답을 방지
    candidate = make_candidate_with_context("사랑의 하츄핑 이야기가 시작돼요.")
    raw = json.dumps(
        {
            "scene_description": "캐릭터가 화면 중앙에 서 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "이야기_되새기기",
            "question": "사랑의 하츄핑 이야기가 시작돼요.",
            "answer": "사랑의 하츄핑 이야기가 시작돼요.",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_answer_that_is_a_scene_present_color_when_multiple_colors():
    # 화면에 색깔이 여러 개 보이는데(전선 빨강/초록/파랑) "그 중 하나"를 정답으로 하면
    # 정답이 여러 개 가능해진다. 화면에 있는 색을 정답으로 하는 건 항상 거부해야 한다.
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "주체: 전선. 빨강, 초록, 파랑 색깔의 전선이 여러 개 보인다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "전선 중 하나의 색깔은 무엇일까?",
            "options": None,
            "answer": "빨강",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_accepts_absent_color_named_directly_as_answer():
    # "이 화면에 없는 색깔은 무엇일까요?"처럼 열린 질문으로 묻고, 화면에 있는 색을 제외한
    # 색깔 이름 자체를 정답으로 만들면 모호함 없이 확실한 정답이 된다
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "주체: 전선. 빨강, 초록, 파랑 색깔의 전선이 여러 개 보인다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "이 화면에 없는 색깔은 무엇일까요?",
            "options": None,
            "answer": "노란색",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.answer == "노란색"


def test_parse_activity_response_rejects_compound_color_answer():
    # "파란색과 흰색"처럼 색깔 두 개를 붙여서 답하면 정답이 하나로 떨어지지 않는다
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "주체: 거리의 건물. 파란색과 흰색으로 칠해져 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "이 건물의 주요 색깔은 무엇일까?",
            "answer": "파란색과 흰색",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_accepts_single_color_answer():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "주체: 거리의 건물. 파란색으로 칠해져 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "이 건물의 색깔은 무엇일까?",
            "answer": "파란색",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.answer == "파란색"


def test_parse_activity_response_accepts_long_form_single_color_without_false_positive():
    # "초록색"은 "초록"을 부분 문자열로 포함하므로, 단순 카운트라면 색깔 2개로 잘못 셀 수 있다
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "주체: 나뭇잎. 초록색이다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "나뭇잎의 색깔은 무엇일까?",
            "answer": "초록색",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.answer == "초록색"


def test_parse_activity_response_rejects_answer_that_is_verbatim_subtitle_line():
    # 정답이 자막 문장을 그대로 베낀 것이면, 이해/추론 없이도 맞힐 수 있는 퀴즈가 되어버린다
    seg = SubtitleSegment(text="전선 하나만 자르면 되는데.", start_sec=280.0, end_sec=284.0)
    candidate = CandidatePoint(timestamp_sec=284.0, context_segments=[seg])
    raw = json.dumps(
        {
            "scene_description": "회로기판에 여러 색깔의 전선이 연결되어 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "표현_이해하기",
            "question": "이 장면에서 무엇을 하고 있나요?",
            "answer": "전선 하나만 자르면 되는데.",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_answer_that_is_near_verbatim_subtitle_fragment():
    # 단어 한두 개만 빠진 채 거의 그대로 베낀 경우도 같은 문제이므로 함께 거부되어야 함
    seg = SubtitleSegment(text="내가 큰 소리로 불러볼게.", start_sec=145.0, end_sec=148.0)
    candidate = CandidatePoint(timestamp_sec=158.0, context_segments=[seg])
    raw = json.dumps(
        {
            "scene_description": "캐릭터가 입을 크게 벌리고 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "표현_이해하기",
            "question": "고고핑이 어떤 목소리를 내고 싶었을까?",
            "answer": "큰 소리로 불러볼게",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_emotion_answer_with_no_subtitle_evidence():
    # 감정 질문 자체를 막는 게 아니라, 화면만 보고 대충 찍은(자막 근거가 전혀 없는) 경우를 막는다
    candidate = make_candidate_with_context("안 되겠다. 안전한 곳으로 가자.")
    raw = json.dumps(
        {
            "scene_description": "주체: 걷고 있는 여성. 분홍색 상의를 입고 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "표현_이해하기",
            "question": "여성의 표정은 어떤 감정을 표현하고 있을까요?",
            "answer": "행복",
            "reason": "여성의 표정이 밝아 보인다.",
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_accepts_emotion_answer_grounded_in_subtitle():
    # reason이 자막 내용(대사·상황)을 실제로 근거로 삼고 있으면 감정 질문도 허용한다
    candidate = make_candidate_with_context("안 되겠다. 안전한 곳으로 가자.")
    raw = json.dumps(
        {
            "scene_description": "주체: 캐릭터. 걱정스러운 표정을 짓고 있다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "표현_이해하기",
            "question": "캐릭터는 지금 어떤 감정을 느끼고 있을까요?",
            "answer": "걱정",
            "reason": "자막에서 '안전한 곳으로 가자'라며 다급하게 말하고 있어 걱정스러운 감정임을 알 수 있다.",
        },
        ensure_ascii=False,
    )
    result = parse_activity_response(raw, candidate)
    assert result.answer == "걱정"


def test_parse_activity_response_rejects_missing_answer_when_suitable():
    candidate = make_candidate()
    raw = json.dumps(
        {
            "scene_description": "포도송이가 화면에 보인다.",
            "is_suitable": True,
            "score": 0.9,
            "activity_template": "색_찾기",
            "question": "q",
            "answer": None,
        },
        ensure_ascii=False,
    )
    with pytest.raises(ValueError):
        parse_activity_response(raw, candidate)


def test_parse_activity_response_rejects_malformed_json():
    candidate = make_candidate()
    with pytest.raises(ValueError):
        parse_activity_response("이건 JSON이 아님", candidate)


class FakeBackend:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = 0

    def generate(self, prompt, image_paths):
        self.calls += 1
        return self.responses.pop(0)


def test_generate_activity_returns_result_on_first_success():
    candidate = make_candidate()
    good = json.dumps(
        {
            "scene_description": "포도송이가 화면에 뚜렷하게 보인다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "포도의 색깔은?",
            "answer": "보라",
        },
        ensure_ascii=False,
    )
    backend = FakeBackend([good])

    result = generate_activity(
        candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물", "age_range": "3-4"}, backend=backend
    )

    assert result is not None
    assert result.activity_template == "색_찾기"
    assert backend.calls == 1


def test_generate_activity_retries_once_then_succeeds():
    candidate = make_candidate()
    good = json.dumps(
        {
            "scene_description": "포도송이가 화면에 뚜렷하게 보인다.",
            "is_suitable": True,
            "score": 0.8,
            "activity_template": "색_찾기",
            "question": "포도의 색깔은?",
            "answer": "보라",
        },
        ensure_ascii=False,
    )
    backend = FakeBackend(["이건 JSON이 아님", good])

    result = generate_activity(
        candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물", "age_range": "3-4"}, backend=backend
    )

    assert result is not None
    assert backend.calls == 2


def test_generate_activity_returns_none_after_retry_fails():
    candidate = make_candidate()
    backend = FakeBackend(["이건 JSON이 아님", "여전히 JSON이 아님"])

    result = generate_activity(
        candidate, frame_paths=["f1.jpg"], video_meta={"topic": "동물", "age_range": "3-4"}, backend=backend
    )

    assert result is None
    assert backend.calls == 2
