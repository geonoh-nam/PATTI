import difflib
import json
import re
from typing import Protocol

from schemas import ACTIVITY_TEMPLATES, AGE_DIFFICULTY_GUIDANCE, ActivityCandidate, CandidatePoint

QUOTE_PATTERN = re.compile(r"'([^']+)'")

# 소형 모델이 카탈로그에 없는 이름을 반복해서 지어내는 경우가 있는데, 철자 유사도로는 안 잡히는
# 의미상 별칭(예: "표정을 읽는 활동"을 "표정_찾기"/"표정_추론"이라 부름)을 직접 매핑한다.
TEMPLATE_ALIASES = {
    "표정_찾기": "표현_이해하기",
    "표정_추론": "표현_이해하기",
    "감정_찾기": "표현_이해하기",
}

COLOR_GROUPS = [
    ["빨간색", "빨강"],
    ["주황색", "주황"],
    ["노란색", "노랑"],
    ["초록색", "초록", "연두색"],
    ["파란색", "파랑", "남색"],
    ["보라색", "보라"],
    ["분홍색", "분홍"],
    ["하얀색", "하양", "흰색"],
    ["검은색", "검정색", "검정"],
    ["갈색"],
    ["회색"],
    ["금색", "황금색"],
    ["은색"],
]

PROMPT_TEMPLATE = """당신은 아동용 영상 학습 콘텐츠 기획자입니다.
아래는 영상의 한 장면 직전까지의 자막과 이 시점의 프레임 한 장입니다. 이 시점은 잠깐 멈춰서
아이에게 지금까지 본 내용에 대해 질문하기 좋은 지점으로 선정되었습니다(하나의 사건/대화가
막 끝난 직후라 되짚어 묻기 좋은 타이밍입니다). 제공된 프레임은 이미 선명한 프레임만 골라
전달된 것입니다.

영상 주제: {topic}
대상 연령: {age_range}세
자막 맥락: {context_text}

사용할 수 있는 활동 목록은 다음과 같습니다:
{template_catalog}

이 연령대({age_range}세)를 위한 난이도·적합성 지침: {difficulty_guidance}

정답은 대부분 객관적으로 검증 가능해야 합니다 — 색깔, 개수, 자막에 있는 단어, 사물 이름,
반대말처럼 누가 봐도 이견이 없는 정답만 만드세요. 이야기_되새기기·이야기_추론·원인_결과_연결·
맥락_대화_완성처럼 추론이 필요한 활동은 화면만 보고 짐작하지 말고, 반드시 화면과 자막을 함께
근거로 삼아 자막에 나온 대사·사건에서 정답을 찾으세요. 감정을 묻는 질문(표정 등)을 만들
때도 화면만 보고 추측하지 말고, 자막의 대사·상황이 그 감정을 뒷받침해야 합니다 — reason
필드에 그 감정을 뒷받침하는 자막의 구체적인 대사나 상황을 반드시 인용하거나 언급하세요.
자막에 그 감정을 뒷받침할 근거가 없다면 감정 질문 대신 다른 활동을 선택하세요.

무엇보다 먼저, scene_description을 두 부분으로 나누어 쓰세요.
(1) 이 프레임에서 가장 중심이 되는 주체 하나를 한 문장으로 못 박으세요 — 특정 인물/캐릭터인지,
특정 사물인지, 아니면 주체 없이 배경/장면전환만 보이는지. "주체: ..." 형식으로 시작하세요.
(2) 그다음, 그 주체에 대해서만 눈에 보이는 사실을 2~3문장으로 구체적으로 적으세요(표정·동작·
색깔·모양 등). 주체가 없다면 배경에 무엇이 보이는지만 적으세요.
자막 내용을 요약하거나 추측해서 채우지 말고, 오직 이미지 자체에서 눈으로 보이는 것만 적으세요.
이 설명을 먼저 쓴 다음에만 아래 판단으로 넘어가세요.

scene_description을 다 쓴 뒤, 목록을 위에서부터 순서대로 하나씩 확인하면서, "이 장면 설명(화면)과
자막 맥락을 함께 봤을 때, 이 활동의 구체적인 질문과 정답을 지금 바로 만들 수 있는가?"만
판단하세요. 화면에서 확인한 사실(scene_description)과 자막이 알려주는 맥락을 반드시 함께
결합해서 판단하세요 — 화면만 보고 판단하거나 자막만 보고 판단하면 안 됩니다. 정답은
scene_description에 실제로 적은 내용에 근거해야 하며, 화면에 없는 것을 자막만 보고 지어내면
안 됩니다. 카테고리가 이 장면과 잘 어울리는지가 아니라, 지금 당장 실제로 채울 수 있는 질문/
정답을 만들어낼 수 있는지가 기준입니다. 카메라가 움직이는지, 장면이 전환 중인지는 신경 쓰지
마세요. 만들 수 있는 첫 번째 활동을 선택하세요.

activity_template에는 반드시 위 목록에 있는 이름 중 하나를 정확히 그대로 쓰세요. 목록에 없는
새로운 이름을 만들어내면 안 됩니다. 목록에 있는 활동 중 어느 것도 지금 만들 수 없다면
is_suitable을 false로 하세요.

정답은 반드시 하나로만 정해져야 합니다. 화면에 색깔·사물이 여러 개 보인다면(예: 전선이
빨강·초록·파랑 여러 개), "그 중 하나는?"처럼 화면에 있는 색을 정답으로 하는 열린 질문을
만들지 마세요. 이럴 땐 "이 화면에 없는 색깔은 무엇일까요?"처럼 묻고, 화면에 있는 색을 전부
제외한 다른 색깔 이름을 정답으로 만드세요(예: 화면에 빨강·초록·파랑이 있다면 정답은 "노란색"
같은 화면에 없는 색). 이러면 화면에 있는 색이 몇 개든 정답이 항상 하나로 정해집니다. 정답도
"A색과 B색"처럼 두 개를 붙여서 쓰면 안 되고, 반드시 하나의 값만 쓰세요.

만들 수 있다면 activity_template에 위 목록의 이름을 정확히 그대로 적고, question에 아이에게 보여줄
구체적 질문/지시문을, answer에는 짧은 단어나 구(예: 색깔 이름, 사물 이름, 감정 단어, 카드 문구)를
반드시 채우세요(null이나 빈 문자열 금지).
2지선다형 템플릿이면 options에 카드 2개를 넣고, 단답형이면 options는 null로 두세요.
reason 필드에는 is_suitable을 그렇게 판단한 이유(적합/부적합 둘 다)를 한 문장으로 반드시 적으세요.

예시: {{"scene_description": "주체: 나무에 매달린 포도송이. 포도알은 짙은 보라색이고 화면 중앙에 뚜렷하게 보인다. 배경은 초록 잎사귀이며 사람은 보이지 않는다.", "is_suitable": true, "score": 0.8, "activity_template": "색_찾기", "question": "포도의 색깔은 무슨색일까?", "options": null, "answer": "보라", "reason": "포도가 화면에 뚜렷하게 보이고 색이 분명함"}}

다음 JSON 스키마로만 응답하세요:
{{
  "scene_description": string, "주체: ..."로 시작하는 주체 설명 + 그 주체에 대한 구체 묘사(필수, null 금지),
  "is_suitable": bool,
  "score": 0~1 사이 숫자,
  "activity_template": string, 위 목록에 있는 이름 중 하나(is_suitable이 true일 때만),
  "question": string, is_suitable이 true이면 반드시 구체적인 질문/지시문(null 금지),
  "options": string 리스트(2개) 또는 null,
  "answer": string, is_suitable이 true이면 반드시 정답(null 금지),
  "reason": string, 판단 이유(필수, null 금지)
}}
"""


