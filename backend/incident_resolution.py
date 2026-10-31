"""Retrieve a concise assignment guide from the incident-reference knowledge base."""

from __future__ import annotations

import json
import re
from pathlib import Path

from backend.incident_service import IncidentError


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_PATH = ROOT / "knowledge_base" / "illustrative_resolved_incident_cases.json"
STOP_WORDS = {
    "about", "after", "before", "because", "being", "could", "does", "from", "have", "into",
    "issue", "policy", "record", "records", "that", "their", "there", "these", "this", "through",
    "ticket", "under", "when", "where", "which", "while", "with", "would", "your", "data",
}


def _tokens(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z0-9]{3,}", text.casefold()) if word not in STOP_WORDS}


def _read_cases() -> dict:
    try:
        library = json.loads(REFERENCE_PATH.read_text(encoding="utf-8"))
        cases = library.get("cases")
        if not isinstance(cases, list) or not cases:
            raise ValueError("case list is missing")
        return library
    except (OSError, json.JSONDecodeError, ValueError, AttributeError):
        raise IncidentError("The incident investigation reference library could not be loaded.", 503) from None


def _rank_case(ticket: dict, cases: list[dict]) -> tuple[dict | None, float]:
    category = str(ticket.get("issue_category") or "").strip().casefold()
    query_words = _tokens(" ".join(str(ticket.get(field) or "") for field in (
        "issue_category", "issue_summary", "issue_description",
    )))
    ranked: list[tuple[float, dict]] = []
    for case in cases:
        if case.get("status") != "illustrative_resolved":
            continue
        case_category = str(case.get("issue_category") or "").strip().casefold()
        terms = set()
        for value in [case.get("issue_summary", ""), *case.get("match_terms", [])]:
            terms |= _tokens(str(value))
        overlap = len(query_words & terms) / max(1, len(query_words))
        score = (2.0 if category and category == case_category else 0.0) + overlap
        ranked.append((score, case))
    ranked.sort(key=lambda item: (-item[0], str(item[1].get("reference_id", ""))))
    if not ranked or ranked[0][0] < 0.2:
        return None, 0.0
    return ranked[0][1], ranked[0][0]


def generate_resolution_guidance(ticket: dict, assignee: str) -> dict:
    """Return one retrieved reference and its concise, pre-reviewed sample checks."""
    library = _read_cases()
    reference, score = _rank_case(ticket, library["cases"])
    ticket_id = str(ticket.get("ticket_id") or "this ticket")
    steps = []
    if reference:
        steps = [
            {
                "number": index,
                "title": str(step.get("title", ""))[:72],
                "instruction": str(step.get("instruction", ""))[:240],
                "verify": str(step.get("verify", ""))[:180],
            }
            for index, step in enumerate(reference.get("resolution_steps", [])[:3], start=1)
            if step.get("title") and step.get("instruction")
        ]

    return {
        "ticket_id": ticket_id,
        "assignee": assignee,
        "opening": f"Hi {assignee} — since {ticket_id} is assigned to you, here’s a concise place to start.",
        "similar_case": ({
            "reference_id": reference.get("reference_id"),
            "issue_category": reference.get("issue_category"),
            "issue_summary": reference.get("issue_summary"),
            "resolution_summary": reference.get("resolution_summary"),
            "match_score": round(score, 2),
            "status": reference.get("status"),
        } if reference else None),
        "steps": steps,
        "watch_for": reference.get("watch_for") if reference else None,
        "source_tables": reference.get("source_tables", []) if reference else [],
        "provenance": library.get("provenance", "Illustrative POC reference; validate against current evidence."),
        "case_reference_document": REFERENCE_PATH.name,
    }
