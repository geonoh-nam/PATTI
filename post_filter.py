from schemas import ActivityCandidate


def filter_and_cap(
    candidates: list[ActivityCandidate],
    score_threshold: float = 0.5,
    max_per_video: int = 8,
) -> tuple[list[ActivityCandidate], list[tuple[ActivityCandidate, str]]]:
    """점수와 목표 개수로 최종 선정한다.

    최소 간격은 safe_point_detector가 후보 지점 단계에서 이미 강제하므로 여기서 다루지 않는다.
    """
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

    if len(suitable) > max_per_video:
        ranked = sorted(suitable, key=lambda c: c.score, reverse=True)
        kept = ranked[:max_per_video]
        for c in ranked[max_per_video:]:
            dropped.append((c, f"목표 개수({max_per_video}개) 초과 — 점수 상위권 밖"))
        kept.sort(key=lambda c: c.timestamp_sec)
    else:
        kept = suitable

    return kept, dropped
