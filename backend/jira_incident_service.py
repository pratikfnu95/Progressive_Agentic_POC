"""Jira-backed incident tickets for the Incident Management workspace."""

from __future__ import annotations

import base64
import json
import re
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from pathlib import Path
from urllib.request import Request, urlopen

from backend.agent_workspace.integrations import IntegrationCheckError, _jira_settings
from backend.deepseek_client import chat_completion


ISSUE_CATEGORIES = {
    "Premium mismatch", "Missing coverage data", "Incorrect policy status", "Duplicate transaction",
    "Missing source data", "ADF pipeline failure", "Informatica mapping issue", "Missing downstream data",
}
PRIORITIES = {"Low", "Medium", "High", "Urgent"}
ASSIGNABLE = ("Pratik", "Sarvesh", "Madhu", "Saurabh")
KNOWN_TEAM_NAMES = ("Pratik", "Sarvesh", "Madhu", "Saurabh", "Admin")
TICKET_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]+-\d+$", re.I)
INCIDENT_DOMAIN_RE = re.compile(r"\b(?:incidents?|tickets?|jira)\b", re.I)
PROMPT_PATH = Path(__file__).with_name("prompts") / "incident_intent.md"


class IncidentError(RuntimeError):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _jira_request(method: str, path: str, payload: dict | None = None):
    try:
        base_url, email, token, _ = _jira_settings()
        credential = base64.b64encode(f"{email}:{token}".encode("utf-8")).decode("ascii")
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(
            f"{base_url}{path}", data=data, method=method,
            headers={"Authorization": f"Basic {credential}", "Accept": "application/json", "Content-Type": "application/json"},
        )
        with urlopen(request, timeout=25) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:1200]
        if error.code == 401:
            raise IncidentError("Jira rejected the configured account credentials.", 502) from None
        if error.code == 403:
            raise IncidentError("Jira denied access. Check project browse, create, edit, assign, and transition permissions.", 403) from None
        if error.code == 404:
            raise IncidentError("The Jira issue or project could not be found.", 404) from None
        if error.code == 429:
            raise IncidentError("Jira rate-limited this request. Try again shortly.", 503) from None
        raise IncidentError(f"Jira returned HTTP {error.code}: {detail or 'request failed'}", 502) from None
    except (URLError, TimeoutError) as error:
        raise IncidentError(f"Could not reach Jira ({type(error).__name__}).", 502) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise IncidentError("Jira returned an unreadable response.", 502) from None
    except IntegrationCheckError as error:
        raise IncidentError(str(error), error.status_code) from None


def _adf_text(value) -> str:
    if isinstance(value, dict):
        parts = [_adf_text(child) for child in value.get("content", [])]
        if value.get("type") in {"paragraph", "heading", "listItem"}:
            return "".join(parts) + "\n"
        if value.get("type") == "text":
            return str(value.get("text") or "")
        return "".join(parts)
    if isinstance(value, list):
        return "".join(_adf_text(child) for child in value)
    return str(value or "")


def _field_text(fields: dict, label: str) -> str:
    text = _adf_text(fields.get("description") or "")
    match = re.search(rf"(?im)^\s*{re.escape(label)}\s*:\s*(.+?)\s*$", text)
    return match.group(1).strip() if match else ""


def _map_status(status: str, assignee: str | None) -> str:
    normalized = (status or "").strip().casefold()
    if normalized in {"declined", "cancelled", "canceled"}:
        return "Declined"
    if normalized in {"done", "closed", "resolved", "complete", "completed"}:
        return "Completed"
    if normalized in {"blocked", "impediment"}:
        return "Blocked"
    if normalized in {"waiting for info", "waiting for customer", "pending info"}:
        return "Waiting for Info"
    if normalized in {"in progress", "in development", "in review", "reopened"}:
        return "In Progress"
    return "Assigned" if assignee else "Unassigned"


def _map_priority(priority: dict | None) -> str:
    name = str((priority or {}).get("name") or "Medium").casefold()
    if name in {"highest", "blocker", "critical", "urgent"}:
        return "Urgent"
    if name in {"high", "major"}:
        return "High"
    if name in {"low", "lowest", "minor", "trivial"}:
        return "Low"
    return "Medium"