class ModelBackend(Protocol):
    def generate(self, prompt: str, image_paths: list[str]) -> str: ...


def build_prompt(candidate: CandidatePoint, video_meta: dict) -> str:
    context_text = " ".join(seg.text for seg in candidate.context_segments)
    age_tier = video_meta.get("age_range", "")
    template_catalog = "\n".join(f"- {name}: {desc}" for name, desc in ACTIVITY_TEMPLATES.items())
    return PROMPT_TEMPLATE.format(
        topic=video_meta.get("topic", "미지정"),
        age_range=age_tier or "미지정",
        context_text=context_text,
        template_catalog=template_catalog,
        difficulty_guidance=AGE_DIFFICULTY_GUIDANCE.get(age_tier, "(연령 정보 없음, 무난한 난이도로 만드세요)"),
    )


def _closest_ngram_in_context(phrase: str, context_text: str, cutoff: float = 0.75) -> str | None:
    words = context_text.split()
    n = len(phrase.split())
    if n == 0 or n > len(words):
        return None
    candidates = [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]
    matches = difflib.get_close_matches(phrase, candidates, n=1, cutoff=cutoff)
    return matches[0] if matches else None


def _reason_grounded_in_subtitle(reason: str | None, context_text: str) -> bool:
    """감정 추론 등이 화면만 보고 대충 찍은 게 아니라 자막 내용을 실제로 근거로 삼았는지 확인.
    reason 문장 안에 자막에 등장하는 단어(2글자 이상)가 실제로 포함돼 있으면 근거가 있다고 본다."""
    if not reason:
        return False
    words = [w.strip(".,!?~'\"") for w in context_text.split()]
    return any(len(w) >= 2 and w in reason for w in words)


