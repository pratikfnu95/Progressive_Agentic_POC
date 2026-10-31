"""Vanna 2 LLM-service adapter configured to use DeepSeek's API."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from string import Template

from vanna.core.llm import LlmMessage, LlmRequest
from vanna.integrations.openai import OpenAILlmService
from vanna.core.user import User

from backend.deepseek_client import DeepSeekSettings
from backend.sql_context import prompt_context


LOGGER = logging.getLogger(__name__)
EXAMPLES_FILE = Path(__file__).with_name("verified_sql_examples.json")
PROMPT_FILE = Path(__file__).with_name("prompts") / "sql_generation.md"
MAX_QUESTION_LENGTH = 2000


class SqlGenerationError(RuntimeError):
    """Safe, user-facing SQL-generation failure."""


def _load_verified_examples() -> list[dict[str, str]]:
    payload = json.loads(EXAMPLES_FILE.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("verified_sql_examples.json must contain a JSON list.")
    examples = []
    for row in payload:
        if not isinstance(row, dict):
            raise ValueError("Each verified SQL example must be a JSON object.")
        question = row.get("question")
        sql = row.get("sql")
        if not isinstance(question, str) or not question.strip() or not isinstance(sql, str) or not sql.strip():
            raise ValueError("Each verified SQL example needs non-empty question and sql fields.")
        examples.append({"question": question.strip(), "sql": sql.strip()})
    return examples


def _build_system_prompt(schema: str) -> str:
    prompt_template = Template(PROMPT_FILE.read_text(encoding="utf-8"))
    context = prompt_context(_load_verified_examples())
    business_guidance, _, examples = context.partition("\n\nVERIFIED SQL EXAMPLES\n")
    return prompt_template.substitute(
        LIVE_SCHEMA=schema,
        BUSINESS_GUIDANCE=business_guidance.removeprefix("BUSINESS GUIDANCE\n"),
        VERIFIED_EXAMPLES=examples or "No independently verified SQL examples are available.",
    )


def generate_sql(question: str, schema: str) -> str:
    cleaned_question = question.strip()
    if not cleaned_question:
        raise SqlGenerationError("Enter a question first.")
    if len(cleaned_question) > MAX_QUESTION_LENGTH:
        raise SqlGenerationError("Please keep questions under 2,000 characters.")

    settings = DeepSeekSettings.from_environment()
    llm_service = OpenAILlmService(
        model=settings.model,
        api_key=settings.api_key,
        base_url=settings.base_url,
        timeout=45.0,
        max_retries=0,
    )
    request = LlmRequest(
        messages=[LlmMessage(role="user", content=cleaned_question)],
        user=User(id="progressive-ai-poc", group_memberships=["user"]),
        system_prompt=_build_system_prompt(schema),
        stream=False,
        temperature=0,
        max_tokens=1200,
    )
    try:
        response = asyncio.run(llm_service.send_request(request))
    except Exception as error:
        LOGGER.warning("Vanna/DeepSeek SQL generation failed (%s)", type(error).__name__)
        raise SqlGenerationError(
            "SQL generation failed. Check the server-side DeepSeek configuration and try again."
        ) from None

    content = (response.content or "").strip()
    if not content:
        raise SqlGenerationError("The model returned an empty SQL response.")
    if content.upper().startswith("CLARIFICATION:"):
        raise SqlGenerationError(content.partition(":")[2].strip() or "Please clarify your question.")

    content = re.sub(r"^```(?:sql)?\s*|\s*```$", "", content, flags=re.IGNORECASE).strip()
    content = re.sub(r"^SQL\s*:\s*", "", content, flags=re.IGNORECASE).strip()
    return content
