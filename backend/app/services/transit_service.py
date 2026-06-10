from app import transit


def recompute_segments(segments) -> list[dict]:
    return [
        transit.recompute_segment(
            segment.from_lng,
            segment.from_lat,
            segment.to_lng,
            segment.to_lat,
            segment.mode,
        )
        for segment in segments
    ]
