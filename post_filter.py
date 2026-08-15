from schemas import ActivityCandidate


def filter_and_cap(
    candidates: list[ActivityCandidate],
    score_threshold: float = 0.5,
    min_spacing_sec: float = 45.0,
    max_per_video: int = 8,
) -> tuple[list[ActivityCandidate], list[tuple[ActivityCandidate, str]]]:
    dropped: list[tuple[ActivityCandidate, str]] = []

    suitable = []
    for c in candidates:
        if not c.is_suitable:
            dropped.append((c, "비전 판정에서 부적합(is_suitable=false)으로 거부됨"))
        elif c.score < score_threshold:
            dropped.append((c, f"점수 미달(score={c.score} < 임계값 {score_threshold})"))
        else:
            suitable.append(c)
    suitable.sort(key=lambda c: c.timestamp_sec)

    spaced: list[ActivityCandidate] = []
    last_ts: float | None = None
    for c in suitable:
        if last_ts is not None and c.timestamp_sec - last_ts < min_spacing_sec:
            dropped.append(
                (c, f"최소 간격 미달(직전 채택 지점과 {c.timestamp_sec - last_ts:.1f}초 < {min_spacing_sec}초)")
            )
            continue
        spaced.append(c)
        last_ts = c.timestamp_sec

    if len(spaced) > max_per_video:
        ranked = sorted(spaced, key=lambda c: c.score, reverse=True)
        kept = ranked[:max_per_video]
        for c in ranked[max_per_video:]:
            dropped.append((c, f"목표 개수({max_per_video}개) 초과 — 점수 상위권 밖"))
        kept.sort(key=lambda c: c.timestamp_sec)
    else:
        kept = spaced

    return kept, dropped
