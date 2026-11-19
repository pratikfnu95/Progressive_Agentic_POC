"""Small local status store shared by the Agent Workspace monitor and API."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STATE_PATH = Path(__file__).with_name(".runtime_state.json")
EXECUTION_HISTORY_LIMIT = 10


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def read_state() -> dict[str, Any]:
    try:
        with STATE_PATH.open(encoding="utf-8") as state_file:
            data = json.load(state_file)
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_state(data: dict[str, Any]) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="agent-state-", suffix=".json", dir=STATE_PATH.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as state_file:
            json.dump(data, state_file, ensure_ascii=False, indent=2)
            state_file.write("\n")
        os.replace(temporary, STATE_PATH)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def update_state(**updates: Any) -> dict[str, Any]:
    state = read_state()
    state.update(updates)
    state["updated_at"] = utc_now()
    write_state(state)
    return state


def update_event(event: dict[str, Any]) -> dict[str, Any]:
    state = read_state()
    events = state.get("events")
    if not isinstance(events, list):
        events = []
    events = [current for current in events if current.get("id") != event.get("id")]
    events.insert(0, event)
    state["events"] = events[:100]
    state["updated_at"] = utc_now()
    write_state(state)
    return state


def update_execution(execution: dict[str, Any]) -> dict[str, Any]:
    """Insert or refresh a persisted agent execution for the workspace history."""
    state = read_state()
    executions = state.get("executions")
    if not isinstance(executions, list):
        executions = []
    executions = [current for current in executions if isinstance(current, dict) and current.get("id") != execution.get("id")]
    executions.append(execution)
    executions.sort(key=lambda current: str(current.get("started_at") or current.get("completed_at") or ""), reverse=True)
    state["executions"] = executions[:EXECUTION_HISTORY_LIMIT]
    state["updated_at"] = utc_now()
    write_state(state)
    return state


def prune_execution_history() -> dict[str, Any]:
    """Delete persisted execution summaries older than the newest ten runs."""
    state = read_state()
    executions = state.get("executions")
    if not isinstance(executions, list):
        return state
    valid_executions = [execution for execution in executions if isinstance(execution, dict)]
    valid_executions.sort(key=lambda current: str(current.get("started_at") or current.get("completed_at") or ""), reverse=True)
    retained = valid_executions[:EXECUTION_HISTORY_LIMIT]
    if len(retained) != len(executions) or retained != executions:
        state["executions"] = retained
        state["updated_at"] = utc_now()
        write_state(state)
    return state

