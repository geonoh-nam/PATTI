from activity_dictionaries import (
    ANTONYMS,
    COLOR_PALETTE,
    COMPOUND_WORDS,
    EMOTIONS,
    MIMETIC_CATEGORIES,
    MIMETIC_WORDS,
    VOWEL_CONFUSIONS,
    find_antonym_source,
    find_compound,
    pick_distractor_emotion,
    pick_distractor_mimetic,
)


def test_color_palette_has_no_duplicates_and_covers_basic_colors():
    assert len(COLOR_PALETTE) == len(set(COLOR_PALETTE))
    for color in ("빨간색", "파란색", "노란색", "초록색"):
        assert color in COLOR_PALETTE


def test_every_mimetic_word_has_a_meaning_and_a_known_category():
    assert len(MIMETIC_WORDS) >= 15
    for word, (meaning, category) in MIMETIC_WORDS.items():
        assert meaning
        assert category in MIMETIC_CATEGORIES


def test_mimetic_categories_each_have_at_least_two_words():
    for category in MIMETIC_CATEGORIES:
        members = [w for w, (_, c) in MIMETIC_WORDS.items() if c == category]
        assert len(members) >= 2


def test_mimetic_distractor_comes_from_a_different_category():
    for word, (_, category) in MIMETIC_WORDS.items():
        distractor = pick_distractor_mimetic(word)
        assert distractor != word
        assert MIMETIC_WORDS[distractor][1] != category


def test_mimetic_distractor_is_deterministic():
    assert pick_distractor_mimetic("데굴데굴") == pick_distractor_mimetic("데굴데굴")


def test_emotions_are_child_facing_and_distractor_differs():
    assert "기뻐요" in EMOTIONS
    for emotion in EMOTIONS:
        assert pick_distractor_emotion(emotion) != emotion


def test_antonyms_are_bidirectional():
    for word, opposite in ANTONYMS.items():
        assert ANTONYMS[opposite] == word


def test_compound_words_decompose_into_two_parts():
    assert COMPOUND_WORDS["눈사람"] == ("눈", "사람")
    for whole, (left, right) in COMPOUND_WORDS.items():
        assert left + right == whole


def test_find_antonym_source_locates_a_dictionary_word():
    assert find_antonym_source("코끼리는 정말 크다.") == "크다"
    assert find_antonym_source("오늘은 학교에 갔어요.") is None


def test_find_compound_locates_a_compound_word():
    assert find_compound("마당에 눈사람을 만들었어요.") == "눈사람"
    assert find_compound("오늘은 학교에 갔어요.") is None


def test_vowel_confusions_are_single_jamo_pairs():
    for a, b in VOWEL_CONFUSIONS:
        assert a != b and len(a) == 1 and len(b) == 1
