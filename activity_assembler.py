"""재료에서 활동을 조립한다 — 질문·보기·정답을 전부 코드가 만든다.

모델은 재료만 산출했고 여기 관여하지 않는다. 따라서 정답이 구성상 유일하며
사실 일관성 검증이 필요 없다. 재료가 없으면 빈 리스트를 돌려주고 추측하지 않는다.
"""

from typing import NamedTuple

from activity_dictionaries import (
    ANTONYMS,
    COLOR_PALETTE,
    COMPOUND_WORDS,
    VOWEL_CONFUSIONS,
    find_antonym_source,
    find_compound,
    pick_distractor_emotion,
    pick_distractor_mimetic,
)
from scene_inventory import MergedScene
from story_material import StoryMaterial

SCENE_CONFIDENCE = 0.9   # 질문 생성은 결정론이나 비전 인식 자체는 틀릴 수 있다
TEXT_CONFIDENCE = 1.0    # 자막과 사전만 쓰므로 인식 오차가 없다
MODEL_CONFIDENCE = 0.7   # 모델이 정답을 정하는 활동
ORDER_LABELS = ["ㄱ", "ㄴ", "ㄷ"]
THEME_MIN_EVENT_RATIO = 0.6   # 사건의 이만큼이 지나야 주제를 물을 수 있다


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


_HANGUL_BASE = 0xAC00
_INITIALS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"