def _normalize_issue(issue: dict) -> dict:
    fields = issue.get("fields") or {}
    key = str(issue.get("key") or "")
    description = _adf_text(fields.get("description") or "").strip()
    labels = fields.get("labels") or []
    category = _field_text(fields, "Category")
    if category not in ISSUE_CATEGORIES:
        category = next((str(label).removeprefix("incident-").replace("-", " ").title() for label in labels if str(label).startswith("incident-")), "")
        category = category if category in ISSUE_CATEGORIES else "Data issue / ETL investigation"
    assignee = fields.get("assignee") or {}
    creator = fields.get("creator") or fields.get("reporter") or {}
    priority = _map_priority(fields.get("priority"))
    status = _map_status(str((fields.get("status") or {}).get("name") or ""), assignee.get("displayName"))
    created = fields.get("created") or ""
    updated = fields.get("updated") or created
    policy_ids = re.findall(r"\b(?:WC|POL)-[A-Z0-9-]+\b", description, re.I)
    return {
        "ticket_id": key,
        "issue_summary": str(fields.get("summary") or "(No summary)"),
        "issue_description": description,
        "issue_category": category,
        "ticket_status": status,
        "assigned_to": assignee.get("displayName") or None,
        "assigned_to_user_id": (assignee.get("displayName") or "").casefold() or None,
        "is_active": status not in {"Completed", "Declined"},
        "created_at": created,
        "last_updated": updated,
        "acknowledged_at": created if assignee else None,
        "acknowledged_by": assignee.get("displayName") if assignee else None,
        "requester_full_name": _field_text(fields, "Requester"),
        "priority": priority,
        "severity": priority,
        "created_by_name": creator.get("displayName") or "—",
        "related_policies": [{"policy_number": policy, "policy_status": ""} for policy in dict.fromkeys(policy_ids)],
        "jira_url": (issue.get("self") or "").split("/rest/api/")[0] + "/browse/" + key if key else "",
    }


def _list_issues(max_results: int = 100) -> list[dict]:
    _, _, _, project_key = _jira_settings()
    fields = "summary,description,status,priority,creator,reporter,assignee,created,updated,labels,issuetype"
    query = urlencode({"jql": f'project = "{project_key}" ORDER BY created DESC', "maxResults": str(max_results), "fields": fields})
    payload = _jira_request("GET", f"/rest/api/3/search/jql?{query}")
    return [ticket for issue in payload.get("issues", []) if isinstance(issue, dict)
            for ticket in [_normalize_issue(issue)] if ticket["ticket_status"] != "Declined"]


def list_members() -> list[dict]:
    return [{"user_id": name.casefold(), "display_name": name, "role": "ADMIN" if name == "Admin" else "USER", "is_active": True} for name in KNOWN_TEAM_NAMES]


def _member(name: str) -> dict:
    user = next((row for row in list_members() if row["display_name"].casefold() == str(name or "").casefold()), None)
    if not user:
        raise IncidentError("That account is not present or active in the incident team roster.", 403)
    return user


def _member_by_id(user_id: str) -> dict:
    user = next((row for row in list_members() if row["user_id"] == str(user_id or "").casefold()), None)
    if not user:
        raise IncidentError("That account is not present or active in the incident team roster.", 403)
    return user


def _ticket(ticket_id: str) -> dict:
    if not TICKET_KEY_RE.fullmatch(ticket_id or ""):
        raise IncidentError("Provide a valid Jira issue key.")
    encoded = quote(ticket_id.upper(), safe="")
    fields = "summary,description,status,priority,creator,reporter,assignee,created,updated,labels,issuetype"
    issue = _jira_request("GET", f"/rest/api/3/issue/{encoded}?{urlencode({'fields': fields})}")
    return _normalize_issue(issue)


def _jira_user(name: str, project_key: str) -> dict:
    matches = _jira_request("GET", "/rest/api/3/user/assignable/search?" + urlencode({"project": project_key, "query": name, "maxResults": "100"}))
    user = next((item for item in matches if item.get("active") and item.get("accountId") and str(item.get("displayName") or "").casefold() == name.casefold()), None)
    if not user:
        raise IncidentError(f"Jira user '{name}' is not assignable in project {project_key}.", 422)
    return user