def _ground_quoted_references(question: str, answer: str | None, context_text: str) -> tuple[str, str | None]:
    """질문에 '...'로 인용된 문구가 실제 자막과 한두 글자 다르면(소형 모델의 오탈자성 할루시네이션)
    자막에서 가장 가까운 표현으로 교정한다. 자막 어디에도 근거가 없는 인용은 reject한다."""
    for quoted in QUOTE_PATTERN.findall(question):
        match = _closest_ngram_in_context(quoted, context_text)
        if match is None:
            raise ValueError(f"자막에 근거 없는 인용: '{quoted}'")
        if match != quoted:
            question = question.replace(quoted, match)
            if answer:
                answer = answer.replace(quoted, match)
    return question, answer


def parse_activity_response(raw_json: str, candidate: CandidatePoint) -> ActivityCandidate:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"활동 응답이 JSON이 아닙니다: {exc}") from exc

    if "is_suitable" not in data or "score" not in data:
        raise ValueError("필수 필드(is_suitable, score)가 없습니다")

    scene_description = data.get("scene_description")
    if not scene_description:
        # 화면 그라운딩을 강제하기 위한 필드 — is_suitable 값과 무관하게 항상 요구한다
        raise ValueError("scene_description이 없습니다(화면 설명을 먼저 채워야 합니다)")

    is_suitable = bool(data["is_suitable"])
    score = float(data["score"])
    activity_template = data.get("activity_template")
    question = data.get("question")
    answer = data.get("answer")

    if is_suitable:
        if activity_template not in ACTIVITY_TEMPLATES:
            if activity_template in TEMPLATE_ALIASES:
                activity_template = TEMPLATE_ALIASES[activity_template]
            else:
                # 소형 모델이 템플릿 이름을 한두 글자 틀리게 반환하는 경우가 있어(예: "이야기_되새기" vs
                # "이야기_되새기기"), 정확히 일치하지 않으면 유사도로 가장 가까운 템플릿에 스냅한다.
                close = difflib.get_close_matches(activity_template or "", ACTIVITY_TEMPLATES.keys(), n=1, cutoff=0.75)
                if not close:
                    raise ValueError(f"허용되지 않은 활동 템플릿: {activity_template}")
                activity_template = close[0]
        if not question:
            raise ValueError("is_suitable=true인데 question이 없습니다")
        if not answer:
            raise ValueError("is_suitable=true인데 answer가 없습니다")
        matched_color_groups = sum(1 for group in COLOR_GROUPS if any(word in answer for word in group))
        if matched_color_groups >= 2:
            # "파란색과 흰색"처럼 서로 다른 색깔 두 개를 붙여서 답하면 정답이 하나로 떨어지지 않는다
            raise ValueError("answer에 색깔이 두 개 이상 섞여 있어 정답이 하나로 정해지지 않습니다")
        if activity_template == "색_찾기":
            scene_color_groups = [g for g in COLOR_GROUPS if any(word in scene_description for word in g)]
            if len(scene_color_groups) >= 2:
                # 화면에 색깔이 여러 개 보이는데 그중 하나를 정답으로 하면 정답이 여러 개
                # 가능해진다. 화면에 없는 색깔 이름을 정답으로 만들면(예: "이 화면에 없는
                # 색깔은?" → "노란색") 어떤 색을 고르든 모호했던 문제가 사라진다.
                if any(any(word in answer for word in g) for g in scene_color_groups):
                    raise ValueError("화면에 색깔이 여러 개인데 answer가 화면에 있는 색이라 정답이 하나로 정해지지 않습니다")
        if "감정" in question:
            context_text_for_check = " ".join(seg.text for seg in candidate.context_segments)
            if not _reason_grounded_in_subtitle(data.get("reason"), context_text_for_check):
                # 감정 질문 자체를 막는 게 아니라, 화면만 보고 대충 찍은(자막 근거가 전혀
                # 없는) 경우를 막는다. reason이 자막 내용을 실제로 근거로 삼았는지 확인한다.
                raise ValueError("감정 추론인데 reason이 자막 내용을 근거로 삼지 않은 것으로 보입니다")
        if question.strip() == answer.strip():
            # 모델이 자막 원문을 question과 answer에 그대로 복사해 넣는 퇴화된 응답을 방지
            raise ValueError("question과 answer가 동일합니다(무의미한 응답)")
        for seg in candidate.context_segments:
            if difflib.SequenceMatcher(None, answer.strip(), seg.text.strip()).ratio() > 0.8:
                # 정답이 자막 문장을 그대로(혹은 한두 글자만 빼고) 베낀 경우, 이해·추론 없이
                # 자막만 기억해도 맞힐 수 있는 퀴즈가 되어버리므로 거부한다.
                raise ValueError("answer가 자막 문장을 그대로 베낀 것으로 보입니다")
        context_text = " ".join(seg.text for seg in candidate.context_segments)
        question, answer = _ground_quoted_references(question, answer, context_text)
    else:
        activity_template = None

    context = candidate.context_segments
    source_range = (context[0].start_sec, context[-1].end_sec) if context else (
        candidate.timestamp_sec,
        candidate.timestamp_sec,
    )

    return ActivityCandidate(
        is_suitable=is_suitable,
        score=score,
        timestamp_sec=candidate.timestamp_sec,
        source_subtitle_range=source_range,
        activity_template=activity_template if is_suitable else None,
        question=question if is_suitable else None,
        options=data.get("options") if is_suitable else None,
        answer=answer if is_suitable else None,
        reason=data.get("reason"),
        scene_description=scene_description,
    )


