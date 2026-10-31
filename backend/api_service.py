"""Shared request handlers for the local API and the Vercel function."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import time
from datetime import date, datetime
from decimal import Decimal
from http.cookies import SimpleCookie
from uuid import uuid4

from backend.databricks_connector import open_connection
from backend.deepseek_client import DeepSeekSettings
from backend.followup_questions import generate_followup_questions
from backend.sql_context import discover_gold_schema
from backend.sql_safety import UnsafeQueryError, validate_read_only_sql
from backend.vanna_sql import SqlGenerationError, generate_sql


LOGGER = logging.getLogger("progressive_ai.api")
SESSION_COOKIE = "progressive_ai_session"
SESSION_TTL_SECONDS = 8 * 60 * 60


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        self.status = status
        self.message = message


def _production_mode() -> bool:
    return bool(os.getenv("VERCEL")) or os.getenv("APP_ENV", "development").lower() == "production"


def _access_config() -> tuple[str, str]:
    password = os.getenv("APP_ACCESS_PASSWORD", "")
    signing_secret = os.getenv("APP_SESSION_SECRET", "")
    if not password or len(signing_secret) < 32:
        if _production_mode():
            raise ApiError(
                503,
                "The application access gate is not configured. Set APP_ACCESS_PASSWORD and a 32-character APP_SESSION_SECRET on the server.",
            )
    return password, signing_secret


def _make_cookie(password: str, secret: str) -> str:
    expires = str(int(time.time()) + SESSION_TTL_SECONDS)
    salt = secrets.token_urlsafe(12)
    signature = hmac.new(
        secret.encode(), f"{expires}.{salt}.{password}".encode(), hashlib.sha256
    ).hexdigest()
    return f"{expires}.{salt}.{signature}"


def _is_authenticated(cookie_header: str) -> bool:
    if not _production_mode():
        return True
    password, secret = _access_config()
    cookie = SimpleCookie()
    cookie.load(cookie_header or "")
    morsel = cookie.get(SESSION_COOKIE)
    if not morsel:
        return False
    try:
        expires, salt, signature = morsel.value.split(".", 2)
        if int(expires) <= int(time.time()):
            return False
    except (ValueError, TypeError):
        return False
    expected = hmac.new(
        secret.encode(), f"{expires}.{salt}.{password}".encode(), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)


def _json_safe(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _safe_databricks_error(error: Exception) -> str:
    message = str(error).lower()
    if "timed out" in message or "timeout" in message:
        return "Databricks stopped the query after the 30-second query limit. Try a narrower question."
    if "permission" in message or "not authorized" in message or "access denied" in message:
        return "Databricks denied access. Check that the configured identity can use the SQL Warehouse and read the approved Gold tables."
    return "Databricks could not run this query. Check the selected tables and columns, then try a narrower question."


def _safe_generation_error(error: Exception) -> str:
    message = str(error).lower()
    if "invalid_client" in message or "client authentication failed" in message:
        return (
            "Databricks rejected the service-principal credentials. Verify that "
            "DATABRICKS_CLIENT_ID is the service principal's application ID and "
            "DATABRICKS_CLIENT_SECRET is its current OAuth secret value."
        )
    if "timed out" in message or "timeout" in message:
        return "Databricks schema discovery timed out. Check service-principal access and try again."
    if "permission" in message or "not authorized" in message or "access denied" in message:
        return "Databricks denied metadata access. Grant the service principal access to the approved Gold tables."
    return "The assistant could not prepare SQL. Check server-side Databricks and DeepSeek configuration."


def _discover_schema_with_retry() -> str:
    """Retry one transient warehouse lock while reading Gold table metadata."""
    for attempt in range(2):
        try:
            return discover_gold_schema()
        except Exception as error:
            is_transient_lock = "deadlock" in str(error).lower() or "lock" in str(error).lower()
            if attempt or not is_transient_lock:
                raise
            LOGGER.warning("stage=schema_discovery transient_warehouse_lock retry=1")
            time.sleep(0.25)
    raise RuntimeError("Databricks schema discovery did not complete.")


def dispatch_request(payload: dict, cookie_header: str = "") -> tuple[int, dict, str | None]:
    """Handle one authenticated chat API operation."""
    request_id = str(uuid4())
    started = time.monotonic()
    action = payload.get("action")
    stage = "request_received"
    cookie_to_set = None
    try:
        if action == "status":
            if _production_mode():
                _access_config()
            return 200, {"authenticated": _is_authenticated(cookie_header)}, None

        if action == "login":
            password, secret = _access_config()
            if not _production_mode():
                return 200, {"authenticated": True}, None
            provided = str(payload.get("password", ""))
            if not hmac.compare_digest(provided, password):
                raise ApiError(401, "That access code is not correct.")
            cookie_to_set = _make_cookie(password, secret)
            return 200, {"authenticated": True}, cookie_to_set

        if action == "logout":
            return 200, {"authenticated": False}, ""

        if not _is_authenticated(cookie_header):
            raise ApiError(401, "Enter the application access code to continue.")

        if action == "generate":
            question = str(payload.get("question", "")).strip()
            stage = "schema_discovery"
            schema = _discover_schema_with_retry()
            stage = "sql_generation"
            generated = generate_sql(question, schema)
            stage = "sql_validation"
            validated = validate_read_only_sql(generated)
            LOGGER.info(
                "request_id=%s stage=sql_preview tables=%s elapsed_ms=%d",
                request_id,
                len(validated.tables),
                round((time.monotonic() - started) * 1000),
            )
            return 200, {
                "status": "validated",
                "sql": validated.sql,
                "tables": list(validated.tables),
                "schema_context": schema,
                "row_limit": validated.row_limit,
                "request_id": request_id,
            }, None

        if action == "suggest_followups":
            question = str(payload.get("question", "")).strip()
            if not question or len(question) > 2000:
                raise ApiError(400, "A valid original question is required.")
            stage = "followup_generation"
            suggestions = generate_followup_questions(
                question,
                payload.get("columns"),
                payload.get("rows"),
                payload.get("row_count"),
                payload.get("schema_context"),
            )
            LOGGER.info(
                "request_id=%s stage=followups_ready count=%d elapsed_ms=%d",
                request_id,
                len(suggestions),
                round((time.monotonic() - started) * 1000),
            )
            return 200, {"questions": suggestions, "request_id": request_id}, None

        if action == "execute":
            stage = "query_validation"
            validated = validate_read_only_sql(str(payload.get("sql", "")))
            columns: list[str] = []
            rows: list[list[object]] = []
            stage = "query_execution"
            with open_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("SET STATEMENT_TIMEOUT = 30")
                    cursor.execute(validated.sql)
                    columns = [str(column[0]) for column in cursor.description or []]
                    rows = [
                        [_json_safe(value) for value in row]
                        for row in cursor.fetchmany(validated.row_limit + 1)
                    ]
            truncated = len(rows) > validated.row_limit
            rows = rows[: validated.row_limit]
            elapsed_ms = round((time.monotonic() - started) * 1000)
            LOGGER.info(
                "request_id=%s stage=query_complete row_count=%d elapsed_ms=%d truncated=%s",
                request_id,
                len(rows),
                elapsed_ms,
                truncated,
            )
            return 200, {
                "status": "completed",
                "columns": columns,
                "rows": rows,
                "row_count": len(rows),
                "truncated": truncated,
                "duration_ms": elapsed_ms,
                "tables": list(validated.tables),
                "request_id": request_id,
            }, None

        raise ApiError(400, "Unknown chat API action.")
    except ApiError as error:
        LOGGER.info("request_id=%s stage=request_rejected status=%d", request_id, error.status)
        return error.status, {"error": error.message, "request_id": request_id}, cookie_to_set
    except (UnsafeQueryError, SqlGenerationError) as error:
        LOGGER.info("request_id=%s stage=sql_rejected type=%s", request_id, type(error).__name__)
        return 422, {"error": str(error), "request_id": request_id}, cookie_to_set
    except ValueError as error:
        LOGGER.warning("request_id=%s stage=%s type=%s", request_id, stage, type(error).__name__)
        return 503, {"error": str(error), "request_id": request_id}, cookie_to_set
    except Exception as error:
        # Do not log exception text or SQL; connector errors can echo statement text.
        LOGGER.error("request_id=%s stage=%s type=%s", request_id, stage, type(error).__name__)
        if action == "execute":
            detail = _safe_databricks_error(error)
        elif stage == "schema_discovery":
            message = str(error).lower()
            if "deadlock" in message or "lock" in message:
                detail = "Databricks hit a temporary warehouse lock while reading table metadata. Please retry the question."
            elif "timed out" in message or "timeout" in message:
                detail = "Databricks schema discovery timed out. Try again when the SQL Warehouse is ready."
            else:
                detail = _safe_generation_error(error)
        elif stage == "sql_generation":
            detail = "DeepSeek could not generate SQL for this request. Please retry or rephrase the question."
        else:
            detail = _safe_generation_error(error)
        return 502, {"error": detail, "request_id": request_id}, cookie_to_set


def health_status() -> dict[str, object]:
    """Safe setup status; never includes secret values."""
    missing = []
    try:
        DeepSeekSettings.from_environment()
    except ValueError:
        missing.append("DEEPSEEK_API_KEY")
    try:
        from backend.databricks_connector import DatabricksSettings

        databricks_settings = DatabricksSettings.from_environment()
        if _production_mode() and not databricks_settings.client_id:
            missing.extend(("DATABRICKS_CLIENT_ID", "DATABRICKS_CLIENT_SECRET"))
    except ValueError as error:
        text = str(error)
        missing.extend(
            name
            for name in ("DATABRICKS_SERVER_HOSTNAME", "DATABRICKS_HTTP_PATH", "DATABRICKS_CLIENT_ID", "DATABRICKS_CLIENT_SECRET")
            if name in text
        )
    if _production_mode():
        if not os.getenv("APP_ACCESS_PASSWORD"):
            missing.append("APP_ACCESS_PASSWORD")
        if len(os.getenv("APP_SESSION_SECRET", "")) < 32:
            missing.append("APP_SESSION_SECRET (at least 32 characters)")
    return {"configured": not missing, "missing": sorted(set(missing))}