def _activity(issues: list[dict], limit: int = 6) -> list[dict]:
    events = []
    for ticket in issues[:6]:
        events.append({
            "id": f"{ticket['ticket_id']}:created",
            "ticket_id": ticket["ticket_id"],
            "timestamp": ticket.get("created_at"),
            "message": f"{ticket['ticket_id']} created by {ticket.get('created_by_name') or 'Jira user'}",
            "tone": "blue",
        })
        key = quote(ticket["ticket_id"], safe="")
        try:
            payload = _jira_request("GET", f"/rest/api/3/issue/{key}/changelog?{urlencode({'maxResults': '10'})}")
        except IncidentError:
            continue
        for history in payload.get("values", []):
            author = (history.get("author") or {}).get("displayName") or "Jira user"
            changes = history.get("items") or []
            for change in changes:
                field = str(change.get("field") or "").casefold()
                if field == "status":
                    message = f"{ticket['ticket_id']} status changed to {change.get('toString') or 'updated'} by {author}"
                elif field == "assignee":
                    to_name = change.get("toString") or "Unassigned"
                    message = f"{ticket['ticket_id']} assigned to {to_name} by {author}"
                else:
                    continue
                events.append({"id": f"{ticket['ticket_id']}:{history.get('id')}:{field}", "ticket_id": ticket["ticket_id"], "timestamp": history.get("created"), "message": message, "tone": "blue"})
    events.sort(key=lambda event: str(event.get("timestamp") or ""), reverse=True)
    return events[:limit]


def dashboard_snapshot() -> dict:
    tickets = _list_issues()
    return {"tickets": tickets, "activity": _activity(tickets)}


def _authorize_ticket(ticket: dict, actor: dict, *, allow_unassigned: bool = False) -> None:
    if actor["role"] == "ADMIN":
        return
    owner = str(ticket.get("assigned_to_user_id") or "")
    if owner and owner != actor["user_id"]:
        raise IncidentError("You don't have permission to change this ticket.", 403)
    if not owner and not allow_unassigned:
        raise IncidentError("Acknowledge this unassigned ticket before changing its status.", 403)


def _set_jira_assignee(ticket_id: str, name: str | None) -> None:
    _, _, _, project_key = _jira_settings()
    account_id = _jira_user(name, project_key)["accountId"] if name else None
    _jira_request("PUT", f"/rest/api/3/issue/{quote(ticket_id, safe='')}/assignee", {"accountId": account_id})


def _transition(ticket_id: str, status: str) -> None:
    transitions = _jira_request("GET", f"/rest/api/3/issue/{quote(ticket_id, safe='')}/transitions").get("transitions", [])
    target = status.casefold()
    aliases = {"completed": {"done", "complete", "completed", "resolve", "resolved", "close", "closed"}, "in progress": {"in progress", "start progress"}, "blocked": {"blocked"}, "waiting for info": {"waiting for info", "pending"}, "declined": {"declined", "cancelled", "canceled"}}
    accepted = aliases.get(target, {target})
    choice = next((item for item in transitions if str((item.get("to") or {}).get("name") or item.get("name") or "").casefold() in accepted), None)
    if not choice:
        raise IncidentError(f"Jira does not offer a workflow transition to {status} for this issue.", 409)
    _jira_request("POST", f"/rest/api/3/issue/{quote(ticket_id, safe='')}/transitions", {"transition": {"id": choice["id"]}})


def _apply_action(ticket_id: str, actor: dict, operation: str, *, assignee_name=None, status=None) -> dict:
    ticket = _ticket(ticket_id)
    _authorize_ticket(ticket, actor, allow_unassigned=operation in {"assign_to_me", "acknowledge_assign", "decline"})
    if operation in {"assign_to_me", "acknowledge_assign"}:
        assignee_name = actor["display_name"]
    if operation in {"assign_to_me", "assign_to_user", "acknowledge_assign"}:
        if assignee_name not in ASSIGNABLE:
            raise IncidentError("Choose an incident team member as the ticket owner.")
        _set_jira_assignee(ticket["ticket_id"], assignee_name)
    elif operation == "unassign":
        if not ticket.get("assigned_to"):
            return {"ticket": ticket, "activity": _activity([ticket]), "no_op": True}
        _set_jira_assignee(ticket["ticket_id"], None)
    elif operation == "set_status":
        if status not in {"In Progress", "Blocked", "Waiting for Info", "Completed"}:
            raise IncidentError("Choose one of the available ticket statuses.")
        if status == ticket.get("ticket_status"):
            raise IncidentError("That ticket already has this status.")
        _transition(ticket["ticket_id"], status)
    elif operation == "decline":
        _transition(ticket["ticket_id"], "Declined")
    else:
        raise IncidentError("Unsupported ticket action.")
    updated = _ticket(ticket["ticket_id"])
    return {"ticket": updated, "activity": _activity([updated])}


