"""Databricks-backed incident ticket reads and guarded mutations."""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from backend.databricks_connector import open_connection
from backend.deepseek_client import DeepSeekAPIError, chat_completion

LOGGER = logging.getLogger("progressive_ai.incidents")
CATALOG_SCHEMA = "`workspace`.`default`"
TICKETS = f"{CATALOG_SCHEMA}.`incident_tickets`"
MEMBERS = f"{CATALOG_SCHEMA}.`incident_team_members`"
POLICIES = f"{CATALOG_SCHEMA}.`incident_ticket_policies`"
ACTIVITY = f"{CATALOG_SCHEMA}.`incident_ticket_activity`"
STATUSES = {"Unassigned", "Assigned", "In Progress", "Blocked", "Waiting for Info", "Completed", "Declined"}
ASSIGNABLE = {"Pratik", "Sarvesh", "Madhu", "Saurabh"}
KNOWN_TEAM_NAMES = ["Pratik", "Sarvesh", "Madhu", "Saurabh", "Admin"]
TICKET_ID_RE = re.compile(r"^INC[0-9]{7}$", re.IGNORECASE)
PROMPT_PATH = Path(__file__).with_name("prompts") / "incident_intent.md"


class IncidentError(RuntimeError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _json_value(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _rows(cursor) -> list[dict]:
    names = [str(col[0]) for col in cursor.description or []]
    return [dict(zip(names, (_json_value(value) for value in row))) for row in cursor.fetchall()]


def _query(sql: str) -> list[dict]:
    with open_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SET STATEMENT_TIMEOUT = 30")
            cursor.execute(sql)
            return _rows(cursor)


def _execute(sql: str) -> None:
    with open_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute("SET STATEMENT_TIMEOUT = 30")
            cursor.execute(sql)


def list_members() -> list[dict]:
    rows = _query(f"SELECT user_id, display_name, role, is_active FROM {MEMBERS} WHERE is_active = true")
    return rows


def _member(display_name: str) -> dict:
    escaped = _literal(display_name)
    matches = _query(
        f"SELECT user_id, display_name, role, is_active FROM {MEMBERS} "
        f"WHERE lower(display_name) = lower({escaped}) AND is_active = true LIMIT 1"
    )
    if not matches:
        raise IncidentError("That account is not present or active in the incident team roster.", 403)
    return matches[0]


def _member_by_id(user_id: str) -> dict:
    matches = _query(
        f"SELECT user_id, display_name, role, is_active FROM {MEMBERS} "
        f"WHERE lower(user_id) = {_literal(user_id.lower())} AND is_active = true LIMIT 1"
    )
    if not matches:
        raise IncidentError("That account is not present or active in the incident team roster.", 403)
    return matches[0]


def _tickets(filter_name: str = "all", current_user: dict | None = None, assignee_name: str | None = None,
             ticket_id: str | None = None, *, include_inactive: bool = False) -> list[dict]:
    where = [] if include_inactive else ["t.is_active = true"]
    if filter_name == "unassigned":
        where.append("t.assigned_to_user_id IS NULL")
        where.append("t.ticket_status = 'Unassigned'")
    elif filter_name == "mine":
        if not current_user:
            raise IncidentError("Sign in to see your assigned tickets.", 401)
        where.append(f"t.assigned_to_user_id = {_literal(str(current_user['user_id']))}")
    elif filter_name == "by_assignee":
        if not assignee_name:
            raise IncidentError("Specify a teammate to list their tickets.")
        assignee = _member(assignee_name)
        where.append(f"t.assigned_to_user_id = {_literal(str(assignee['user_id']))}")
    elif filter_name == "ticket":
        if not ticket_id or not TICKET_ID_RE.fullmatch(ticket_id):
            raise IncidentError("Provide a valid incident ticket number.")
        where = [f"t.ticket_id = {_literal(ticket_id.upper())}"]
    elif filter_name != "all":
        raise IncidentError("Unsupported ticket filter.")

    where_sql = f" WHERE {' AND '.join(where)}" if where else ""
    tickets = _query(
        "SELECT t.ticket_id, t.issue_summary, t.issue_description, t.issue_category, "
        "t.ticket_status, t.assigned_to_user_id, t.is_active, t.created_at, t.last_updated, "
        "t.acknowledged_at, t.acknowledged_by_user_id "
        f"FROM {TICKETS} t{where_sql} ORDER BY t.created_at DESC LIMIT 200"
    )
    if not tickets:
        return []
    ids = ", ".join(_literal(str(row["ticket_id"])) for row in tickets)
    relations = _query(
        f"SELECT ticket_id, policy_number, policy_status FROM {POLICIES} WHERE ticket_id IN ({ids})"
    )
    roster = list_members()
    names = {str(row["user_id"]): row["display_name"] for row in roster}
    by_ticket: dict[str, list[dict]] = {}
    for relation in relations:
        by_ticket.setdefault(str(relation["ticket_id"]), []).append({
            "policy_number": relation["policy_number"],
            "policy_status": relation["policy_status"],
        })
    for ticket in tickets:
        assignee_id = ticket.get("assigned_to_user_id")
        acknowledged_by = ticket.get("acknowledged_by_user_id")
        ticket["assigned_to"] = names.get(str(assignee_id)) if assignee_id else None
        ticket["acknowledged_by"] = names.get(str(acknowledged_by)) if acknowledged_by else None
        ticket["related_policies"] = by_ticket.get(str(ticket["ticket_id"]), [])
    return tickets


def _record_event(ticket_id: str, actor: dict, action: str, *, from_status=None, to_status=None,
                  from_assignee=None, to_assignee=None, details=None) -> None:
    _execute(
        f"INSERT INTO {ACTIVITY} (activity_id, ticket_id, actor_user_id, action_type, from_status, to_status, "
        "from_assignee_user_id, to_assignee_user_id, details, created_at) VALUES ("
        f"{_literal(str(uuid4()))}, {_literal(ticket_id)}, {_literal(str(actor['user_id']))}, {_literal(action)}, "
        f"{_literal(from_status) if from_status is not None else 'NULL'}, "
        f"{_literal(to_status) if to_status is not None else 'NULL'}, "
        f"{_literal(from_assignee) if from_assignee is not None else 'NULL'}, "
        f"{_literal(to_assignee) if to_assignee is not None else 'NULL'}, "
        f"{_literal(details) if details is not None else 'NULL'}, current_timestamp())"
    )


def list_activity(limit: int = 50) -> list[dict]:
    limit = max(1, min(int(limit), 100))
    events = _query(
        "SELECT activity_id, ticket_id, actor_user_id, action_type, from_status, to_status, "
        "from_assignee_user_id, to_assignee_user_id, details, created_at "
        f"FROM {ACTIVITY} ORDER BY created_at DESC LIMIT {limit}"
    )
    roster = list_members()
    names = {str(row["user_id"]): row["display_name"] for row in roster}
    for event in events:
        actor = names.get(str(event.get("actor_user_id")), event.get("actor_user_id"))
        event["id"] = event["activity_id"]
        event["timestamp"] = event["created_at"]
        event["tone"] = "red" if event["action_type"] == "DECLINED" else "orange" if event["action_type"] == "UNASSIGNED" else "blue"
        event["message"] = _activity_message(event, actor, names)
    return events


def _activity_message(event: dict, actor: str, names: dict[str, str]) -> str:
    ticket = event["ticket_id"]
    action = event["action_type"]
    if action == "STATUS_CHANGED":
        text = f"{ticket} status changed to {event.get('to_status')}"
    elif action == "ASSIGNED":
        text = f"{ticket} acknowledged and assigned to {names.get(str(event.get('to_assignee_user_id')), event.get('to_assignee_user_id'))}"
    elif action == "REASSIGNED":
        text = f"{ticket} reassigned to {names.get(str(event.get('to_assignee_user_id')), event.get('to_assignee_user_id'))}"
    elif action == "UNASSIGNED":
        text = f"{ticket} unassigned"
    elif action == "DECLINED":
        text = f"{ticket} request declined"
    else:
        text = event.get("details") or f"{ticket} updated"
    return f"{text} by {actor}"


def dashboard_snapshot() -> dict:
    return {"tickets": _tickets("all"), "activity": list_activity(limit=6)}


def classify_message(question: str, current_user: str = "Not signed in") -> dict:
    if not question or len(question) > 2000:
        raise IncidentError("Enter a ticket question or action under 2,000 characters.")
    template = PROMPT_PATH.read_text(encoding="utf-8")
    prompt = template.replace("$CURRENT_USER", current_user or "Not signed in")
    prompt = prompt.replace("$TEAM_ROSTER", ", ".join(KNOWN_TEAM_NAMES))
    prompt = prompt.replace("$USER_MESSAGE", question)
    response = chat_completion(
        [
            {"role": "system", "content": "Classify incident requests. Output valid JSON only."},
            {"role": "user", "content": prompt},
        ],
        max_tokens=400,
        thinking=False,
    )
    answer = response["answer"].strip()
    if answer.startswith("```"):
        answer = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer, flags=re.IGNORECASE)
    try:
        intent = json.loads(answer)
    except json.JSONDecodeError:
        raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422) from None
    if not isinstance(intent, dict) or intent.get("intent") not in {"list_tickets", "assign", "change_status", "decline", "clarify", "other"}:
        raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422)
    return intent


