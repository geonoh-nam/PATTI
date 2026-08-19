"""안전 지점마다 쓸 수 있는 재료를 모으고, 그 재료로 활동 풀을 만든다.

모델을 호출하지 않는다. 재료는 이미 산출·검증된 것을 받는다.
"""

from dataclasses import dataclass

from activity_assembler import (
    Activity,
    make_antonym,
    make_cause_effect,
    make_color,
    make_compound,
    make_count,
    make_emotion,
    make_event_order,
    make_find_object,
    make_first_letter,
    make_mimetic,
    make_missing_letter,
    make_name,
    make_recall,
    make_same_initial,
    make_spelling,
    make_theme,
)
from activity_dictionaries import BANNED_WORDS
from scene_inventory import MergedScene, SceneInventory, merge_inventories
from schemas import ACTIVITY_CATEGORY, TIER_OF_TEMPLATE, SubtitleSegment
from story_material import StoryMaterial

# 모델이 정답을 정하는 활동. 검증에 실패하면 재호출로 고칠 수 있다(계획 B).
MODEL_DECIDED = {"이야기_핵심_주제", "원인과_결과"}


@dataclass
class PointMaterial:
    """안전 지점 하나가 쓸 수 있는 재료. 직전 지점 이후 자기까지 구간에서 모은다."""

    trigger_sec: float
    scene: MergedScene
    context_text: str


def assign_materials(
    safe_points: list[float],
    inventories: list[SceneInventory],
    segments: list[SubtitleSegment],
) -> list[PointMaterial]:
    """안전 지점마다 직전 지점 이후 구간의 화면 목록과 자막을 배정한다.

    재료가 없는 지점도 버리지 않는다 — 이야기 재료는 화면과 무관하게 붙을 수 있다.
    마지막 지점 이후의 재료는 어느 지점에도 배정되지 않는다(아이가 아직 보지 않은 내용이 아니라,
    물어볼 지점이 남아 있지 않다).
    """
    materials = []
    previous = 0.0
    for trigger in sorted(safe_points):
        span = [i for i in inventories if previous <= i.시각 < trigger]
        lines = [s.text for s in segments if previous <= s.start_sec < trigger]
        materials.append(
            PointMaterial(
                trigger_sec=trigger,
                scene=merge_inventories(span),
                context_text=" ".join(lines),
            )
        )
        previous = trigger
    return materials


@dataclass
class PooledActivity:
    """풀에 적재된 활동. 조립 결과에 지점·연령·상태가 붙은 것이다."""

    id: str
    trigger_sec: float
    age_tier: str
    category: str
    template: str
    question: str
    options: list[str] | None
    answer: str
    confidence: float
    evidence: str
    evidence_times: list[float]
    status: str = "ready"
    rejected_reason: str | None = None


def build_pool(points: list[PointMaterial], story: StoryMaterial) -> list[PooledActivity]:
    """전 지점에 조립기 16종을 전량 호출해 활동 풀을 만든다.

    티어를 미리 고르지 않는다 — 활동마다 age_tier 가 붙고 런타임이 아이 연령으로 고른다.
    """
    pool: list[PooledActivity] = []
    seen: set[tuple[str, str, float]] = set()
    for material in points:
        for activity in _assemble_one(material, points, story):
            key = (activity.template, activity.answer, material.trigger_sec)
            if key in seen:
                continue
            seen.add(key)
            pool.append(
                PooledActivity(
                    id=f"a{len(pool) + 1:02d}",
                    trigger_sec=material.trigger_sec,
                    age_tier=TIER_OF_TEMPLATE[activity.template],
                    category=ACTIVITY_CATEGORY[activity.template],
                    template=activity.template,
                    question=activity.question,
                    options=activity.options,
                    answer=activity.answer,
                    confidence=activity.confidence,
                    evidence=activity.evidence,
                    evidence_times=activity.evidence_times,
                )
            )
    return pool


def _assemble_one(
    material: PointMaterial, points: list[PointMaterial], story: StoryMaterial
) -> list[Activity]:
    """지점 하나의 활동을 전부 조립한다. 안전하지 않은 구간이면 하나도 만들지 않는다."""
    if not material.scene.안전함:
        return []
    scene, text, trigger = material.scene, material.context_text, material.trigger_sec
    외부_사물 = [
        s for other in points if other is not material for s in other.scene.주체들
    ]
    return [
        *make_color(scene),
        *make_count(scene),
        *make_name(scene),
        *make_find_object(scene, 외부_사물),
        *make_first_letter(scene),
        *make_same_initial(scene),
        *make_missing_letter(scene),
        *make_mimetic(scene, text),
        *make_antonym(text, trigger),
        *make_spelling(text, trigger),
        *make_compound(text, trigger),
        *make_event_order(story, trigger),
        *make_recall(story, trigger),
        *make_emotion(story, trigger),
        *make_theme(story, trigger),
        *make_cause_effect(story, trigger),
    ]


def judge_status(pool: list[PooledActivity]) -> list[PooledActivity]:
    """금칙어를 검사해 상태를 판정한다. 아무것도 버리지 않는다 — 사유를 남긴다.

    사실 일관성 검사는 없다. 코드 결정 활동은 정답이 구성상 유일하고,
    모델 결정 활동은 재료 파싱 단계에서 이미 검증됐다.
    """
    for activity in pool:
        hit = _banned_hit(activity)
        if hit is None:
            continue
        activity.status = "regenerate" if activity.template in MODEL_DECIDED else "review"
        activity.rejected_reason = f"금칙어 '{hit}' 이(가) 들어 있다"
    return pool


def _banned_hit(activity: PooledActivity) -> str | None:
    """활동이 아이에게 보여주는 모든 문자열에서 금칙어를 찾는다."""
    haystack = " ".join([activity.question, activity.answer, *(activity.options or [])])
    return next((word for word in BANNED_WORDS if word in haystack), None)


def build_output(
    video_id: str,
    source: dict,
    safe_points: list[float],
    pool: list[PooledActivity],
    target_count: int,
) -> dict:
    """설계 §6 출력 계약. 풀은 자르지 않고 전량 싣는다."""
    # scenario_builder 가 PooledActivity 를 쓰므로 여기서만 늦게 부른다(순환 import 회피).
    from scenario_builder import build_scenarios

    ready = [a for a in pool if a.status == "ready"]
    return {
        "video_id": video_id,
        "source": source,
        "safe_points": safe_points,
        "pool": [_serialize(a) for a in pool],
        "scenarios": build_scenarios(pool, target_count),
        "yield": {
            "safe_points": len(safe_points),
            "pool": len(pool),
            "ready": len(ready),
            "regenerate": sum(1 for a in pool if a.status == "regenerate"),
            "review": sum(1 for a in pool if a.status == "review"),
            # 활동 0개인 영상은 성공이 아니다 — 운영자 검토 대기열로 보낸다.
            "status": "ok" if ready else "review",
        },
    }


def _serialize(activity: PooledActivity) -> dict:
    return {
        "id": activity.id,
        "trigger_sec": activity.trigger_sec,
        "age_tier": activity.age_tier,
        "category": activity.category,
        "template": activity.template,
        "question": activity.question,
        "options": activity.options,
        "answer": activity.answer,
        "status": activity.status,
        "confidence": activity.confidence,
        "evidence": {
            "재료_시각": activity.evidence_times,
            "설명": activity.evidence,
            "검증": "코드 결정론" if activity.confidence >= 0.9 else "모델 판단",
        },
        "rejected_reason": activity.rejected_reason,
    }