def generate_activity(
    candidate: CandidatePoint,
    frame_paths: list[str],
    video_meta: dict,
    backend: ModelBackend,
) -> ActivityCandidate | None:
    prompt = build_prompt(candidate, video_meta)

    for _attempt in range(2):
        raw = backend.generate(prompt, frame_paths)
        try:
            return parse_activity_response(raw, candidate)
        except ValueError:
            continue

    return None


class MlxVlmBackend:
    """mlx-vlm을 이용한 로컬 Qwen2.5-VL 백엔드. Mac(Apple Silicon)에서 실행.

    NVIDIA GPU로 전환 시 이 클래스만 transformers/vLLM 기반 구현으로 교체하면 된다.
    """

    def __init__(self, model_id: str = "mlx-community/Qwen2.5-VL-7B-Instruct-4bit"):
        self.model_id = model_id
        self._model = None
        self._processor = None

    def _load(self):
        from mlx_vlm import load

        self._model, self._processor = load(self.model_id)

    def generate(self, prompt: str, image_paths: list[str]) -> str:
        from mlx_vlm import generate as mlx_generate
        from mlx_vlm.prompt_utils import apply_chat_template

        if self._model is None:
            self._load()

        formatted_prompt = apply_chat_template(self._processor, self._model.config, prompt, num_images=len(image_paths))
        result = mlx_generate(
            self._model, self._processor, formatted_prompt, image_paths, verbose=False, max_tokens=2048
        )
        return result.text if hasattr(result, "text") else str(result)