def _get_ticket(ticket_id: str) -> dict:
    if not TICKET_ID_RE.fullmatch(ticket_id or ""):
        raise IncidentError("Please provide one valid incident ticket number.")
    tickets = _tickets("ticket", ticket_id=ticket_id)
    if not tickets:
        raise IncidentError("I couldn't find that active ticket.", 404)
    return tickets[0]


def _require_ticket_permission(ticket: dict, actor: dict, *, allow_unassigned=False) -> None:
    if actor["role"] == "ADMIN":
        return
    owner_id = ticket.get("assigned_to_user_id")
    if owner_id and str(owner_id) != str(actor["user_id"]):
        raise IncidentError("You don't have permission to change this ticket.", 403)
    if not owner_id and not allow_unassigned:
        raise IncidentError("Acknowledge this unassigned ticket before changing its status.", 403)


def _apply_action(ticket_id: str, actor: dict, operation: str, *, assignee_name=None, status=None) -> dict:
    ticket = _get_ticket(ticket_id)
    if not ticket.get("is_active"):
        raise IncidentError("This ticket is no longer active and cannot be changed.", 409)
    old_status = str(ticket["ticket_status"])
    old_assignee = ticket.get("assigned_to_user_id")
    if operation in {"assign_to_me", "assign_to_user", "acknowledge_assign"}:
        acknowledged = operation in {"assign_to_me", "acknowledge_assign"} and not old_assignee
        if operation == "assign_to_me":
            assignee = actor
        else:
            if not assignee_name:
                raise IncidentError("Choose a teammate to assign the ticket to.")
            assignee = _member(assignee_name)
            if assignee["role"] == "ADMIN":
                raise IncidentError("Choose an incident team member as the ticket owner.")
        if old_assignee and str(old_assignee) != str(actor["user_id"]):
            _require_ticket_permission(ticket, actor)
        elif old_assignee and actor["role"] != "ADMIN" and str(old_assignee) != str(actor["user_id"]):
            raise IncidentError("You don't have permission to reassign this ticket.", 403)
        if not old_assignee and actor["role"] != "ADMIN" and operation not in {"assign_to_me", "acknowledge_assign"}:
            raise IncidentError("Acknowledge an unassigned ticket before assigning it.", 403)
        next_status = "Assigned"
        _execute(
            f"UPDATE {TICKETS} SET assigned_to_user_id = {_literal(str(assignee['user_id']))}, "
            f"ticket_status = {_literal(next_status)}, is_active = true, last_updated = current_timestamp(), "
            f"acknowledged_at = CASE WHEN {'true' if acknowledged else 'false'} THEN current_timestamp() ELSE acknowledged_at END, "
            f"acknowledged_by_user_id = CASE WHEN {'true' if acknowledged else 'false'} THEN {_literal(str(actor['user_id']))} ELSE acknowledged_by_user_id END "
            f"WHERE ticket_id = {_literal(ticket_id.upper())}"
        )
        action_type = "ASSIGNED" if not old_assignee else "REASSIGNED"
        _record_event(ticket_id.upper(), actor, action_type, from_status=old_status, to_status=next_status,
                      from_assignee=str(old_assignee) if old_assignee else None,
                      to_assignee=str(assignee["user_id"]))
    elif operation == "set_status":
        if status not in STATUSES - {"Unassigned", "Assigned", "Declined"}:
            raise IncidentError("Choose one of the available ticket statuses.")
        _require_ticket_permission(ticket, actor)
        if status == old_status:
            raise IncidentError("That ticket already has this status.")
        _execute(
            f"UPDATE {TICKETS} SET ticket_status = {_literal(status)}, last_updated = current_timestamp() "
            f"WHERE ticket_id = {_literal(ticket_id.upper())}"
        )
        _record_event(ticket_id.upper(), actor, "STATUS_CHANGED", from_status=old_status, to_status=status)
    elif operation == "unassign":
        # The dashboard can be stale if another session already unassigned
        # the ticket. Treat that repeat request as an idempotent no-op so the
        # caller can refresh its snapshot instead of presenting a false error.
        if not old_assignee:
            return {"ticket": ticket, "activity": list_activity(), "no_op": True}
        _require_ticket_permission(ticket, actor)
        _execute(
            f"UPDATE {TICKETS} SET assigned_to_user_id = NULL, ticket_status = 'Unassigned', "
            f"last_updated = current_timestamp() WHERE ticket_id = {_literal(ticket_id.upper())}"
        )
        _record_event(ticket_id.upper(), actor, "UNASSIGNED", from_status=old_status,
                      to_status="Unassigned", from_assignee=str(old_assignee) if old_assignee else None)
    elif operation == "decline":
        _require_ticket_permission(ticket, actor, allow_unassigned=True)
        _execute(
            f"UPDATE {TICKETS} SET ticket_status = 'Declined', is_active = false, last_updated = current_timestamp() "
            f"WHERE ticket_id = {_literal(ticket_id.upper())}"
        )
        _record_event(ticket_id.upper(), actor, "DECLINED", from_status=old_status, to_status="Declined")
    else:
        raise IncidentError("Unsupported ticket action.")
    updated = _get_ticket(ticket_id.upper()) if operation != "decline" else None
    return {"ticket": updated, "activity": list_activity()}


