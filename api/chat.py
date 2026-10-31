"""Vercel serverless entry point. The same handlers also run under FastAPI locally."""

from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse

from backend.api_service import dispatch_request, health_status


class handler(BaseHTTPRequestHandler):  # Vercel's Python runtime looks for `handler`.
    def _respond(self, status: int, data: dict, cookie: str | None = None) -> None:
        encoded = json.dumps(data, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        if cookie is not None:
            if cookie:
                self.send_header(
                    "Set-Cookie",
                    f"progressive_ai_session={cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800",
                )
            else:
                self.send_header(
                    "Set-Cookie",
                    "progressive_ai_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
                )
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path.endswith("/health"):
            self._respond(200, health_status())
            return
        status, data, cookie = dispatch_request({"action": "status"}, self.headers.get("Cookie", ""))
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

        status, data, cookie = dispatch_request(payload, self.headers.get("Cookie", ""))
        self._respond(status, data, cookie)

    def log_message(self, fmt: str, *args) -> None:
        # Avoid the default access log, which can include submitted query strings.
        logging.getLogger("progressive_ai.http").info("http_request handled")
