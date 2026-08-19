from safe_point_detector import is_sentence_closed


def test_treats_sentence_punctuation_as_closed():
    assert is_sentence_closed("빠르다 별가루야, 고고!")
    assert is_sentence_closed("할머니가 왜 저렇게 빠르셔?")
    assert is_sentence_closed("아무튼 잠시도 안심할 수 없다니까.")


def test_treats_sentence_final_ending_without_punctuation_as_closed():
    assert is_sentence_closed("그래, 알겠어")
    assert is_sentence_closed("저 속도, 틀림없어")


def test_conservatively_treats_unlisted_ending_as_open():
    # -ㄹ게(불러볼게)는 종결어미지만 음절 "게"를 목록에 넣지 않는다.
    # 넣으면 부사형 -게("이렇게 해서", "빠르게 달려")까지 완결로 잡혀 문장 한복판에서 끊게 된다.
    # 완결 판정은 변별력이 낮은 필요조건(실측 47줄 중 45줄 통과)이고 주 신호는 침묵이므로,
    # 지점을 놓치는 쪽이 잘못 끊는 쪽보다 비용이 낮다.
    assert not is_sentence_closed("내가 큰 소리로 불러볼게")


def test_treats_continuing_clause_as_open():
    # 다음 줄과 한 문장으로 이어지는 절 — 여기서 끊으면 대사가 잘린다
    assert not is_sentence_closed("빛나, 그 스케이트 안에 빠르다 별가루를 잔뜩 집어 넣어 놨는데,")
    assert not is_sentence_closed("이젠 내가")


def test_treats_empty_text_as_open():
    assert not is_sentence_closed("")
    assert not is_sentence_closed("   ")