def create_ticket(payload: dict, actor: dict) -> dict:
    summary = str(payload.get("issue_summary", "")).strip()
    description = str(payload.get("issue_description", "")).strip()
    requester = str(payload.get("requester_full_name", "")).strip()
    category = str(payload.get("issue_category", "")).strip()
    priority = str(payload.get("priority", "")).strip().title()
    assignee_name = str(payload.get("assigned_to", "")).strip()
    if not 8 <= len(summary) <= 160:
        raise IncidentError("Enter an issue summary between 8 and 160 characters.")
    if description and not 10 <= len(description) <= 3000:
        raise IncidentError("Enter an issue description between 10 and 3,000 characters.")
    if not 2 <= len(requester) <= 120:
        raise IncidentError("Enter the customer or requester's full name.")
    if category not in ISSUE_CATEGORIES:
        raise IncidentError("Choose an incident category from the available list.")
    if priority not in PRIORITIES:
        raise IncidentError("Choose Low, Medium, High, or Urgent priority.")
    if assignee_name == "Leave unassigned":
        assignee_name = ""
    _, _, _, project_key = _jira_settings()
    jira_priority = {"Urgent": "Highest", "High": "High", "Medium": "Medium", "Low": "Low"}[priority]
    fields = {
        "project": {"key": project_key}, "issuetype": {"name": "Task"}, "summary": summary,
        "description": {"type": "doc", "version": 1, "content": [{"type": "paragraph", "content": [{"type": "text", "text": line}]} for line in [f"Category: {category}", f"Requester: {requester}", f"Priority: {priority}", "", description] if line]},
        "priority": {"name": jira_priority}, "labels": ["incident-management", "incident-" + re.sub(r"[^a-z0-9]+", "-", category.casefold()).strip("-")],
    }
    if assignee_name:
        if assignee_name not in ASSIGNABLE:
            raise IncidentError("Choose an incident team member to own this ticket.")
        fields["assignee"] = {"accountId": _jira_user(assignee_name, project_key)["accountId"]}
    created = _jira_request("POST", "/rest/api/3/issue", {"fields": fields})
    ticket = _ticket(str(created.get("key") or ""))
    return {"kind": "action_complete", "assignment_action": bool(assignee_name), "ticket": ticket, "activity": _activity([ticket]), "message": f"{ticket['ticket_id']} was created in Jira."}


def classify_message(question: str, current_user: str = "Not signed in") -> dict:
    if not question or len(question) > 2000:
        raise IncidentError("Enter a ticket question or action under 2,000 characters.")
    prompt = PROMPT_PATH.read_text(encoding="utf-8").replace("$CURRENT_USER", current_user or "Not signed in")
    prompt = prompt.replace("$TEAM_ROSTER", ", ".join(KNOWN_TEAM_NAMES)).replace("$USER_MESSAGE", question)
    answer = chat_completion([{"role": "system", "content": "Classify incident requests. Output valid JSON only."}, {"role": "user", "content": prompt}], max_tokens=400, thinking=False)["answer"].strip()
    if answer.startswith("```"):
        answer = re.sub(r"^```(?:json)?\s*|\s*```$", "", answer, flags=re.I)
    try:
        intent = json.loads(answer)
    except json.JSONDecodeError:
        raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422) from None
    if not isinstance(intent, dict) or intent.get("intent") not in {"list_tickets", "assign", "change_status", "decline", "create_ticket", "clarify", "other"}:
        raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422)
    # The chat UI tries the incident route before the policy SQL route. Keep
    # ambiguous ticket-domain messages here instead of letting a missed intent
    # fall through to Databricks SQL.
    if intent.get("intent") == "other" and (
        INCIDENT_DOMAIN_RE.search(question) or _mentions_configured_jira_key(question)
    ):
        return {
            "intent": "clarify",
            "question": "I can help with Jira incident tickets. Include a Jira ticket key (for example, KAN-25) or ask to list, create, assign, or update a ticket.",
        }
    return intent


def _require_current_user(current_user: str) -> dict:
    if not current_user:
        raise IncidentError("Sign in to manage incident tickets.", 401)
    return _member(current_user)


