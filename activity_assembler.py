"""재료에서 활동을 조립한다 — 질문·보기·정답을 전부 코드가 만든다.

모델은 재료만 산출했고 여기 관여하지 않는다. 따라서 정답이 구성상 유일하며
사실 일관성 검증이 필요 없다. 재료가 없으면 빈 리스트를 돌려주고 추측하지 않는다.
"""

from typing import NamedTuple

from activity_dictionaries import COLOR_PALETTE
from scene_inventory import MergedScene

SCENE_CONFIDENCE = 0.9   # 질문 생성은 결정론이나 비전 인식 자체는 틀릴 수 있다


class Activity(NamedTuple):
    template: str
    question: str
    options: list[str] | None
    answer: str
    evidence: str
    evidence_times: list[float]
    confidence: float


def make_color(merged: MergedScene) -> list[Activity]:
    """화면에 '없는' 색을 묻는다. 화면의 색이 몇 개든 정답이 하나로 정해진다."""
    if not merged.보이는_색:
        return []
    absent = [c for c in COLOR_PALETTE if c not in merged.보이는_색]
    if not absent:
        return []

    answer = absent[0]
    return [Activity(
        template="색_찾기",
        question="이 화면에 없는 색깔은 무엇일까요?",
        options=[answer, merged.보이는_색[0]],
        answer=answer,
        evidence=f"화면의 색 {merged.보이는_색}을 팔레트에서 빼고 남은 색을 정답으로 했다",
        evidence_times=list(merged.재료_시각),
        confidence=SCENE_CONFIDENCE,
    )]


def make_count(merged: MergedScene) -> list[Activity]:
    activities = []
    for name, count in merged.셀_수_있는_것:
        wrong = count + 1 if count < 5 else count - 1
        activities.append(Activity(
            template="수량_확인",
            question=f"{name}은(는) 모두 몇 개인가요?",
            options=[f"{count}개", f"{wrong}개"],
            answer=f"{count}개",
            evidence=f"화면 목록이 보고한 '{name}' {count}개를 그대로 썼다",
            evidence_times=list(merged.재료_시각),
            confidence=SCENE_CONFIDENCE,
        ))
    return activities


def make_name(merged: MergedScene) -> list[Activity]:
    if not merged.다른_사물:
        return []
    distractor = merged.다른_사물[0]
    return [Activity(
        template="그림과_낱말_연결",
        question="그림에 알맞은 낱말을 골라보세요.",
        options=[subject, distractor],
        answer=subject,
        evidence=f"화면의 주체 '{subject}'와 다른 사물 '{distractor}'로 2지선다를 만들었다",
        evidence_times=list(merged.재료_시각),
        confidence=SCENE_CONFIDENCE,
    ) for subject in merged.주체들]


def make_find_object(merged: MergedScene, 외부_사물: list[str]) -> list[Activity]:
    """화면에 실제로 있던 것을 고르게 한다. 오답은 이 화면에 '없는' 사물이어야 한다."""
    on_screen = set(merged.주체들) | set(merged.다른_사물)
    absent = [o for o in 외부_사물 if o not in on_screen]
    if not absent:
        return []

    distractor = absent[0]
    return [Activity(
        template="그림_속_대상_찾기",
        question="방금 본 그림에 있던 것을 골라보세요.",
        options=[subject, distractor],
        answer=subject,
        evidence=f"화면에 있던 '{subject}'와 화면에 없던 '{distractor}'로 2지선다를 만들었다",
        evidence_times=list(merged.재료_시각),
        confidence=SCENE_CONFIDENCE,
    ) for subject in merged.주체들]
