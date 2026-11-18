#!/usr/bin/env python3
"""One-time delegated consent for reading and sending to the configured Outlook inbox."""

from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    import msal
    from msal_extensions import PersistedTokenCache, build_encrypted_persistence
    from dotenv import dotenv_values
except ImportError:
    print("Missing dependencies. Install msal, msal-extensions, and python-dotenv in the project environment.", file=sys.stderr)
    raise SystemExit(2)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = PROJECT_ROOT / "backend" / "agent_workspace" / ".env"
SCOPES = ["https://graph.microsoft.com/Mail.ReadWrite", "https://graph.microsoft.com/Mail.Send"]


def main() -> int:
    config = dotenv_values(CONFIG_PATH)
    client_id = os.getenv("OUTLOOK_CLIENT_ID") or str(config.get("OUTLOOK_CLIENT_ID") or "").strip()
    tenant_id = os.getenv("OUTLOOK_TENANT_ID") or str(config.get("OUTLOOK_TENANT_ID") or "consumers").strip()
    cache_value = os.getenv("OUTLOOK_TOKEN_CACHE_PATH") or str(config.get("OUTLOOK_TOKEN_CACHE_PATH") or "").strip()
    if not client_id or not cache_value:
        print("Outlook client ID and token-cache path must be configured in backend/agent_workspace/.env.", file=sys.stderr)
        return 2
    cache_path = Path(cache_value).expanduser()
    if not cache_path.is_absolute():
        cache_path = (CONFIG_PATH.parent / cache_path).resolve()

    try:
        cache = PersistedTokenCache(build_encrypted_persistence(str(cache_path)))
        client = msal.PublicClientApplication(
            client_id=client_id,
            authority=f"https://login.microsoftonline.com/{tenant_id}",
            token_cache=cache,
        )
        accounts = client.get_accounts()
        result = client.acquire_token_silent(SCOPES, account=accounts[0]) if accounts else None
        if not result or not result.get("access_token"):
            flow = client.initiate_device_flow(scopes=SCOPES)
            if "user_code" not in flow:
                print("Could not start Microsoft sign-in. Check the app registration and account type.", file=sys.stderr)
                return 1
            print(flow["message"], flush=True)
            result = client.acquire_token_by_device_flow(flow)
        if not result.get("access_token"):
            detail = result.get("error_description") or result.get("error") or "Unknown sign-in error"
            print(f"Outlook authorization failed: {detail}", file=sys.stderr)
            return 1
    except Exception as error:
        print(f"Outlook authorization failed ({type(error).__name__}).", file=sys.stderr)
        return 1

    print("Outlook Mail.ReadWrite and Mail.Send permissions are now available in the shared token cache.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