def _mentions_configured_jira_key(question: str) -> bool:
    try:
        _, _, _, project_key = _jira_settings()
    except IntegrationCheckError:
        return False
    if not project_key:
        return False
    return bool(re.search(rf"\b{re.escape(project_key)}-\d+\b", question, re.I))


def handle_incident_request(payload: dict) -> dict:
    action = payload.get("action")
    if action == "snapshot":
        return {"kind": "snapshot", **dashboard_snapshot()}
    current_user = str(payload.get("current_user", "")).strip()
    if action == "investigation_guidance":
        actor = _require_current_user(current_user)
        ticket = _ticket(str(payload.get("ticket_id", "")).strip().upper())
        _authorize_ticket(ticket, actor)
        return {"kind": "investigation_guidance", "investigation_action": True, "ticket": ticket}
    if action == "mutate":
        actor = _require_current_user(current_user)
        operation = str(payload.get("operation", ""))
        result = _apply_action(str(payload.get("ticket_id", "")), actor, operation, assignee_name=payload.get("assignee"), status=payload.get("status"))
        return {"kind": "action_complete", "assignment_action": operation in {"assign_to_me", "assign_to_user", "acknowledge_assign"}, **result}
    if action == "create_ticket":
        return create_ticket(payload, _require_current_user(current_user))
    if action != "chat":
        raise IncidentError("Unknown incident API action.")
    intent = classify_message(str(payload.get("message", "")), current_user)
    name = str(intent.get("intent") or "")
    if name == "other":
        return {"kind": "not_incident"}
    if name == "clarify":
        return {"kind": "clarification", "message": str(intent.get("question", "Which ticket or action do you mean?"))}
    if name == "create_ticket":
        _require_current_user(current_user)
        return {"kind": "ticket_creation_form", "summary": "I can help create an incident ticket. Add the issue details below; it will be assigned to you and appear on the Incident Management dashboard."}
    if name == "list_tickets":
        filter_name = str(intent.get("filter", "all"))
        tickets = _list_issues()
        if filter_name == "unassigned":
            tickets = [ticket for ticket in tickets if not ticket.get("assigned_to") and ticket["ticket_status"] == "Unassigned"]
        elif filter_name == "mine":
            actor = _require_current_user(current_user)
            tickets = [ticket for ticket in tickets if str(ticket.get("assigned_to_user_id") or "") == actor["user_id"]]
        elif filter_name == "by_assignee":
            assignee = str(intent.get("assignee") or "")
            tickets = [ticket for ticket in tickets if str(ticket.get("assigned_to") or "").casefold() == assignee.casefold()]
        elif filter_name == "ticket":
            key = str(intent.get("ticket_id") or "").upper()
            tickets = [ticket for ticket in tickets if ticket["ticket_id"] == key]
        return {"kind": "ticket_list", "summary": str(intent.get("summary", "Here are the matching tickets.")), "tickets": tickets, "activity": _activity(tickets)}
    actor = _require_current_user(current_user)
    ticket_id = str(intent.get("ticket_id") or "").strip().upper()
    if not ticket_id:
        return {"kind": "clarification", "message": "Which Jira ticket number should I use?"}
    ticket = _ticket(ticket_id)
    if name == "change_status":
        _authorize_ticket(ticket, actor)
        return {"kind": "status_selection", "summary": f"Choose a status for {ticket_id}.", "ticket": ticket, "statuses": ["In Progress", "Blocked", "Waiting for Info", "Completed"]}
    if name == "decline":
        result = _apply_action(ticket_id, actor, "decline")
        return {"kind": "action_complete", "message": f"{ticket_id} was declined.", **result}
    if name == "assign":
        requested = str(intent.get("assignee") or "").strip()
        if requested.casefold() == "me":
            result = _apply_action(ticket_id, actor, "assign_to_me")
        elif requested:
            result = _apply_action(ticket_id, actor, "assign_to_user", assignee_name=requested)
        else:
            return {"kind": "assignee_selection", "summary": f"Choose an owner for {ticket_id}.", "ticket": ticket, "assignees": list(ASSIGNABLE)}
        return {"kind": "action_complete", "assignment_action": True, "message": f"{ticket_id} was assigned to {requested or actor['display_name']}.", **result}
    raise IncidentError("I couldn't interpret that ticket request. Please rephrase it.", 422)
