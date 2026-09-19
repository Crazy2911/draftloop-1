from .database import privileged_database
from .schemas import RubricCreate


SCORING_GUIDE = (
    "Award 90–100% of this category's points when the criteria "
    "are consistently met; 70–89% when mostly met with minor gaps; "
    "40–69% when partially met with significant gaps; "
    "0–39% when largely absent or ineffective. "
    "Explain the score using evidence from the essay. "
    "Do not invent weaknesses or reward length alone."
)


def category(
    category_id: str,
    name: str,
    max_points: int,
    description: str,
) -> dict:
    return {
        "id": category_id,
        "name": name,
        "max_points": max_points,
        "description": f"{description} {SCORING_GUIDE}",
    }


RUBRIC_TEMPLATES = [
    {
        "id": "template-argumentative-v1",
        "rubric": {
            "name": "Argumentative Essay",
            "description": (
                "Evaluates a clear position, logical reasoning, "
                "supporting evidence, organization, and language."
            ),
            "categories": [
                category(
                    "argument",
                    "Argument Strength",
                    35,
                    "The essay presents a clear, relevant thesis. "
                    "Reasoning supports the position without major "
                    "logical gaps. Relevant counterarguments are "
                    "acknowledged and answered.",
                ),
                category(
                    "evidence",
                    "Evidence and Examples",
                    30,
                    "Claims are supported by relevant examples or "
                    "evidence, and the essay explains how that support "
                    "connects to the argument. Assess the support "
                    "presented; do not claim to verify external facts. "
                    "Require formal citations only if the assignment "
                    "asks for them.",
                ),
                category(
                    "structure",
                    "Structure and Coherence",
                    20,
                    "The introduction establishes the topic and "
                    "position. Paragraphs develop focused ideas in "
                    "a logical order. Transitions connect ideas, "
                    "and the conclusion synthesizes the argument.",
                ),
                category(
                    "language",
                    "Grammar and Clarity",
                    15,
                    "Sentences communicate clearly. Grammar, spelling, "
                    "and punctuation support readability. Vocabulary "
                    "and tone fit the task. Accept consistent valid "
                    "English varieties without favoring one dialect.",
                ),
            ],
        },
    },
    {
        "id": "template-narrative-v1",
        "rubric": {
            "name": "Narrative Essay",
            "description": (
                "Evaluates story development, organization, "
                "descriptive detail, voice, and language."
            ),
            "categories": [
                category(
                    "development",
                    "Story Development",
                    35,
                    "The narrative has a clear focus, purposeful events, "
                    "and developed characters or perspectives. "
                    "Experiences lead to a meaningful outcome or "
                    "reflection. Do not require an argumentative thesis.",
                ),
                category(
                    "structure",
                    "Organization and Pacing",
                    25,
                    "The opening establishes context. Events follow "
                    "an understandable sequence, including purposeful "
                    "nonlinear structures. Transitions and pacing "
                    "support the narrative, and the ending fits it.",
                ),
                category(
                    "voice",
                    "Voice and Detail",
                    25,
                    "Specific details help readers understand the "
                    "experience. Voice is consistent and appropriate. "
                    "Description, dialogue, or reflection are used "
                    "purposefully rather than added mechanically.",
                ),
                category(
                    "language",
                    "Grammar and Clarity",
                    15,
                    "Grammar, spelling, punctuation, and sentence "
                    "construction support understanding. Distinguish "
                    "intentional dialogue or stylistic choices from "
                    "errors that interfere with meaning.",
                ),
            ],
        },
    },
    {
        "id": "template-explanatory-v1",
        "rubric": {
            "name": "Explanatory Essay",
            "description": (
                "Evaluates how clearly and thoroughly an essay "
                "explains a topic using organized supporting detail."
            ),
            "categories": [
                category(
                    "explanation",
                    "Explanation and Understanding",
                    35,
                    "The topic and purpose are clear. Key concepts "
                    "are explained logically and with sufficient "
                    "depth for the intended reader. Flag internal "
                    "contradictions, but do not claim external fact "
                    "verification without supplied references.",
                ),
                category(
                    "support",
                    "Supporting Details",
                    25,
                    "Relevant examples, definitions, comparisons, "
                    "or other details clarify the topic. The essay "
                    "explains their relevance instead of merely "
                    "listing them. Require citations only when "
                    "specified by the assignment.",
                ),
                category(
                    "structure",
                    "Structure and Coherence",
                    25,
                    "The introduction establishes the topic. "
                    "Paragraphs group related information and follow "
                    "a logical progression. Transitions clarify "
                    "relationships and the conclusion draws together "
                    "the explanation.",
                ),
                category(
                    "language",
                    "Grammar and Clarity",
                    15,
                    "Language is precise and readable. Technical "
                    "terms are explained when needed. Grammar, "
                    "spelling, and punctuation support meaning. "
                    "Accept consistent valid English varieties.",
                ),
            ],
        },
    },
]

def seed_rubric_templates() -> None:
    """
    Insert missing built-in templates into Supabase.

    Existing templates are preserved. This function only handles
    predefined templates from this file, never browser-supplied data.
    """
    records = []

    for template in RUBRIC_TEMPLATES:
        rubric = RubricCreate.model_validate(
            template["rubric"]
        )

        records.append({
            "id": template["id"],
            "owner_id": None,
            "name": rubric.name,
            "description": rubric.description,
            "categories_json": [
                item.model_dump(mode="json")
                for item in rubric.categories
            ],
            "is_template": True,
        })

    if not records:
        return

    with privileged_database() as database:
        (
            database.table("rubrics")
            .upsert(
                records,
                on_conflict="id",
                ignore_duplicates=True,
            )
            .execute()
        )