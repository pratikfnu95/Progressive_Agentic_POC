#!/usr/bin/env python3
"""Read recent inbox messages from Outlook using Microsoft Graph device login.

This is a standalone connectivity check. It does not import or modify the main
application. Configure OUTLOOK_CLIENT_ID and OUTLOOK_TENANT_ID in the shell.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    import msal
    from msal_extensions import PersistedTokenCache, build_encrypted_persistence
except ImportError:
    print(
        "Missing dependencies. Install them with: python -m pip install msal msal-extensions",
        file=sys.stderr,
    )
    raise SystemExit(2)


GRAPH_SCOPE = "https://graph.microsoft.com/Mail.ReadWrite"
MESSAGES_URL = "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages"


def load_local_env() -> None:
    """Load simple KEY=VALUE entries from this standalone tool's .env file."""
    env_path = Path(__file__).resolve().parent / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key:
            os.environ.setdefault(key, value)


def get_access_token(client_id: str, tenant_id: str) -> str:
    """Silently renew a cached delegated token, or sign in and cache it."""
    authority = f"https://login.microsoftonline.com/{tenant_id}"
    cache_path = Path(__file__).resolve().parent / ".token_cache.bin"
    persistence = build_encrypted_persistence(str(cache_path))
    token_cache = PersistedTokenCache(persistence)
    client = msal.PublicClientApplication(
        client_id=client_id,
        authority=authority,
        token_cache=token_cache,
    )

    accounts = client.get_accounts()
    if accounts:
        result = client.acquire_token_silent(scopes=[GRAPH_SCOPE], account=accounts[0])
        if result and result.get("access_token"):
            return result["access_token"]

    flow = client.initiate_device_flow(scopes=[GRAPH_SCOPE])

    if "user_code" not in flow:
        raise RuntimeError(f"Could not start Microsoft sign-in: {flow.get('error_description', flow)}")

    print(flow["message"])
    sys.stdout.flush()
    result = client.acquire_token_by_device_flow(flow)
    token = result.get("access_token")
    if not token:
        detail = result.get("error_description") or result.get("error") or "Unknown sign-in error"
        raise RuntimeError(f"Microsoft sign-in failed: {detail}")
    return token


def read_inbox(token: str, count: int) -> list[dict[str, Any]]:
    """Fetch the most recent inbox messages and request text-formatted bodies."""
    params = urlencode(
        {
            "$top": str(count),
            "$orderby": "receivedDateTime desc",
            "$select": "id,subject,from,receivedDateTime,bodyPreview,body",
        }
    )
    request = Request(
        f"{MESSAGES_URL}?{params}",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            'Prefer': 'outlook.body-content-type="text"',
        },
    )

    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Microsoft Graph returned HTTP {error.code}: {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not connect to Microsoft Graph: {error.reason}") from error

    return payload.get("value", [])


def main() -> int:
    parser = argparse.ArgumentParser(description="Read recent messages from your Outlook inbox.")
    parser.add_argument("--count", type=int, default=10, help="Number of recent messages to display (1-50).")
    parser.add_argument(
        "--show-body",
        action="store_true",
        help="Print each full message body. By default, only the body preview is shown.",
    )
    args = parser.parse_args()

    if not 1 <= args.count <= 50:
        parser.error("--count must be between 1 and 50")

    load_local_env()
    client_id = os.getenv("OUTLOOK_CLIENT_ID")
    tenant_id = os.getenv("OUTLOOK_TENANT_ID")
    if not client_id or not tenant_id:
        print(
            "Set OUTLOOK_CLIENT_ID and OUTLOOK_TENANT_ID before running this script.\n"
            "Use the Application (client) ID and Directory (tenant) ID from your app registration.",
            file=sys.stderr,
        )
        return 2

    try:
        token = get_access_token(client_id, tenant_id)
        messages = read_inbox(token, args.count)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    if not messages:
        print("Inbox read succeeded; there are no messages to display.")
        return 0

    print(f"Inbox read succeeded. Showing {len(messages)} message(s):\n")
    for index, message in enumerate(messages, start=1):
        sender = message.get("from", {}).get("emailAddress", {})
        body = message.get("body", {}).get("content", "") if args.show_body else message.get("bodyPreview", "")
        print(f"{index}. Subject: {message.get('subject') or '(no subject)'}")
        print(f"   From: {sender.get('name', '')} <{sender.get('address', '')}>")
        print(f"   Received: {message.get('receivedDateTime', '')}")
        print(f"   Message ID: {message.get('id', '')}")
        print(f"   {'Body' if args.show_body else 'Preview'}: {body or '(empty)'}")
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
