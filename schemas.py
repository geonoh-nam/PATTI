from dataclasses import dataclass


@dataclass
class SubtitleSegment:
    text: str
    start_sec: float
    end_sec: float


@dataclass
class CandidatePoint:
    timestamp_sec: float
    context_segments: list[SubtitleSegment]
    reason: str | None = None


@dataclass
class ActivityCandidate:
    is_suitable: bool
    score: float
    timestamp_sec: float
    source_subtitle_range: tuple[float, float]
    activity_template: str | None = None
    question: str | None = None
    options: list[str] | None = None
    answer: str | None = None
    reason: str | None = None
    scene_description: str | None = None


ACTIVITY_TEMPLATES = {
    "사물_첫글자_찾기": "화면에 보이는 사물의 이름에서 첫 글자를 찾는다",
    "글자_들어간_단어_찾기": "특정 글자가 들어간 단어를 화면/자막에서 찾는다",
    "색_찾기": "화면에 보이는 사물의 색깔을 맞춘다",
    "수량_확인": "화면에 보이는 사물의 개수를 센다",
    "이야기_되새기기": "직전 자막 내용 중 인물이 하려던 행동을 다시 떠올린다",
    "표현_이해하기": "자막에 실제로 등장하는 의성어·의태어(예: 쿵쿵, 두근두근, 방긋)가 가리키는 동작/모습을 고른다. 자막에 그런 표현이 없다면 이 활동은 쓸 수 없다",
    "그림_단어_고르기": "화면에 보이는 대상의 이름을 고른다",
    "이야기_추론": "직전 내용을 근거로 등장인물의 행동 이유를 2지선다로 추론한다",
    "맥락_대화_완성": "직전 대화의 흐름에 맞는 다음 대답을 완성한다",
    "반대말_찾기": "자막에 나온 단어의 반대말을 찾는다",
    "올바른_낱말_찾기": "맞춤법이 올바른 단어를 고른다",
    "단어_합성": "화면/자막의 두 단어를 합쳐 새 단어를 만든다",
    "핵심_주제_찾기": "이 장면이 전달하는 핵심 주제를 고른다",
    "원인_결과_연결": "직전에 일어난 사건의 직접적인 원인을 고른다",
}

AGE_DIFFICULTY_GUIDANCE = {
    "3-4": (
        "이 연령대는 아직 글을 읽거나 문장을 곱씹어 추론하기 어렵습니다. 색·개수·글자처럼 눈에 "
        "보이는 것을 직접 확인하는 활동을 우선 고르세요. 이야기 추론·반대말·맞춤법·단어 합성처럼 "
        "문장을 곱씹어야 하는 활동은 내용이 아주 명확할 때만 사용하세요. 정답은 한 단어로, 최대한 "
        "쉬운 말로 만드세요."
    ),
    "5-6": (
        "이 연령대는 짧은 이야기를 기억하고 간단한 이유를 추론할 수 있습니다. 이야기 되새기기· "
        "표현 이해하기·그림 단어 고르기·이야기 추론을 우선 고르세요. 맞춤법·단어 합성처럼 아직 "
        "이른 활동은 피하세요. 색·개수는 다른 활동을 만들기 어려울 때 포기하지 말고 확실하게 채울 "
        "수 있는 대안으로 적극 활용하세요 — 화면에 사물이 보이면 언제든 만들 수 있습니다. 이야기 "
        "추론은 2지선다로 만들고 보기 차이를 뚜렷하게 하세요."
    ),
    "7": (
        "이 연령대는 문장을 읽고 스스로 판단할 수 있습니다. 반대말·맞춤법·단어 합성·핵심 주제· "
        "원인과 결과·맥락에 맞는 대화 완성처럼 더 추상적인 활동을 우선 고르세요. 색·개수는 다른 "
        "활동을 만들기 어려울 때 포기하지 말고 확실하게 채울 수 있는 대안으로 적극 활용하세요 — "
        "화면에 사물이 보이면 언제든 만들 수 있습니다."
    ),
}
