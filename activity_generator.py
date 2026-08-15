import json
from typing import Protocol

from schemas import ACTIVITY_TYPES, DIFFICULTIES, ActivityCandidate, CandidatePoint

PROMPT_TEMPLATE = """당신은 아동용 영상 학습 콘텐츠 기획자입니다.
아래는 영상의 한 장면 직전까지의 자막과 정지 시점 프레임입니다. 이 시점은 이미 하나의 사건/대화가 자연스럽게 마무리되는 지점으로 선정되었습니다.

영상 주제: {topic}
대상 연령: {age_range}
자막 맥락: {context_text}

제공된 프레임은 이 지점 1초 전, 정확히 이 지점, 1초 후 시점을 순서대로 캡처한 것입니다.
세 프레임을 비교하되, 입 움직임·눈 깜빡임·손짓 같은 애니메이션 캐릭터의 미세한 동작은
정상적인 정지 장면으로 간주하고 무시하세요. is_suitable을 false로 할 정도의 "이어짐"은
카메라가 패닝/줌 중이거나, 인물이 화면을 가로질러 크게 이동 중이거나, 장면 자체가 전환(컷) 중인
경우만 해당합니다. 애매하면 is_suitable을 true로 판단하세요.

이 장면의 분위기에 맞는 활동 유형을 고르세요.
- 장면이 긴박하거나 극적이면 "선택"(다음 전개를 예측하거나 고르게 하는 질문)
- 장면이 차분하거나 관찰할 거리가 있으면 "관찰" 또는 "움직임"
- 대사나 표현을 다시 말해보게 하려면 "언어"
- 영상이 끝나가는 지점이면 "마무리"

이미지가 흐릿하거나 장면 전환 중이라 활동을 만들기 기술적으로 어려운 경우에도 is_suitable을 false로 하세요.

is_suitable이 true이면 question 필드에 아이에게 실제로 보여줄 구체적인 질문 문장을 반드시 채우세요(null이나 빈 문자열 금지).
reason 필드에는 is_suitable을 그렇게 판단한 이유(적합/부적합 둘 다)를 한 문장으로 반드시 적으세요.
예시: {{"is_suitable": true, "score": 0.8, "type": "관찰", "question": "방금 본 고래는 어떤 색이었을까?", "options": null, "answer": null, "difficulty": "easy", "reason": "인물이 정지된 자세이고 대사도 끝나서 활동을 넣기 좋은 지점"}}

다음 JSON 스키마로만 응답하세요:
{{
  "is_suitable": bool,
  "score": 0~1 사이 숫자,
  "type": "관찰" | "선택" | "움직임" | "언어" | "마무리" (is_suitable이 true일 때만),
  "question": string, is_suitable이 true이면 반드시 구체적인 질문 문장(null 금지),
  "options": string 리스트 또는 null,
  "answer": string 또는 null,
  "difficulty": "easy" | "medium" | "hard" (is_suitable이 true일 때만),
  "reason": string, 판단 이유(필수, null 금지)
}}
"""


class ModelBackend(Protocol):
    def generate(self, prompt: str, image_paths: list[str]) -> str: ...


def build_prompt(candidate: CandidatePoint, video_meta: dict) -> str:
    context_text = " ".join(seg.text for seg in candidate.context_segments)
    return PROMPT_TEMPLATE.format(
        topic=video_meta.get("topic", "미지정"),
        age_range=video_meta.get("age_range", "미지정"),
        context_text=context_text,
    )


def parse_activity_response(raw_json: str, candidate: CandidatePoint) -> ActivityCandidate:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"활동 응답이 JSON이 아닙니다: {exc}") from exc

    if "is_suitable" not in data or "score" not in data:
        raise ValueError("필수 필드(is_suitable, score)가 없습니다")

    is_suitable = bool(data["is_suitable"])
    score = float(data["score"])

    activity_type = data.get("type")
    difficulty = data.get("difficulty")

    if is_suitable:
        if activity_type not in ACTIVITY_TYPES:
            raise ValueError(f"허용되지 않은 활동 유형: {activity_type}")
        if difficulty is not None and difficulty not in DIFFICULTIES:
            raise ValueError(f"허용되지 않은 난이도: {difficulty}")
        if not data.get("question"):
            raise ValueError("is_suitable=true인데 question이 없습니다")
    else:
        activity_type = None

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
        type=activity_type if is_suitable else None,
        question=data.get("question") if is_suitable else None,
        options=data.get("options") if is_suitable else None,
        answer=data.get("answer") if is_suitable else None,
        difficulty=difficulty if is_suitable else None,
        reason=data.get("reason"),
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
        result = mlx_generate(self._model, self._processor, formatted_prompt, image_paths, verbose=False)
        return result.text if hasattr(result, "text") else str(result)
