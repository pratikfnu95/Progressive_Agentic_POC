"""HTTP dispatch for Databricks-backed incident workflows."""

from __future__ import annotations

import logging

from backend.api_service import ApiError, _is_authenticated
from backend.deepseek_client import DeepSeekAPIError
from backend.incident_auth import current_account, select_account
from backend.incident_service import IncidentError, handle_incident_request
from backend.incident_resolution import generate_resolution_guidance

LOGGER = logging.getLogger("progressive_ai.incident_api")


def dispatch_incident_request(payload: dict, cookie_header: str = "") -> tuple[int, dict, str | None]:
    try:
        if not _is_authenticated(cookie_header):
            return 401, {"error": "Enter the application access code to continue.", "access_required": True}, None
        action = payload.get("action")
        if action == "login":
            user, token = select_account(str(payload.get("user", "")))
            return 200, {"authenticated": True, "current_user": user["display_name"], "role": user["role"]}, token
        if action == "logout":
            return 200, {"authenticated": False, "current_user": None}, ""
        if action == "session":
            user = current_account(cookie_header)
            return 200, {"authenticated": user is not None, "current_user": user["display_name"] if user else None, "role": user["role"] if user else None}, None
        user = current_account(cookie_header)
        trusted_payload = dict(payload)
        trusted_payload["current_user"] = user["display_name"] if user else ""
        data = handle_incident_request(trusted_payload)
        if data.pop("assignment_action", False) and data.get("ticket"):
            assignee = data["ticket"].get("assigned_to") or (user["display_name"] if user else "the assignee")
            try:
                data["resolution_guidance"] = generate_resolution_guidance(data["ticket"], assignee)
            except IncidentError as error:
                LOGGER.warning("assignment saved; resolution guide unavailable status=%d", error.status)
                data["resolution_guidance_error"] = "The ticket was assigned, but its investigation reference could not be loaded."
            except Exception as error:
                LOGGER.warning("assignment saved; resolution guide generation failed type=%s", type(error).__name__)
                data["resolution_guidance_error"] = "The ticket was assigned, but suggested investigation steps could not be generated right now."
        return 200, data, None
    except ApiError as error:
        return error.status, {"error": error.message, "access_required": True}, None
    except IncidentError as error:
        return error.status, {"error": str(error)}, None
    except DeepSeekAPIError:
        LOGGER.warning("incident request failed at intent_classification")
        return 502, {"error": "The assistant couldn't interpret this ticket request. Try again or rephrase it."}, None
    except Exception as error:
        text = str(error).lower()
        if "permission_denied" in text or "not authorized" in text or "access denied" in text:
            LOGGER.warning("incident request failed with Databricks permission denial")
            return 502, {"error": "Databricks denied access to the incident tables. Grant the app service principal SELECT and MODIFY permissions on the incident tables."}, None
        if "timed out" in text or "timeout" in text:
            LOGGER.warning("incident request failed with Databricks timeout")
            return 504, {"error": "The incident query exceeded the 30-second limit. Try again."}, None
        LOGGER.error("incident request failed type=%s", type(error).__name__)
        return 502, {"error": "The incident service could not complete that request. Check the server logs for its request type."}, None
