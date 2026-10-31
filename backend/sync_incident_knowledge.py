"""Refresh the human-readable incident reference from Databricks ticket rows."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from backend.incident_service import _tickets


ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "knowledge_base" / "incident_reference_cases.json"
MARKDOWN_PATH = ROOT / "knowledge_base" / "incident_reference_cases.md"


def sync_incident_knowledge() -> int:
    """Read all incident rows, including inactive ones, and write a POC snapshot."""
    tickets = _tickets("all", include_inactive=True)
    cases = [
        {
            "ticket_id": row.get("ticket_id"),
            "issue_category": row.get("issue_category"),
            "issue_summary": row.get("issue_summary"),
            "issue_description": row.get("issue_description"),
            "ticket_status": row.get("ticket_status"),
            "is_active": bool(row.get("is_active")),
            "assigned_to": row.get("assigned_to"),
            "created_at": row.get("created_at"),
            "last_updated": row.get("last_updated"),
            "related_policies": row.get("related_policies", []),
        }
        for row in tickets
    ]
    snapshot = {
        "source_table": "workspace.default.incident_tickets",
        "related_policy_source": "workspace.default.incident_ticket_policies",
        "snapshot_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "record_count": len(cases),
        "cases": cases,
    }
    JSON_PATH.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    categories = Counter(str(case.get("issue_category") or "Uncategorized") for case in cases)
    status_counts = Counter(str(case.get("ticket_status") or "Unknown") for case in cases)
    lines = [
        "# Incident Reference Cases and Investigation Guide",
        "",
        "> Snapshot of incident facts read from the Databricks incident tables. "
        "This is a proof-of-concept reference set, not a verified resolution archive.",
        "",
        f"- Snapshot time (UTC): `{snapshot['snapshot_at_utc']}`",
        f"- Ticket source: `{snapshot['source_table']}`",
        f"- Related policy source: `{snapshot['related_policy_source']}`",
        f"- Records in this snapshot: **{len(cases)}**",
        "- The snapshot includes active and inactive ticket rows.",
        "- Category frequency is a count of records in this snapshot; it is not a recurrence rate or proof of a common root cause.",
        "- The incident tables do not contain verified resolution/root-cause fields. Current status, assignment, and dates are not evidence that a fix was successful.",
        "",
        "## Recorded issue frequency",
        "",
        "| Issue category | Tickets | Share of this snapshot |",
        "|---|---:|---:|",
    ]
    for category, count in sorted(categories.items(), key=lambda item: (-item[1], item[0].casefold())):
        share = (count / len(cases) * 100) if cases else 0
        lines.append(f"| {category} | {count} | {share:.0f}% |")
    lines.extend([
        "",
        "## Recorded status counts",
        "",
        "| Current ticket status | Tickets |",
        "|---|---:|",
    ])
    for status, count in sorted(status_counts.items(), key=lambda item: item[0].casefold()):
        lines.append(f"| {status} | {count} |")
    lines.extend([
        "",
        "## Databricks ticket examples",
        "",
        "Each entry below is a source record. Policy numbers and policy statuses are read from the related-policy table.",
        "",
    ])
    for case in cases:
        lines.extend([
            f"### {case['ticket_id']} — {case.get('issue_category') or 'Uncategorized'}",
            "",
            f"- **Summary:** {case.get('issue_summary') or 'Not provided'}",
            f"- **Details:** {case.get('issue_description') or 'Not provided'}",
            f"- **Current status:** {case.get('ticket_status') or 'Unknown'}",
            f"- **Active:** {'Yes' if case['is_active'] else 'No'}",
            f"- **Assigned to:** {case.get('assigned_to') or 'Unassigned'}",
            f"- **Created:** {case.get('created_at') or 'Not provided'}",
            f"- **Last updated:** {case.get('last_updated') or 'Not provided'}",
        ])
        policies = case.get("related_policies") or []
        if policies:
            references = ", ".join(
                f"{policy.get('policy_number') or 'Unknown'} ({policy.get('policy_status') or 'status unknown'})"
                for policy in policies
            )
        else:
            references = "None recorded"
        lines.extend([f"- **Related policies:** {references}", ""])
    lines.extend([
        "## Investigation guidance boundaries",
        "",
        "Use these records to find related symptoms and provide traceable examples. Do not say a case was resolved, identify a confirmed cause, or treat its current status as a successful fix unless a reviewed resolution record is added.",
        "",
        "For the synthetic Workers' Compensation data pipeline, use the separate Workers' Compensation knowledge base to select verified POC tables and checks. Follow source-to-Bronze-to-Silver-to-Gold lineage; compare business keys, source transaction IDs, row counts, and amounts at matching grains; check for duplicate keys and join multiplication; and keep coverage, charge, and transaction aggregates at their documented grains. The available knowledge base does not document EDW table schemas, so do not invent EDW table names or SQL.",
        "",
        "Run `.venv/bin/python -m backend.sync_incident_knowledge` to refresh this snapshot from Databricks.",
        "",
    ])
    MARKDOWN_PATH.write_text("\n".join(lines), encoding="utf-8")
    return len(cases)


if __name__ == "__main__":
    count = sync_incident_knowledge()
    print(f"Wrote {count} incident reference records to {MARKDOWN_PATH.name} and {JSON_PATH.name}.")
