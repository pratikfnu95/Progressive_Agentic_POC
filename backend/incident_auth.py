"""Signed account-selection sessions for the incident POC."""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from http.cookies import SimpleCookie

from backend.incident_service import IncidentError, _member, _member_by_id

INCIDENT_COOKIE = "progressive_incident_user"
INCIDENT_SESSION_TTL = 8 * 60 * 60
KNOWN_USER_IDS = {"pratik", "sarvesh", "madhu", "saurabh", "admin"}


def _secret() -> str:
    secret = os.getenv("APP_SESSION_SECRET", "")
    if len(secret) < 32:
        raise IncidentError("Set APP_SESSION_SECRET to at least 32 characters before enabling account sessions.", 503)
    return secret


def select_account(display_name: str) -> tuple[dict, str]:
    """Create a signed session for a roster account selected in the demo UI."""
    user = _member(display_name)
    user_id = str(user["user_id"]).lower()
    if user_id not in KNOWN_USER_IDS:
        raise IncidentError("That account is not available in this application.", 403)
    expires = str(int(time.time()) + INCIDENT_SESSION_TTL)
    message = f"{expires}.{user_id}"
    signature = hmac.new(_secret().encode(), message.encode(), hashlib.sha256).hexdigest()
    return user, f"{message}.{signature}"


def current_account(cookie_header: str) -> dict | None:
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header or "")
        morsel = cookie.get(INCIDENT_COOKIE)
        if not morsel:
            return None
        expires, user_id, signature = morsel.value.split(".", 2)
        if int(expires) <= int(time.time()) or user_id not in KNOWN_USER_IDS:
            return None
        expected = hmac.new(_secret().encode(), f"{expires}.{user_id}".encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        return _member_by_id(user_id)
    except (ValueError, TypeError, IncidentError):
        return None
