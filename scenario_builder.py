"""활동 풀에서 연령별 기본 시나리오를 뽑는다.

순수 함수다. 풀은 자르지 않는다 — target_count 는 시나리오 길이만 정한다.
런타임의 활동 선택(정답률·건너뛰기 기록 반영)은 이 모듈의 범위가 아니다.
"""

import math

from pool_builder import PooledActivity
from schemas import TEMPLATES_BY_AGE_TIER


def build_scenarios(pool: list[PooledActivity], target_count: int) -> dict[str, list[str]]:
    """티어마다 기본 시나리오 하나씩. 값은 활동 id 목록이다."""
    return {tier: _pick(pool, tier, target_count) for tier in TEMPLATES_BY_AGE_TIER}


def _pick(pool: list[PooledActivity], tier: str, target_count: int) -> list[str]:
    """같은 활동이 연속하지 않게, 범주가 한쪽으로 쏠리지 않게 고른다."""
    candidates = sorted(
        (a for a in pool if a.age_tier == tier and a.status == "ready"),
        key=lambda a: a.trigger_sec,
    )
    cap = max(1, math.ceil(target_count / 3))
    picked: list[PooledActivity] = []
    used: dict[str, int] = {}

    def take(activity: PooledActivity, respect_cap: bool) -> bool:
        if len(picked) >= target_count or activity in picked:
            return False
        if picked and picked[-1].template == activity.template:
            return False
        if respect_cap and used.get(activity.category, 0) >= cap:
            return False
        picked.append(activity)
        used[activity.category] = used.get(activity.category, 0) + 1
        return True

    for activity in candidates:  # 1차: 범주 상한을 지킨다
        take(activity, respect_cap=True)
    for activity in candidates:  # 2차: 못 채웠으면 상한 없이 채운다
        take(activity, respect_cap=False)
    picked.sort(key=lambda a: a.trigger_sec)
    return [a.id for a in picked]
