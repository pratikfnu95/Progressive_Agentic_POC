"""Read-only connection checks for the Agent Workspace's Outlook and Jira links."""

from __future__ import annotations

import base64
import html
import json
import os
import re
import secrets
import threading
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from dotenv import dotenv_values


ENV_PATH = Path(__file__).with_name(".env")

GRAPH_SCOPE = "https://graph.microsoft.com/Mail.ReadWrite"
GRAPH_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send"
GRAPH_INBOX_URL = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"
GRAPH_SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail"
_OUTLOOK_SEND_LOCK = threading.Lock()
_OUTLOOK_AUTH_LOCK = threading.Lock()
_OUTLOOK_AUTH_FLOWS: dict[str, dict[str, object]] = {}
_OUTLOOK_ACTIVE_AUTH_FLOW_ID: str | None = None
_OUTLOOK_SCOPES = [GRAPH_SCOPE, GRAPH_SEND_SCOPE]


class IntegrationCheckError(RuntimeError):
    def __init__(self, message: str, status_code: int = 400, code: str = "connection_failed"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def _setting(name: str, default: str = "") -> str:
    """Read live environment values, falling back to the local workspace .env."""
    value = os.getenv(name, "").strip()
    if value:
        return value
    return str(dotenv_values(ENV_PATH).get(name) or default).strip()


def _outlook_settings() -> tuple[str, str, Path]:
    client_id = _setting("OUTLOOK_CLIENT_ID")
    tenant_id = _setting("OUTLOOK_TENANT_ID", "consumers")
    cache_setting = _setting("OUTLOOK_TOKEN_CACHE_PATH")
    if not client_id:
        raise IntegrationCheckError("Outlook client ID is not configured.", code="not_configured")
    if not cache_setting:
        raise IntegrationCheckError("Outlook token-cache path is not configured.", code="not_configured")
    cache_path = Path(cache_setting).expanduser()
    if not cache_path.is_absolute():
        cache_path = (ENV_PATH.parent / cache_path).resolve()
    return client_id, tenant_id, cache_path


def _get_outlook_token(scopes: list[str] | None = None) -> str:
    requested_scopes = scopes or [GRAPH_SCOPE]
    client_id, tenant_id, cache_path = _outlook_settings()
    try:
        import msal
        from msal_extensions import PersistedTokenCache, build_encrypted_persistence
    except ImportError as error:
        raise IntegrationCheckError(
            "Outlook support is missing from this Python environment. Install the Agent Workspace requirements.",
            status_code=503,
            code="dependency_missing",
        ) from error

    try:
        persistence = build_encrypted_persistence(str(cache_path))
        token_cache = PersistedTokenCache(persistence)
        app = msal.PublicClientApplication(
            client_id=client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            token_cache=token_cache,
        )
        accounts = app.get_accounts()
    except Exception as error:
        raise IntegrationCheckError(
            f"Could not open the saved Outlook sign-in cache ({type(error).__name__}).",
            status_code=503,
            code="token_cache_unavailable",
        ) from None

    if not accounts:
        raise IntegrationCheckError(
            "No saved Outlook sign-in was found. Click Connect in the Outlook connection card to sign in once.",
            status_code=409,
            code="sign_in_required",
        )

    try:
        result = app.acquire_token_silent(requested_scopes, account=accounts[0])
    except Exception as error:
        raise IntegrationCheckError(
            f"Could not renew the saved Outlook sign-in ({type(error).__name__}).",
            status_code=503,
            code="token_refresh_failed",
        ) from None

    access_token = result.get("access_token") if result else None
    if not access_token:
        if GRAPH_SEND_SCOPE in requested_scopes:
            raise IntegrationCheckError(
                "Outlook sending needs Mail.Send consent. Click Connect in the Outlook connection card and approve the requested access.",
                status_code=409,
                code="mail_send_consent_required",
            )
        raise IntegrationCheckError(
            "Outlook needs a fresh sign-in. Click Connect in the Outlook connection card, then retry.",
            status_code=409,
            code="sign_in_required",
        )
    return access_token


def start_outlook_sign_in() -> dict[str, object]:
    """Start a UI-driven device sign-in and persist its tokens to the configured cache."""
    global _OUTLOOK_ACTIVE_AUTH_FLOW_ID
    client_id, tenant_id, cache_path = _outlook_settings()
    try:
        import msal
        from msal_extensions import PersistedTokenCache, build_encrypted_persistence
        token_cache = PersistedTokenCache(build_encrypted_persistence(str(cache_path)))
        client = msal.PublicClientApplication(
            client_id=client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            token_cache=token_cache,
        )
    except ImportError as error:
        raise IntegrationCheckError(
            "Outlook authentication support is missing. Install the Agent Workspace requirements.",
            status_code=503,
            code="dependency_missing",
        ) from error
    except Exception as error:
        raise IntegrationCheckError(
            f"Could not open the encrypted Outlook token cache ({type(error).__name__}).",
            status_code=503,
            code="token_cache_unavailable",
        ) from None

    with _OUTLOOK_AUTH_LOCK:
        if _OUTLOOK_ACTIVE_AUTH_FLOW_ID:
            active = _OUTLOOK_AUTH_FLOWS.get(_OUTLOOK_ACTIVE_AUTH_FLOW_ID)
            if active and active.get("status") == "pending" and float(active.get("expires_at") or 0) > time.time():
                return _public_outlook_auth_flow(_OUTLOOK_ACTIVE_AUTH_FLOW_ID, active)

        accounts = client.get_accounts()
        if accounts:
            try:
                token = client.acquire_token_silent(_OUTLOOK_SCOPES, account=accounts[0])
            except Exception:
                token = None
            if token and token.get("access_token"):
                return {"status": "connected", "message": "Outlook is already connected on this device."}

        try:
            flow = client.initiate_device_flow(scopes=_OUTLOOK_SCOPES)
        except Exception as error:
            raise IntegrationCheckError(
                f"Could not start Microsoft sign-in ({type(error).__name__}).",
                status_code=502,
                code="device_flow_start_failed",
            ) from None
        if not flow or not flow.get("user_code") or not flow.get("verification_uri"):
            raise IntegrationCheckError(
                "Microsoft could not start sign-in. Check the app registration and try again later.",
                status_code=502,
                code="device_flow_start_failed",
            )

        flow_id = secrets.token_urlsafe(24)
        expires_at = time.time() + int(flow.get("expires_in") or 900)
        record: dict[str, object] = {
            "status": "pending",
            "user_code": str(flow["user_code"]),
            "verification_uri": str(flow["verification_uri"]),
            "expires_at": expires_at,
            "message": "Complete Microsoft sign-in in the browser. Outlook will be connected automatically after approval.",
        }
        _OUTLOOK_AUTH_FLOWS[flow_id] = record
        _OUTLOOK_ACTIVE_AUTH_FLOW_ID = flow_id
        worker = threading.Thread(
            target=_finish_outlook_device_flow,
            args=(client, flow, flow_id),
            daemon=True,
            name="outlook-device-auth",
        )
        worker.start()
        return _public_outlook_auth_flow(flow_id, record)


def _finish_outlook_device_flow(client, flow: dict, flow_id: str) -> None:
    global _OUTLOOK_ACTIVE_AUTH_FLOW_ID
    try:
        result = client.acquire_token_by_device_flow(flow)
        if result and result.get("access_token"):
            status = "connected"
            message = "Outlook connected. This device will reuse the saved sign-in automatically."
        else:
            status = "error"
            error_code = str((result or {}).get("error") or "")
            message = (
                "Microsoft requires another sign-in method or a later retry. No token was saved."
                if error_code in {"authorization_declined", "expired_token", "code_expired"}
                else "Microsoft sign-in did not complete. No token was saved. Try another sign-in method or retry later."
            )
    except Exception:
        status = "error"
        message = "Microsoft sign-in did not complete. No token was saved. Try another sign-in method or retry later."

    with _OUTLOOK_AUTH_LOCK:
        record = _OUTLOOK_AUTH_FLOWS.get(flow_id)
        if record:
            record["status"] = status
            record["message"] = message
            record.pop("user_code", None)
            record.pop("verification_uri", None)
            record.pop("expires_at", None)
        if _OUTLOOK_ACTIVE_AUTH_FLOW_ID == flow_id:
            _OUTLOOK_ACTIVE_AUTH_FLOW_ID = None


def _public_outlook_auth_flow(flow_id: str, record: dict[str, object]) -> dict[str, object]:
    response = {key: value for key, value in record.items() if key in {"status", "user_code", "verification_uri", "message"}}
    response["flow_id"] = flow_id
    if record.get("status") == "pending":
        response["expires_in"] = max(0, int(float(record.get("expires_at") or time.time()) - time.time()))
    return response


def get_outlook_sign_in_status(flow_id: str) -> dict[str, object]:
    with _OUTLOOK_AUTH_LOCK:
        record = _OUTLOOK_AUTH_FLOWS.get(flow_id)
        if not record:
            raise IntegrationCheckError(
                "This Outlook sign-in request expired. Start a new connection from Agent Workspace.",
                status_code=404,
                code="device_flow_not_found",
            )
        if record.get("status") == "pending" and float(record.get("expires_at") or 0) <= time.time():
            record["status"] = "expired"
            record["message"] = "The Microsoft sign-in code expired. Start a new connection from Agent Workspace."
            record.pop("user_code", None)
            record.pop("verification_uri", None)
            record.pop("expires_at", None)
        return _public_outlook_auth_flow(flow_id, record)


def _outlook_report_recipient() -> str:
    """Return the explicitly configured mailbox for POC report emails."""
    recipient = _setting("OUTLOOK_REPORT_RECIPIENT")
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
        raise IntegrationCheckError(
            "Set OUTLOOK_REPORT_RECIPIENT in backend/agent_workspace/.env to the Outlook inbox that should receive report emails.",
            status_code=409,
            code="report_recipient_not_configured",
        )
    return recipient


def send_outlook_test_email(subject: str, body: str, report_id: str) -> dict[str, object]:
    """Send an edited POC report email to the explicitly configured recipient."""
    clean_subject = re.sub(r"[\r\n]+", " ", str(subject or "")).strip()
    clean_body = str(body or "").strip()
    clean_report_id = str(report_id or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", clean_report_id):
        raise IntegrationCheckError("The POC report reference is invalid. Generate a new sample and retry.", code="invalid_report_id")
    if not clean_subject or len(clean_subject) > 240:
        raise IntegrationCheckError("Subject is required and must be 240 characters or fewer.", code="invalid_subject")
    if not clean_body or len(clean_body) > 12_000:
        raise IntegrationCheckError("Description is required and must be 12,000 characters or fewer.", code="invalid_body")

    marker = f"[POC-REPORT:{clean_report_id}]"
    if marker not in clean_subject:
        clean_subject = f"{clean_subject[:210].rstrip()} {marker}"
    if marker not in clean_body:
        clean_body = f"{clean_body}\n\nPOC reference: {marker}"
    if len(clean_body) > 12_000:
        raise IntegrationCheckError("Description is too long after adding the required POC reference.", code="invalid_body")

    with _OUTLOOK_SEND_LOCK:
        from backend.agent_workspace.state import read_state, update_state, utc_now
        state = read_state()
        sent_reports = state.get("sent_report_emails", [])
        existing = next((item for item in sent_reports if item.get("report_id") == clean_report_id), None)
        if existing:
            return {"sent": True, "outlook_accepted": True, "already_sent": True, **existing}

        token = _get_outlook_token([GRAPH_SCOPE, GRAPH_SEND_SCOPE])
        recipient = _outlook_report_recipient()
        payload = {
            "message": {
                "subject": clean_subject,
                "body": {"contentType": "Text", "content": clean_body},
                "toRecipients": [{"emailAddress": {"address": recipient}}],
            },
            "saveToSentItems": True,
        }
        request = Request(
            GRAPH_SEND_URL,
            data=json.dumps(payload).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
                "Content-Type": "application/json",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                if response.status not in (200, 202):
                    raise IntegrationCheckError(f"Microsoft Graph returned HTTP {response.status} while sending the report email.", status_code=502, code="send_failed")
        except HTTPError as error:
            if error.code == 403:
                raise IntegrationCheckError(
                    "Outlook denied email sending. Confirm the app registration has delegated Mail.Send and run `python3 standalone_outlook_test/authorize_outlook_send.py` once.",
                    status_code=502,
                    code="mail_send_permission_denied",
                ) from None
            raise IntegrationCheckError(f"Microsoft Graph returned HTTP {error.code} while sending the report email.", status_code=502, code="send_failed") from None
        except (URLError, TimeoutError) as error:
            raise IntegrationCheckError(f"Could not reach Microsoft Graph ({type(error).__name__}).", status_code=502, code="network_error") from None

        sent_record = {
            "report_id": clean_report_id,
            "recipient": recipient,
            "subject": clean_subject,
            "sent_at": utc_now(),
        }
        update_state(sent_report_emails=(sent_reports + [sent_record])[-1000:])
        return {"sent": True, "outlook_accepted": True, "already_sent": False, **sent_record}


def send_jira_ticket_notification(ticket_key: str, summary: str, priority: str, jira_url: str) -> dict[str, str]:
    """Send the concise Jira assignment notice to the single configured POC recipient."""
    clean_key = re.sub(r"[^A-Z0-9-]", "", str(ticket_key or "").upper())
    clean_summary = re.sub(r"[\r\n]+", " ", str(summary or "")).strip()[:250]
    clean_priority = re.sub(r"[\r\n]+", " ", str(priority or "Medium")).strip()[:40]
    parsed_jira_url = urlsplit(str(jira_url or ""))
    if not clean_key or not clean_summary or parsed_jira_url.scheme != "https" or not parsed_jira_url.netloc:
        raise IntegrationCheckError("The Jira ticket details are incomplete; notification was not sent.", code="invalid_ticket_notification")

    recipient = "smartwealthai15@outlook.com"
    subject = f"Jira ticket {clean_key} assigned to you"
    body = (
        "<p>Hi Pratik,</p>"
        f"<p>Jira ticket <strong>{html.escape(clean_key)}</strong> has been created and assigned to you for "
        f"<strong>{html.escape(clean_summary)}</strong> ({html.escape(clean_priority)}).</p>"
        f'<p><a href="{html.escape(str(jira_url), quote=True)}">Click here for more detail.</a></p>'
    )
    token = _get_outlook_token([GRAPH_SCOPE, GRAPH_SEND_SCOPE])
    payload = {
        "message": {
            "subject": subject,
            "body": {"contentType": "HTML", "content": body},
            "toRecipients": [{"emailAddress": {"address": recipient}}],
        },
        "saveToSentItems": True,
    }
    request = Request(
        GRAPH_SEND_URL,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            if response.status not in (200, 202):
                raise IntegrationCheckError(f"Microsoft Graph returned HTTP {response.status} while sending the Jira notification.", status_code=502, code="notification_failed")
    except HTTPError as error:
        if error.code == 403:
            raise IntegrationCheckError(
                "Outlook denied the Jira notification. Confirm Mail.Send consent in the Outlook connection card, then reconnect Outlook.",
                status_code=502,
                code="mail_send_permission_denied",
            ) from None
        raise IntegrationCheckError(f"Microsoft Graph returned HTTP {error.code} while sending the Jira notification.", status_code=502, code="notification_failed") from None
    except (URLError, TimeoutError) as error:
        raise IntegrationCheckError(f"Could not reach Microsoft Graph ({type(error).__name__}) while sending the Jira notification.", status_code=502, code="network_error") from None

    return {
        "recipient": recipient,
        "subject": subject,
        # Graph's 202 only means that Exchange accepted the request. The monitor
        # confirms mailbox delivery separately before presenting a green status.
        "accepted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


def test_outlook_connection() -> dict[str, object]:
    """Read inbox metadata only; do not return message content."""
    token = _get_outlook_token()
    query = urlencode({"$top": "1", "$select": "id,receivedDateTime"})
    request = Request(
        f"{GRAPH_INBOX_URL}?{query}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 401:
            message, code = "Outlook rejected the saved sign-in. Reauthorize the mailbox and try again.", "sign_in_required"
        elif error.code == 403:
            message, code = "The Outlook account does not have permission to read this inbox.", "permission_denied"
        else:
            message, code = f"Microsoft Graph returned HTTP {error.code} while checking the inbox.", "graph_error"
        raise IntegrationCheckError(message, status_code=502, code=code) from None
    except (URLError, TimeoutError) as error:
        raise IntegrationCheckError(
            f"Could not reach Microsoft Graph ({type(error).__name__}).", status_code=502, code="network_error"
        ) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise IntegrationCheckError("Microsoft Graph returned an unreadable response.", status_code=502, code="invalid_response") from None

    messages = payload.get("value", [])
    return {
        "provider": "outlook",
        "connected": True,
        "message": "Outlook inbox is reachable. The saved sign-in can read inbox messages.",
        "inbox_has_messages": bool(messages),
    }


def _jira_settings() -> tuple[str, str, str, str]:
    base_url = _setting("JIRA_BASE_URL").rstrip("/")
    email = _setting("JIRA_EMAIL")
    api_token = _setting("JIRA_API_TOKEN")
    project_key = _setting("JIRA_PROJECT_KEY")
    missing = [
        name for name, value in (
            ("JIRA_BASE_URL", base_url),
            ("JIRA_EMAIL", email),
            ("JIRA_API_TOKEN", api_token),
            ("JIRA_PROJECT_KEY", project_key),
        ) if not value
    ]
    if missing:
        raise IntegrationCheckError(
            "Jira configuration is incomplete: " + ", ".join(missing) + ".",
            code="not_configured",
        )
    parts = urlsplit(base_url)
    if parts.scheme != "https" or not parts.netloc or parts.username or parts.password:
        raise IntegrationCheckError("JIRA_BASE_URL must be an HTTPS Jira Cloud site URL.", code="invalid_configuration")
    clean_base = urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))
    return clean_base, email, api_token, project_key


def _jira_get(base_url: str, email: str, api_token: str, path: str) -> dict:
    credential = base64.b64encode(f"{email}:{api_token}".encode("utf-8")).decode("ascii")
    request = Request(
        f"{base_url}{path}",
        headers={"Authorization": f"Basic {credential}", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        if error.code == 401:
            message, code = "Jira rejected the email and API token. Check the Jira credentials.", "invalid_credentials"
        elif error.code == 403:
            message, code = "Jira authenticated the account but denied access to this resource.", "permission_denied"
        elif error.code == 404:
            message, code = "Jira could not find the configured project, or the account cannot browse it.", "project_not_found"
        elif error.code == 429:
            message, code = "Jira rate-limited the connection check. Try again shortly.", "rate_limited"
        else:
            message, code = f"Jira returned HTTP {error.code} during the connection check.", "jira_error"
        raise IntegrationCheckError(message, status_code=502, code=code) from None
    except (URLError, TimeoutError) as error:
        raise IntegrationCheckError(
            f"Could not reach Jira ({type(error).__name__}).", status_code=502, code="network_error"
        ) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise IntegrationCheckError("Jira returned an unreadable response.", status_code=502, code="invalid_response") from None


def test_jira_connection() -> dict[str, object]:
    """Verify Jira authentication, project access, and create-issue permission without writing."""
    base_url, email, api_token, project_key = _jira_settings()
    account = _jira_get(base_url, email, api_token, "/rest/api/3/myself")
    project = _jira_get(base_url, email, api_token, f"/rest/api/3/project/{quote(project_key, safe='')}")
    query = urlencode({"projectKey": project_key, "permissions": "BROWSE_PROJECTS,CREATE_ISSUES"})
    permissions = _jira_get(base_url, email, api_token, f"/rest/api/3/mypermissions?{query}")
    permission_map = permissions.get("permissions", {})
    can_browse = bool(permission_map.get("BROWSE_PROJECTS", {}).get("havePermission"))
    can_create = bool(permission_map.get("CREATE_ISSUES", {}).get("havePermission"))
    project_name = str(project.get("name") or project_key)
    message = f"Jira account authenticated and project {project_name} ({project_key}) is reachable."
    if not can_create:
        message += " The account does not currently have Create Issues permission in this project."
    return {
        "provider": "jira",
        "connected": True,
        "message": message,
        "account": str(account.get("displayName") or "Jira account"),
        "project_key": project_key,
        "project_name": project_name,
        "can_browse_project": can_browse,
        "can_create_issues": can_create,
    }


def integration_configuration() -> dict[str, dict[str, bool]]:
    """Report whether required settings exist, without exposing their values."""
    outlook = all(_setting(name) for name in ("OUTLOOK_CLIENT_ID", "OUTLOOK_TOKEN_CACHE_PATH"))
    jira = all(_setting(name) for name in ("JIRA_BASE_URL", "JIRA_EMAIL", "JIRA_API_TOKEN", "JIRA_PROJECT_KEY"))
    return {"outlook": {"configured": outlook}, "jira": {"configured": jira}}