def handle_incident_request(payload: dict) -> dict:
    """Process one LLM-classified read request or a fixed, guarded ticket action."""
    action = payload.get("action")
    if action == "snapshot":
        return {"kind": "snapshot", **dashboard_snapshot()}
    current_user = str(payload.get("current_user", "")).strip()
    actor = None
    if action == "investigation_guidance":
        if not current_user:
            raise IncidentError("Sign in to view investigation guidance.", 401)
        actor = _member(current_user)
        ticket = _get_ticket(str(payload.get("ticket_id", "")).strip().upper())
        if actor["role"] != "ADMIN" and str(ticket.get("assigned_to_user_id") or "") != str(actor["user_id"]):
            raise IncidentError("Investigation guidance is available to the assigned owner or Admin.", 403)
        return {"kind": "investigation_guidance", "investigation_action": True, "ticket": ticket}
    if action == "mutate":
        if not current_user:
            raise IncidentError("Sign in to change incident tickets.", 401)
        actor = _member(current_user)
        operation = str(payload.get("operation", ""))
        result = _apply_action(
            str(payload.get("ticket_id", "")), actor, operation,
            assignee_name=payload.get("assignee"), status=payload.get("status"),
        )
        return {"kind": "action_complete", "assignment_action": operation in {"assign_to_me", "assign_to_user", "acknowledge_assign"}, **result}
    if action != "chat":
        raise IncidentError("Unknown incident API action.")

    intent = classify_message(str(payload.get("message", "")), current_user)
    name = str(intent.get("intent", ""))
    if name == "other":
        return {"kind": "not_incident"}
    if name == "clarify":
        return {"kind": "clarification", "message": str(intent.get("question", "Which ticket or action do you mean?"))}
    if name == "list_tickets":
        filter_name = str(intent.get("filter", "all"))
        actor = _member(current_user) if current_user else None
        if filter_name == "mine" and not actor:
            raise IncidentError("Sign in to see tickets assigned to you.", 401)
        tickets = _tickets(filter_name, current_user=actor, assignee_name=intent.get("assignee"), ticket_id=intent.get("ticket_id"))
        return {"kind": "ticket_list", "summary": str(intent.get("summary", "Here are the matching tickets.")), "tickets": tickets, "activity": list_activity()}
    if not current_user:
        raise IncidentError("Sign in to manage incident tickets.", 401)
    actor = _member(current_user)
    ticket_id = str(intent.get("ticket_id", "")).strip().upper()
    if not ticket_id:
        return {"kind": "clarification", "message": "Which ticket number should I use?"}
    ticket = _get_ticket(ticket_id)
    if name == "change_status":
        if not ticket.get("is_active"):
            raise IncidentError("This ticket is no longer active and cannot be changed.", 409)
        _require_ticket_permission(ticket, actor)
        return {"kind": "status_selection", "summary": f"Choose a status for {ticket_id}.", "ticket": ticket,
                "statuses": ["In Progress", "Blocked", "Waiting for Info", "Completed"]}
    if name == "decline":
        _require_ticket_permission(ticket, actor, allow_unassigned=True)
        result = _apply_action(ticket_id, actor, "decline")
        return {"kind": "action_complete", "message": f"{ticket_id} was declined.", **result}
    if name == "assign":
        requested = str(intent.get("assignee") or "").strip()
        if requested.lower() == "me":
            result = _apply_action(ticket_id, actor, "assign_to_me")
        elif requested:
            if actor["role"] != "ADMIN" and ticket.get("assigned_to_user_id") != actor["user_id"]:
                raise IncidentError("Only the ticket owner or Admin can reassign an assigned ticket.", 403)
            result = _apply_action(ticket_id, actor, "assign_to_user", assignee_name=requested)
        else:
            return {"kind": "assignee_selection", "summary": f"Choose an owner for {ticket_id}.", "ticket": ticket,
                    "assignees": sorted(ASSIGNABLE)}
        return {"kind": "action_complete", "assignment_action": True,
                "message": f"{ticket_id} was assigned to {actor['display_name'] if requested.lower() == 'me' else requested}.", **result}
    raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422)
