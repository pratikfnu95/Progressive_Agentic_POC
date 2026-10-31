"""Local FastAPI wrapper around the shared chat service."""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from backend.api_service import dispatch_request, health_status


app = FastAPI(title="Progressive AI SQL Assistant API", docs_url=None, redoc_url=None)


@app.get("/api/health")
def health():
    return health_status()


@app.get("/api/chat")
def session_status(request: Request):
    status, data, cookie = dispatch_request({"action": "status"}, request.headers.get("cookie", ""))
    response = JSONResponse(data, status_code=status)
    if cookie is not None:
        response.delete_cookie("progressive_ai_session", path="/")
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

