"""Vercel serverless entry point for incident data and actions."""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

from backend.incident_api import dispatch_incident_request
from backend.incident_auth import INCIDENT_COOKIE


class handler(BaseHTTPRequestHandler):  # Vercel's Python runtime looks for `handler`.
    def _respond(self, status: int, data: dict, cookie: str | None = None) -> None:
        encoded = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            if cookie:
                self.send_header("Set-Cookie", f"{INCIDENT_COOKIE}={cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800")
            else:
                self.send_header("Set-Cookie", f"{INCIDENT_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        query = parse_qs(urlparse(self.path).query)
        action = query.get("action", ["snapshot"])[0]
        status, data, cookie = dispatch_incident_request(
            {"action": action},
            self.headers.get("Cookie", ""),
        )
        self._respond(status, data, cookie)

    def do_POST(self) -> None:  # noqa: N802
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 1 or size > 64_000:
                self._respond(400, {"error": "Request body must be between 1 byte and 64 KB."})
                return
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                self._respond(400, {"error": "Request body must be a JSON object."})
                return
        except (ValueError, json.JSONDecodeError):
            self._respond(400, {"error": "Request body must be valid JSON."})
            return
        status, data, cookie = dispatch_incident_request(payload, self.headers.get("Cookie", ""))
        self._respond(status, data, cookie)

    def log_message(self, fmt: str, *args) -> None:
        logging.getLogger("progressive_ai.http").info("incident API request handled")
