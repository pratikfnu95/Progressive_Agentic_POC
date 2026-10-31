"""Generate grounded follow-up questions from a completed SQL result."""

from __future__ import annotations

import json
from pathlib import Path

from backend.deepseek_client import chat_completion
from backend.sql_context import BUSINESS_GUIDANCE


PROMPT_PATH = Path(__file__).with_name("prompts") / "followup_questions.md"
MAX_QUESTION_LENGTH = 2000


def _bounded_result_preview(columns: object, rows: object) -> dict:
    if not isinstance(columns, list) or not isinstance(rows, list):
        raise ValueError("Query result context is missing.")

    safe_columns = [str(column)[:100] for column in columns[:12]]
    safe_rows = []
    for row in rows[:5]:
        if not isinstance(row, list):
            continue
        safe_rows.append([
            None if value is None else str(value)[:120]
            for value in row[: len(safe_columns)]
        ])
    return {"columns": safe_columns, "rows": safe_rows}


def generate_followup_questions(
    question: str,
    columns: object,
    rows: object,
    row_count: object,
    schema_context: object = "",
) -> list[str]:
    """Ask DeepSeek for two or three questions grounded in an executed result."""
    cleaned_question = question.strip()
    if not cleaned_question or len(cleaned_question) > MAX_QUESTION_LENGTH:
        raise ValueError("The original question is empty or too long.")

    preview = _bounded_result_preview(columns, rows)
    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    context = {
        "original_question": cleaned_question,
        "returned_row_count": row_count if isinstance(row_count, int) else len(preview["rows"]),
        "result_preview": preview,
        "available_gold_schema": schema_context[:20000] if isinstance(schema_context, str) else "",
        "verified_relationship_guidance": BUSINESS_GUIDANCE,
    }
    response = chat_completion(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        max_tokens=180,
        thinking=False,
    )

    try:
        parsed = json.loads(response["answer"])
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise ValueError("DeepSeek returned invalid follow-up question JSON.") from error

    raw_questions = parsed.get("questions") if isinstance(parsed, dict) else None
    if not isinstance(raw_questions, list):
        raise ValueError("DeepSeek did not return a follow-up question list.")

    questions = []
    for raw_question in raw_questions:
        if not isinstance(raw_question, str):
            continue
        value = " ".join(raw_question.split()).strip(" \"'`-")
        if value and value not in questions:
            questions.append(value[:160])
        if len(questions) == 3:
            break
    if len(questions) < 2:
        raise ValueError("DeepSeek returned fewer than two useful follow-up questions.")
    return questions
