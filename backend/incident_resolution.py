"""Grounded retrieval and LLM-written investigation guidance for assignments."""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path

from backend.deepseek_client import chat_completion
from backend.incident_service import IncidentError


ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "knowledge_base" / "incident_reference_cases.json"
DOMAIN_KB_PATH = ROOT / "knowledge_base" / "Progressive_Agentic_POC_Workers_Compensation_Knowledge_Base.md"
PROMPT_PATH = Path(__file__).with_name("prompts") / "incident_resolution.md"
STOP_WORDS = {
    "about", "after", "before", "because", "being", "could", "does", "from", "have", "into",
    "issue", "policy", "record", "records", "that", "their", "there", "these", "this", "through",
    "ticket", "under", "when", "where", "which", "while", "with", "would", "your", "data",
}


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]{3,}", text.casefold()) if word not in STOP_WORDS}


def _read_reference_cases() -> tuple[dict, list[dict]]:
    try:
        snapshot = json.loads(CASES_PATH.read_text(encoding="utf-8"))
        cases = snapshot.get("cases")
        if not isinstance(cases, list):
            raise ValueError("case list is missing")
        return snapshot, cases
    except (OSError, json.JSONDecodeError, ValueError, AttributeError):
        raise IncidentError(
            "The incident reference snapshot is unavailable. Refresh it from Databricks before generating assignment guidance.",
            503,
        ) from None


def _knowledge_sections(query: str, limit: int = 4) -> list[dict[str, str]]:
    try:
        text = DOMAIN_KB_PATH.read_text(encoding="utf-8")
    except OSError:
        raise IncidentError("The Workers' Compensation knowledge base could not be loaded.", 503) from None

    sections: list[dict[str, str]] = []
    heading = DOMAIN_KB_PATH.name
    body: list[str] = []
    for line in text.splitlines():
        match = re.match(r"^(#{2,3})\s+(.+)$", line)
        if match:
            if body:
                sections.append({"heading": heading, "text": "\n".join(body).strip()})
            heading = match.group(2).strip()
            body = []
        else:
            body.append(line)
    if body:
        sections.append({"heading": heading, "text": "\n".join(body).strip()})

    query_words = _tokens(query)
    ranked = []
    for section in sections:
        words = _tokens(section["heading"] + " " + section["text"])
        overlap = len(query_words & words)
        heading_bonus = 2 if any(term in section["heading"].casefold() for term in ("data quality", "transformation", "lineage", "join", "operational workflow")) else 0
        if overlap or heading_bonus:
            ranked.append((overlap + heading_bonus, section))
    ranked.sort(key=lambda item: (-item[0], len(item[1]["text"])))
    selected = []
    budget = 9000
    for _, section in ranked:
        excerpt = section["text"][: min(len(section["text"]), 3500, budget)]
        if not excerpt:
            continue
        selected.append({"heading": section["heading"], "text": excerpt})
        budget -= len(excerpt)
        if len(selected) >= limit or budget <= 0:
            break
    return selected


