from subtitle_parser import parse_srt, parse_vtt
from schemas import SubtitleSegment

SRT_SAMPLE = """1
00:00:01,000 --> 00:00:02,500
안녕하세요

2
00:00:02,600 --> 00:00:04,000
오늘은

3
00:00:04,100 --> 00:00:06,000
날씨가 좋네요.

4
00:00:08,000 --> 00:00:09,500
다음 장면입니다.
"""

VTT_SAMPLE = """WEBVTT

00:00:01.000 --> 00:00:02.500
안녕하세요

00:00:02.600 --> 00:00:04.000
오늘은 날씨가 좋네요.
"""


def test_parse_srt_returns_segments_in_order():
    segments = parse_srt(SRT_SAMPLE)
    assert len(segments) == 4
    assert segments[0] == SubtitleSegment(text="안녕하세요", start_sec=1.0, end_sec=2.5)
    assert segments[3] == SubtitleSegment(text="다음 장면입니다.", start_sec=8.0, end_sec=9.5)


def test_parse_vtt_returns_segments_in_order():
    segments = parse_vtt(VTT_SAMPLE)
    assert len(segments) == 2
    assert segments[0] == SubtitleSegment(text="안녕하세요", start_sec=1.0, end_sec=2.5)
    assert segments[1].text == "오늘은 날씨가 좋네요."
