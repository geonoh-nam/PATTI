from safe_point_detector import is_sentence_closed, find_raw_safe_points, find_safe_points
from schemas import SubtitleSegment


def seg(text, start, end):
    return SubtitleSegment(text=text, start_sec=start, end_sec=end)


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


def test_keeps_line_followed_by_silence():
    segments = [
        seg("첫 대사야.", 0.0, 5.0),
        seg("두 번째 대사야.", 8.0, 12.0),
    ]
    raw = find_raw_safe_points(segments, video_duration_sec=20.0, min_silence_sec=1.0)
    # 0번 줄 뒤 침묵 3초, 1번 줄 뒤 침묵 8초 — 둘 다 통과
    assert raw == [(0, 5.0, 3.0), (1, 12.0, 8.0)]


def test_drops_line_with_insufficient_silence():
    segments = [
        seg("첫 대사야.", 0.0, 5.0),
        seg("바로 이어지는 대사야.", 5.2, 9.0),
    ]
    raw = find_raw_safe_points(segments, video_duration_sec=20.0, min_silence_sec=1.0)
    assert [idx for idx, _, _ in raw] == [1]


def test_drops_line_that_is_not_sentence_closed():
    segments = [
        seg("이젠 내가", 0.0, 5.0),
        seg("해내겠어.", 10.0, 13.0),
    ]
    raw = find_raw_safe_points(segments, video_duration_sec=20.0, min_silence_sec=1.0)
    assert [idx for idx, _, _ in raw] == [1]


def test_uses_video_duration_as_silence_for_last_line():
    segments = [seg("마지막 대사야.", 0.0, 5.0)]
    raw = find_raw_safe_points(segments, video_duration_sec=9.0, min_silence_sec=1.0)
    assert raw == [(0, 5.0, 4.0)]


def test_returns_empty_for_no_segments():
    assert find_raw_safe_points([], video_duration_sec=10.0) == []


def test_enforces_minimum_spacing_chronologically():
    segments = [
        seg("첫 대사야.", 20.0, 25.0),
        seg("둘째 대사야.", 30.0, 35.0),   # 직전 채택과 10초 — 탈락
        seg("셋째 대사야.", 50.0, 55.0),   # 직전 채택과 30초 — 채택
    ]
    points = find_safe_points(
        segments, video_duration_sec=100.0, min_spacing_sec=20.0, edge_margin_sec=15.0
    )
    assert [p.timestamp_sec for p in points] == [25.0, 55.0]


def test_excludes_points_inside_edge_margin():
    segments = [
        seg("너무 이른 대사야.", 0.0, 5.0),
        seg("가운데 대사야.", 40.0, 45.0),
        seg("너무 늦은 대사야.", 90.0, 95.0),
    ]
    points = find_safe_points(
        segments, video_duration_sec=100.0, min_spacing_sec=1.0, edge_margin_sec=15.0
    )
    assert [p.timestamp_sec for p in points] == [45.0]


def test_reason_states_the_computed_signal():
    segments = [seg("첫 대사야.", 20.0, 25.0), seg("둘째 대사야.", 28.0, 30.0)]
    points = find_safe_points(
        segments, video_duration_sec=100.0, min_spacing_sec=1.0, edge_margin_sec=15.0
    )
    assert points[0].reason == "문장 완결 + 침묵 3.0초"


def test_context_includes_two_preceding_lines():
    segments = [
        seg("첫째.", 16.0, 18.0),
        seg("둘째.", 19.0, 21.0),
        seg("셋째.", 22.0, 25.0),
        seg("넷째.", 40.0, 45.0),
    ]
    points = find_safe_points(
        segments, video_duration_sec=100.0, min_spacing_sec=1.0, edge_margin_sec=15.0
    )
    first = points[0]
    assert [s.text for s in first.context_segments] == ["첫째.", "둘째.", "셋째."]


def test_find_safe_points_returns_empty_for_no_segments():
    # Task 2의 test_returns_empty_for_no_segments와 같은 파일이므로 이름이 겹치면 안 된다
    assert find_safe_points([], video_duration_sec=100.0) == []