def initial_of(syllable: str) -> str | None:
    """한글 음절의 초성. 한글이 아니면 None."""
    code = ord(syllable) - _HANGUL_BASE
    return _INITIALS[code // 588] if 0 <= code < 11172 else None


def make_first_letter(merged: MergedScene) -> list[Activity]:
    return [Activity(
        template="사물_첫글자_찾기",
        question=f"'{subject}'의 첫 글자는 무엇일까요?",
        options=[subject[0], subject[-1]],
        answer=subject[0],
        evidence=f"화면의 주체 '{subject}'의 첫 음절을 정답으로 했다",
        evidence_times=list(merged.재료_시각),
        confidence=SCENE_CONFIDENCE,
    ) for subject in merged.주체들 if len(subject) >= 2]


def make_same_initial(merged: MergedScene) -> list[Activity]:
    """특정 초성으로 시작하는 사물을 고른다. 오답은 초성이 다른 사물이어야 한다."""
    activities = []
    for subject in merged.주체들:
        target = initial_of(subject[0])
        if target is None:
            continue
        distractors = [
            o for o in merged.다른_사물 if initial_of(o[0]) not in (None, target)
        ]
        if not distractors:
            continue
        activities.append(Activity(
            template="같은_글자로_시작하는_낱말",
            question=f"'{target}'으로 시작하는 것을 골라보세요.",
            options=[subject, distractors[0]],
            answer=subject,
            evidence=f"'{subject}'의 초성 {target}과 다른 초성의 '{distractors[0]}'로 2지선다를 만들었다",
            evidence_times=list(merged.재료_시각),
            confidence=SCENE_CONFIDENCE,
        ))
    return activities


def make_missing_letter(merged: MergedScene) -> list[Activity]:
    """이름의 두 번째 글자를 가린다. 3음절 이상이어야 앞뒤 단서가 남는다."""
    activities = []
    for subject in merged.주체들:
        if len(subject) < 3:
            continue
        answer = subject[1]
        blanked = subject[0] + "□" + subject[2:]
        activities.append(Activity(
            template="빠진_글자_완성",
            question=f"{blanked}의 빈칸에 들어갈 글자를 골라보세요.",
            options=[answer, subject[0]],
            answer=answer,
            evidence=f"화면의 주체 '{subject}'의 두 번째 글자를 가렸다",
            evidence_times=list(merged.재료_시각),
            confidence=SCENE_CONFIDENCE,
        ))
    return activities


def make_mimetic(merged: MergedScene, context_text: str) -> list[Activity]:
    """장면의 움직임에 맞는 흉내 내는 말을 고르게 한다.

    자막에 의성어가 없어도 만들어진다. 모델은 고정 목록에서 단어를 고르고 자막 속 꾸밈 대상을
    인용했을 뿐이며(scene_inventory가 검증), 빈칸 위치와 오답은 코드가 정한다.
    """
    activities = []
    for word, modifies in merged.흉내말들:
        if modifies not in context_text:
            continue
        blanked = context_text.replace(modifies, "____ " + modifies, 1)
        activities.append(Activity(
            template="흉내_내는_말_이해",
            question=f"빈칸에 알맞은 말을 골라보세요.\n{blanked}",
            options=[word, pick_distractor_mimetic(word)],
            answer=word,
            evidence=f"화면의 움직임에 맞는 '{word}'를 자막의 '{modifies}' 앞에 넣었다",
            evidence_times=list(merged.재료_시각),
            confidence=SCENE_CONFIDENCE,
        ))
    return activities


_MEDIALS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"


def _swap_medial(syllable: str, source: str, target: str) -> str | None:
    """음절의 중성이 source면 target으로 바꾼 음절을 돌려준다. 아니면 None."""
    code = ord(syllable) - _HANGUL_BASE
    if not 0 <= code < 11172:
        return None
    initial, remainder = divmod(code, 588)
    medial, final = divmod(remainder, 28)
    if _MEDIALS[medial] != source or target not in _MEDIALS:
        return None
    return chr(_HANGUL_BASE + initial * 588 + _MEDIALS.index(target) * 28 + final)


def _corrupt_spelling(word: str) -> str | None:
    """혼동 모음 하나를 바꿔 틀린 표기를 만든다. 바꿀 자리가 없으면 None."""
    for index, syllable in enumerate(word):
        for source, target in VOWEL_CONFUSIONS:
            swapped = _swap_medial(syllable, source, target)
            if swapped is not None:
                return word[:index] + swapped + word[index + 1 :]
    return None


def make_antonym(context_text: str, 시각: float) -> list[Activity]:
    word = find_antonym_source(context_text)
    if word is None:
        return []
    answer = ANTONYMS[word]
    return [Activity(
        template="반대말_찾기",
        question=f"'{word}'와 반대되는 말을 골라보세요.",
        options=[answer, word],
        answer=answer,
        evidence=f"자막에 등장한 '{word}'의 반대말을 사전에서 찾았다",
        evidence_times=[시각],
        confidence=TEXT_CONFIDENCE,
    )]


def make_spelling(context_text: str, 시각: float) -> list[Activity]:
    for token in context_text.split():
        cleaned = token.strip(".,!?~… '\"")
        if len(cleaned) < 2:
            continue
        wrong = _corrupt_spelling(cleaned)
        if wrong is None:
            continue
        return [Activity(
            template="올바른_낱말_찾기",
            question="바르게 쓴 낱말을 골라보세요.",
            options=[cleaned, wrong],
            answer=cleaned,
            evidence=f"자막의 '{cleaned}'에서 혼동 모음을 바꿔 오답 '{wrong}'을 만들었다",
            evidence_times=[시각],
            confidence=TEXT_CONFIDENCE,
        )]
    return []


def make_compound(context_text: str, 시각: float) -> list[Activity]:
    whole = find_compound(context_text)
    if whole is None:
        return []
    left, right = COMPOUND_WORDS[whole]
    return [Activity(
        template="두_낱말_합치기",
        question=f"'{left}'과(와) '{right}'을(를) 합치면 어떤 낱말이 될까요?",
        options=[whole, right + left],
        answer=whole,
        evidence=f"자막에 등장한 합성어 '{whole}'을 두 낱말로 나눴다",
        evidence_times=[시각],
        confidence=TEXT_CONFIDENCE,
    )]


def make_event_order(story: StoryMaterial, trigger_sec: float) -> list[Activity]:
    """사건 3개를 순서대로 놓게 한다. 정답은 자막 타임스탬프가 정하므로 코드가 안다."""
    past = sorted([e for e in story.사건 if e.시각 < trigger_sec], key=lambda e: e.시각)
    if len(past) < 3:
        return []

    chosen = past[-3:]
    # 제시 순서를 한 칸 회전시킨다 — 결정론이면서 정답이 자명해지지 않는다
    shown = [chosen[1], chosen[2], chosen[0]]
    label_of = {id(event): ORDER_LABELS[i] for i, event in enumerate(shown)}

    lines = "\n".join(f"{label_of[id(e)]}. {e.요약}" for e in shown)
    answer = " → ".join(label_of[id(e)] for e in chosen)
    return [Activity(
        template="사건의_순서_파악",
        question=f"다음 일을 일어난 순서대로 놓아보세요.\n{lines}",
        options=None,
        answer=answer,
        evidence=f"자막 시각 {[e.시각 for e in chosen]} 순서를 정답으로 했다",
        evidence_times=[e.시각 for e in chosen],
        confidence=TEXT_CONFIDENCE,
    )]


def make_recall(story: StoryMaterial, trigger_sec: float) -> list[Activity]:
    return [Activity(
        template="이야기_되새기기",
        question=f"이야기에서 {intent.인물}은(는) 무엇을 하려고 했나요?",
        options=[intent.하려던_행동, intent.다른_행동],
        answer=intent.하려던_행동,
        evidence=f"{intent.시각}초 자막에서 인물의 의도를 뽑았다",
        evidence_times=[intent.시각],
        confidence=TEXT_CONFIDENCE,
    ) for intent in story.인물_의도 if intent.시각 < trigger_sec]


def make_emotion(story: StoryMaterial, trigger_sec: float) -> list[Activity]:
    return [Activity(
        template="감정_추론",
        question=f"{cue.근거_자막} {cue.인물}의 마음은 어떨까요?",
        options=[cue.감정, pick_distractor_emotion(cue.감정)],
        answer=cue.감정,
        evidence=f"{cue.시각}초 자막 '{cue.근거_자막}'을 근거로 삼았다",
        evidence_times=[cue.시각],
        confidence=TEXT_CONFIDENCE,
    ) for cue in story.감정 if cue.시각 < trigger_sec]


def make_theme(story: StoryMaterial, trigger_sec: float) -> list[Activity]:
    """이야기 전체의 주제를 묻는다. 사건 대부분이 지난 뒤에만 성립한다."""
    if story.주제 is None or not story.사건:
        return []
    passed = [e for e in story.사건 if e.시각 < trigger_sec]
    if len(passed) < len(story.사건) * THEME_MIN_EVENT_RATIO:
        return []

    return [Activity(
        template="이야기_핵심_주제",
        question="이 이야기에서 가장 중요하게 전하는 내용은 무엇인가요?",
        options=[story.주제.정답, *story.주제.오답],
        answer=story.주제.정답,
        evidence="이야기 재료의 주제를 그대로 썼다 — 오답 선택은 모델 판단이다",
        evidence_times=[e.시각 for e in passed],
        confidence=MODEL_CONFIDENCE,
    )]


def make_cause_effect(story: StoryMaterial, trigger_sec: float) -> list[Activity]:
    """결과 사건의 직접적인 원인을 고르게 한다. 오답은 다른 사건의 요약을 쓴다."""
    by_time = {e.시각: e for e in story.사건}
    activities = []
    for causal in story.인과:
        if causal.결과_시각 >= trigger_sec:
            continue
        cause = by_time.get(causal.원인_시각)
        effect = by_time.get(causal.결과_시각)
        if cause is None or effect is None:
            continue
        others = [e.요약 for e in story.사건 if e.시각 not in (cause.시각, effect.시각)]
        if not others:
            continue
        activities.append(Activity(
            template="원인과_결과",
            question=f"'{effect.요약}'의 가장 직접적인 이유는 무엇인가요?",
            options=[cause.요약, *others[:2]],
            answer=cause.요약,
            evidence=f"{cause.시각}초 사건을 {effect.시각}초 사건의 원인으로 본 모델 판단이다",
            evidence_times=[cause.시각, effect.시각],
            confidence=MODEL_CONFIDENCE,
        ))
    return activities
