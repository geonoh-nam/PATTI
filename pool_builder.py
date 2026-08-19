"""안전 지점마다 쓸 수 있는 재료를 모으고, 그 재료로 활동 풀을 만든다.

모델을 호출하지 않는다. 재료는 이미 산출·검증된 것을 받는다.
"""

from dataclasses import dataclass

from scene_inventory import MergedScene, SceneInventory, merge_inventories
from schemas import SubtitleSegment


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
