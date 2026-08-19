"""비전 호출의 유일한 산출물 — 화면에 무엇이 있는지만 담는다.

질문도 정답도 여기 없다. 모델의 모든 선택은 고정 목록 안에서 이루어지며,
목록 밖 값과 자막에 근거 없는 값은 이 모듈이 버린다.
"""

import json
from dataclasses import dataclass, field

from activity_dictionaries import COLOR_PALETTE, MIMETIC_WORDS

MIN_COUNT = 1
MAX_COUNT = 5


@dataclass
class SceneInventory:
    시각: float
    주체: str
    보이는_색: list[str] = field(default_factory=list)
    셀_수_있는_것: list[tuple[str, int]] = field(default_factory=list)
    다른_사물: list[str] = field(default_factory=list)
    흉내말: tuple[str, str] | None = None   # (단어, 자막 속 꾸미는 말)
    안전_플래그: list[str] = field(default_factory=list)


def _clean_mimetic(entry, context_text: str) -> tuple[str, str] | None:
    """고정 목록·범주 일치·자막 근거 셋을 모두 만족할 때만 살린다."""
    if not isinstance(entry, dict):
        return None
    word = entry.get("단어")
    category = entry.get("범주")
    modifies = entry.get("꾸미는_말")
    if word not in MIMETIC_WORDS:
        return None
    if MIMETIC_WORDS[word][1] != category:
        return None
    if not modifies or modifies not in context_text:
        # 자막에 없는 말을 꾸민다고 하면 빈칸을 뚫을 자리가 없다
        return None
    return (word, modifies)


def _clean_counts(entries) -> list[tuple[str, int]]:
    cleaned = []
    for entry in entries or []:
        if not isinstance(entry, dict):
            continue
        name = entry.get("이름")
        count = entry.get("개수")
        if not name or not isinstance(count, int):
            continue
        if MIN_COUNT <= count <= MAX_COUNT:
            cleaned.append((name, count))
    return cleaned


def parse_scene_inventory(raw_json: str, 시각: float, context_text: str) -> SceneInventory:
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as exc:
        raise ValueError(f"화면 목록 응답이 JSON이 아닙니다: {exc}") from exc

    subject = data.get("주체")
    if not subject:
        raise ValueError("주체가 없습니다")

    return SceneInventory(
        시각=시각,
        주체=subject,
        보이는_색=[c for c in data.get("보이는_색") or [] if c in COLOR_PALETTE],
        셀_수_있는_것=_clean_counts(data.get("셀_수_있는_것")),
        다른_사물=[o for o in data.get("다른_사물") or [] if o],
        흉내말=_clean_mimetic(data.get("흉내말"), context_text),
        안전_플래그=[f for f in data.get("안전_플래그") or [] if f],
    )
