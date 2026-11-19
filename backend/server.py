"""Local FastAPI wrapper around the shared chat service."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from backend.agent_workspace.integrations import (
    IntegrationCheckError,
    get_outlook_sign_in_status,
    integration_configuration,
    send_outlook_test_email,
    start_outlook_sign_in,
    test_jira_connection,
    test_outlook_connection,
)
from backend.agent_workspace.monitor import InboxCheckInProgress, check_inbox_now, reconcile_pending_jira_notifications
from backend.agent_workspace.state import prune_execution_history, read_state
from backend.api_service import _is_authenticated, dispatch_request, health_status
from backend.incident_api import dispatch_incident_request
from backend.incident_auth import INCIDENT_COOKIE


app = FastAPI(title="Progressive AI SQL Assistant API", docs_url=None, redoc_url=None)


@app.get("/api/health")
def health():
    return health_status()


@app.get("/api/agent-workspace/integrations")
def agent_workspace_integrations(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    return JSONResponse(integration_configuration())


@app.get("/api/agent-workspace/status")
def agent_workspace_status(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    reconcile_pending_jira_notifications()
    state = prune_execution_history()
    events = state.get("events", []) if isinstance(state.get("events", []), list) else []
    seen_ids = state.get("seen_email_ids", [])
    ticket_keys = state.get("ticket_keys", [])
    duplicate_ids = state.get("duplicate_email_ids", [])
    return JSONResponse({
        "monitor_status": state.get("monitor_status", "offline"),
        "started_at": state.get("started_at"),
        "last_poll_at": state.get("last_poll_at"),
        "last_run_at": state.get("last_run_at"),
        "last_check_at": state.get("last_check_at"),
        "last_run_result": state.get("last_run_result"),
        "current_run": state.get("current_run"),
        "poll_interval_seconds": state.get("poll_interval_seconds", 10),
        "inbox": state.get("inbox", ""),
        "jira_project_key": state.get("jira_project_key", ""),
        "jira_base_url": state.get("jira_base_url", ""),
        "baseline_count": state.get("baseline_count", 0),
        "error": state.get("error", ""),
        "executions": state.get("executions", []) if isinstance(state.get("executions", []), list) else [],
        "updated_at": state.get("updated_at"),
        "counts": {
            "emails": len(seen_ids) if isinstance(seen_ids, list) else len(events),
            "tickets": len(set(ticket_keys)) if isinstance(ticket_keys, list) else sum(1 for event in events if event.get("status") == "created"),
            "duplicates": len(set(duplicate_ids)) if isinstance(duplicate_ids, list) else sum(1 for event in events if event.get("status") == "duplicate"),
            "notified": sum(1 for event in events if any(step.get("key") == "notify" and step.get("status") == "complete" for step in event.get("steps", []))),
        },
        "events": events,
    }, headers={"Cache-Control": "no-store"})


@app.post("/api/agent-workspace/check-inbox")
async def check_agent_workspace_inbox(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    try:
        result = await run_in_threadpool(check_inbox_now)
        return JSONResponse(result, headers={"Cache-Control": "no-store"})
    except InboxCheckInProgress as error:
        return JSONResponse({"error": str(error)}, status_code=409)
    except RuntimeError as error:
        return JSONResponse({"error": str(error)}, status_code=502)


@app.post("/api/agent-workspace/report-test-email")
async def report_test_email(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            return JSONResponse({"error": "Request body must be a JSON object."}, status_code=400)
    except Exception:
        return JSONResponse({"error": "Request body must be valid JSON."}, status_code=400)
    try:
        result = await run_in_threadpool(
            send_outlook_test_email,
            payload.get("subject", ""),
            payload.get("body", ""),
            payload.get("report_id", ""),
        )
        return JSONResponse(result, headers={"Cache-Control": "no-store"})
    except IntegrationCheckError as error:
        return JSONResponse(
            {"error": str(error), "code": error.code},
            status_code=error.status_code,
        )


@app.post("/api/agent-workspace/outlook/auth/start")
async def start_agent_outlook_sign_in(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    try:
        result = await run_in_threadpool(start_outlook_sign_in)
        return JSONResponse(result, headers={"Cache-Control": "no-store"})
    except IntegrationCheckError as error:
        return JSONResponse({"error": str(error), "code": error.code}, status_code=error.status_code)


@app.get("/api/agent-workspace/outlook/auth/status")
def agent_outlook_sign_in_status(request: Request, flow_id: str):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    try:
        return JSONResponse(get_outlook_sign_in_status(flow_id), headers={"Cache-Control": "no-store"})
    except IntegrationCheckError as error:
        return JSONResponse({"error": str(error), "code": error.code}, status_code=error.status_code)


@app.post("/api/agent-workspace/test-connection")
async def test_agent_workspace_connection(request: Request):
    if not _is_authenticated(request.headers.get("cookie", "")):
        return JSONResponse({"error": "Enter the application access code to continue."}, status_code=401)
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            return JSONResponse({"error": "Request body must be a JSON object."}, status_code=400)
    except Exception:
        return JSONResponse({"error": "Request body must be valid JSON."}, status_code=400)

    provider = payload.get("provider")
    checks = {"outlook": test_outlook_connection, "jira": test_jira_connection}
    if provider not in checks:
        return JSONResponse({"error": "Choose Outlook or Jira to test."}, status_code=400)
    try:
        result = await run_in_threadpool(checks[provider])
        return JSONResponse(result)
    except IntegrationCheckError as error:
        return JSONResponse(
            {"provider": provider, "connected": False, "code": error.code, "message": str(error)},
            status_code=error.status_code,
        )


@app.get("/api/chat")
def session_status(request: Request):
    status, data, cookie = dispatch_request({"action": "status"}, request.headers.get("cookie", ""))
    response = JSONResponse(data, status_code=status)
    if cookie is not None:
        response.delete_cookie("progressive_ai_session", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/incidents")
def incident_snapshot(request: Request, action: str = "snapshot"):
    status, data, cookie = dispatch_incident_request(
        {"action": action}, request.headers.get("cookie", "")
    )
    response = JSONResponse(data, status_code=status)
    if cookie is not None:
        response.delete_cookie(INCIDENT_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/incidents")
async def incidents(request: Request):
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            return JSONResponse({"error": "Request body must be a JSON object."}, status_code=400)
    except Exception:
        return JSONResponse({"error": "Request body must be valid JSON."}, status_code=400)
    status, data, cookie = await run_in_threadpool(
        dispatch_incident_request, payload, request.headers.get("cookie", "")
    )
    response = JSONResponse(data, status_code=status)
    if cookie is not None:
        if cookie:
            response.set_cookie(INCIDENT_COOKIE, cookie, max_age=8 * 60 * 60, httponly=True,
                                secure=False, samesite="lax", path="/")
        else:
            response.delete_cookie(INCIDENT_COOKIE, path="/")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/chat")
async def chat(request: Request):
    try:
        payload = await request.json()
        if not isinstance(payload, dict):
            return JSONResponse({"error": "Request body must be a JSON object."}, status_code=400)
    except Exception:
        return JSONResponse({"error": "Request body must be valid JSON."}, status_code=400)

    # Schema discovery, DeepSeek calls, and Databricks SQL are blocking I/O.
    # Run the shared synchronous service off the ASGI event loop; its Vanna
    # adapter uses asyncio.run() for Vanna's async LLM service.
    status, data, cookie = await run_in_threadpool(
        dispatch_request, payload, request.headers.get("cookie", "")
    )
    response = JSONResponse(data, status_code=status)
    if cookie is not None:
        if cookie:
            response.set_cookie(
                "progressive_ai_session",
                cookie,
                max_age=8 * 60 * 60,
                httponly=True,
                secure=False,
                samesite="lax",
                path="/",
            )
        else:
            response.delete_cookie("progressive_ai_session", path="/")
    response.headers["Cache-Control"] = "no-store"
    return response

