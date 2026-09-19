from app.reflection import ReflectionAnalysis


def test_reflection_analysis_accepts_valid_feedback():
    analysis = ReflectionAnalysis(
        understood=[
        "The student understood the main feedback."
    ],
        feedback_applied=[
            "Strengthened the thesis",
            "Added evidence",
        ],
        gaps_remaining=[
            "Improve paragraph transitions",
        ],
        learning_summary=(
            "The student understood the main feedback "
            "and applied several suggestions."
        ),
        next_action=(
            "Review transitions between body paragraphs."
        ),
    )

    assert len(analysis.understood) == 1
    assert len(analysis.feedback_applied) == 2
    assert len(analysis.gaps_remaining) == 1
    assert analysis.next_action


def test_reflection_analysis_rejects_empty_summary():
    try:
        ReflectionAnalysis(
            understood=[],
            feedback_applied=[],
            gaps_remaining=[],
            learning_summary="",
            next_action="Continue revising.",
        )
    except Exception:
        assert True
    else:
        raise AssertionError(
            "Expected empty learning summary to be rejected."
        )