def generate_resolution_guidance(ticket: dict, assignee: str) -> dict:
    """Generate evidence-linked guidance and return case facts from the snapshot."""
    snapshot, cases = _read_reference_cases()
    if not cases:
        raise IncidentError("The incident reference snapshot has no cases to compare.", 503)

    category_counts = Counter(str(case.get("issue_category") or "Uncategorized") for case in cases)
    ticket_text = " ".join(str(ticket.get(field) or "") for field in ("issue_category", "issue_summary", "issue_description"))
    target_words = _tokens(ticket_text)
    target_policies = {str(item.get("policy_number")) for item in ticket.get("related_policies", []) if item.get("policy_number")}

    candidate_cases = []
    for case in cases:
        if str(case.get("ticket_id", "")).upper() == str(ticket.get("ticket_id", "")).upper():
            continue
        case_text = " ".join(str(case.get(field) or "") for field in ("issue_category", "issue_summary", "issue_description"))
        case_words = _tokens(case_text)
        overlap = len(target_words & case_words) / max(1, len(target_words | case_words))
        category_match = str(case.get("issue_category", "")).casefold() == str(ticket.get("issue_category", "")).casefold()
        shared_policy = bool(target_policies & {str(item.get("policy_number")) for item in case.get("related_policies", []) if item.get("policy_number")})
        score = (4 if category_match else 0) + (3 if shared_policy else 0) + overlap * 5
        if score >= 0.55:
            candidate_cases.append({**case, "_similarity_score": round(score, 2)})
    candidate_cases.sort(key=lambda case: (-case["_similarity_score"], str(case.get("created_at") or "")))
    candidate_cases = candidate_cases[:8]

    query = f"{ticket.get('issue_category', '')} {ticket.get('issue_summary', '')} {ticket.get('issue_description', '')}"
    knowledge = _knowledge_sections(query)
    if not knowledge:
        raise IncidentError("No relevant Workers' Compensation knowledge-base sections were found for this issue.", 503)

    evidence = {
        "assigned_to": assignee,
        "ticket": {key: ticket.get(key) for key in (
            "ticket_id", "issue_category", "issue_summary", "issue_description", "ticket_status",
            "created_at", "last_updated", "related_policies",
        )},
        "candidate_incident_records": [
            {key: case.get(key) for key in (
                "ticket_id", "issue_category", "issue_summary", "issue_description", "ticket_status",
                "created_at", "last_updated", "related_policies",
            )}
            for case in candidate_cases
        ],
        "current_snapshot_category_frequency": {
            "category": str(ticket.get("issue_category") or "Uncategorized"),
            "count": category_counts.get(str(ticket.get("issue_category") or "Uncategorized"), 0),
            "total_records": len(cases),
        },
        "knowledge_base_sections": knowledge,
        "resolution_history_available": False,
    }
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    response = chat_completion(
        [
            {"role": "system", "content": prompt},
            {"role": "user", "content": "Build the investigation guide from this JSON evidence only:\n" + json.dumps(evidence, ensure_ascii=False)},
        ],
        max_tokens=1400,
        thinking=False,
    )
    answer = response["answer"].strip()
    if answer.startswith("```"):
        answer = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer, flags=re.IGNORECASE)
    try:
        generated = json.loads(answer)
    except json.JSONDecodeError:
        raise IncidentError("The assistant could not format grounded investigation guidance. The ticket assignment was still saved.", 502) from None
    if not isinstance(generated, dict) or not isinstance(generated.get("steps"), list):
        raise IncidentError("The assistant returned an incomplete investigation guide. The ticket assignment was still saved.", 502)

    eligible_ids = {str(case["ticket_id"]).upper() for case in candidate_cases if case.get("ticket_id")}
    selected_ids = []
    for raw_id in generated.get("similar_ticket_ids", []):
        ticket_id = str(raw_id).upper()
        if ticket_id in eligible_ids and ticket_id not in selected_ids:
            selected_ids.append(ticket_id)
    selected_cases = []
    for ticket_id in selected_ids[:3]:
        case = next(case for case in candidate_cases if str(case.get("ticket_id", "")).upper() == ticket_id)
        case = {key: value for key, value in case.items() if not key.startswith("_")}
        case["snapshot_category_count"] = category_counts.get(str(case.get("issue_category") or "Uncategorized"), 0)
        case["snapshot_record_count"] = len(cases)
        selected_cases.append(case)

    steps = []
    for index, raw_step in enumerate(generated["steps"][:5], start=1):
        if not isinstance(raw_step, dict):
            continue
        title = str(raw_step.get("title", "")).strip()
        instruction = str(raw_step.get("instruction", "")).strip()
        verify = str(raw_step.get("verify", "")).strip()
        if title and instruction:
            steps.append({"number": index, "title": title[:120], "instruction": instruction[:700], "verify": verify[:500]})
    if not steps:
        raise IncidentError("The assistant returned no usable investigation steps. The ticket assignment was still saved.", 502)

    return {
        "ticket_id": ticket.get("ticket_id"),
        "assignee": assignee,
        "summary": str(generated.get("summary", ""))[:900],
        "steps": steps,
        "similar_cases": selected_cases,
        "category_frequency": evidence["current_snapshot_category_frequency"],
        "knowledge_references": [
            {"document": "incident_reference_cases.md", "section": "Recorded incident cases and category frequency"},
        ] + [
            {
                "document": DOMAIN_KB_PATH.name,
                "section": section["heading"],
            }
            for section in knowledge
        ],
        "case_reference_document": "incident_reference_cases.md",
        "limitations": "Similar-ticket records contain issue descriptions and current status, not confirmed causes or successful fixes. Verify each suggested check against authorized systems and current evidence.",
    }
