"""안전 지점 탐지 — 아이의 시청을 방해하지 않고 끊을 수 있는 지점을 신호로 계산한다.

기획서 §4.1-2("장면 전환, 침묵 구간, 대화 종료 지점을 찾는다")를 모델 호출 없이 구현한다.
판정 기준은 "여기서 문제를 만들 수 있는가"가 아니라 "여기서 끊어도 방해가 되지 않는가"다.
"""

SENTENCE_END_PUNCTUATION = (".", "!", "?", "…")
# 한국어 종결어미의 마지막 음절. 자막이 이미 문장 단위로 끊겨 있어 대부분 통과하므로
# 변별 신호가 아니라 필요조건으로만 쓴다(실측: 47줄 중 45줄 통과).
SENTENCE_END_SYLLABLES = ("다", "야", "어", "아", "지", "까", "네", "요", "자", "군", "걸", "래", "죠")


def is_sentence_closed(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    if stripped.endswith(SENTENCE_END_PUNCTUATION):
        return True
    words = stripped.rstrip(".,!?~… ").split()
    return bool(words) and words[-1].endswith(SENTENCE_END_SYLLABLES)
