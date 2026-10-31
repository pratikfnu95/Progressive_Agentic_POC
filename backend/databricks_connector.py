"""Read-only Databricks SQL connection helpers for the POC."""

from __future__ import annotations

import os
import re
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from databricks import sql
from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"), override=False)


TABLE_ALLOWLIST = frozenset(
    {
        "workspace.default.bronze_wc_xml_raw",
        "workspace.default.bronze_wc_policy",
        "workspace.default.bronze_wc_coverage",
        "workspace.default.bronze_wc_charge",
        "workspace.default.silver_wc_policy",
        "workspace.default.silver_wc_policy_transaction",
        "workspace.default.silver_wc_coverage",
        "workspace.default.silver_wc_charge",
        "workspace.default.gold_dim_policy_jacket",
        "workspace.default.gold_fact_policy_transaction",
        "workspace.default.gold_fact_coverage",
        "workspace.default.gold_fact_charge",
        "workspace.default.gold_policy_reporting_summary",
    }
)
DEFAULT_TEST_TABLE = "workspace.default.gold_policy_reporting_summary"
IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class DatabricksSettings:
    server_hostname: str
    http_path: str
    client_id: str
    client_secret: str

    @classmethod
    def from_environment(cls) -> "DatabricksSettings":
        hostname = os.getenv("DATABRICKS_SERVER_HOSTNAME", "").strip()
        http_path = os.getenv("DATABRICKS_HTTP_PATH", "").strip()
        if hostname.startswith("https://"):
            hostname = hostname.removeprefix("https://")
        hostname = hostname.rstrip("/")

        missing = []
        if not hostname:
            missing.append("DATABRICKS_SERVER_HOSTNAME")
        if not http_path:
            missing.append("DATABRICKS_HTTP_PATH")
        if missing:
            raise ValueError(f"Missing required environment variable(s): {', '.join(missing)}")

        client_id = os.getenv("DATABRICKS_CLIENT_ID", "").strip()
        client_secret = os.getenv("DATABRICKS_CLIENT_SECRET", "").strip()
        if bool(client_id) != bool(client_secret):
            raise ValueError(
                "Set both DATABRICKS_CLIENT_ID and DATABRICKS_CLIENT_SECRET "
                "for Databricks service-principal authentication."
            )
        if not client_id:
            raise ValueError(
                "Databricks browser sign-in is disabled. Set DATABRICKS_CLIENT_ID "
                "and DATABRICKS_CLIENT_SECRET for service-principal authentication."
            )

        return cls(
            server_hostname=hostname,
            http_path=http_path,
            client_id=client_id,
            client_secret=client_secret,
        )


@contextmanager
def open_connection(settings: DatabricksSettings | None = None) -> Iterator:
    """Open a SQL Warehouse connection using non-interactive service-principal auth."""
    settings = settings or DatabricksSettings.from_environment()
    from databricks.sdk.core import Config, oauth_service_principal

    config = Config(
        host=f"https://{settings.server_hostname}",
        client_id=settings.client_id,
        client_secret=settings.client_secret,
    )
    connection = sql.connect(
        server_hostname=settings.server_hostname,
        http_path=settings.http_path,
        credentials_provider=lambda: oauth_service_principal(config),
    )
    try:
        yield connection
    finally:
        connection.close()


def quote_approved_table(table: str) -> str:
    """Return a quoted identifier only after checking the table allowlist."""
    return _validate_table(table)


def _validate_table(table: str) -> str:
    parts = table.split(".")
    if len(parts) != 3 or any(not IDENTIFIER_PATTERN.fullmatch(part) for part in parts):
        raise ValueError("Table must be a fully qualified catalog.schema.table identifier.")
    if table not in TABLE_ALLOWLIST:
        raise ValueError("Table is not in the configured pilot table allowlist.")
    return ".".join(f"`{part}`" for part in parts)


def check_table_access(table: str = DEFAULT_TEST_TABLE) -> dict[str, object]:
    """Confirm service-principal read access without returning table data."""
    settings = DatabricksSettings.from_environment()
    quoted_table = _validate_table(table)

    with open_connection(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT 1 AS access_check FROM {quoted_table} LIMIT 1")
            row_exists = cursor.fetchone() is not None

    return {
        "connected": True,
        "table": table,
        "read_access": True,
        "table_has_at_least_one_row": row_exists,
    }


def safe_connection_error(error: Exception) -> str:
    """Classify connection failures without echoing provider or credential text."""
    message = str(error).lower()
    if "invalid_client" in message or "client authentication failed" in message:
        return (
            "Databricks rejected the service-principal client ID/secret pair. "
            "Verify the application ID and current OAuth secret value."
        )
    if "permission" in message or "not authorized" in message or "access denied" in message:
        return (
            "Databricks authentication may have succeeded, but the principal "
            "lacks warehouse or table permissions."
        )
    return f"Databricks connection check failed ({type(error).__name__}); details hidden."


if __name__ == "__main__":
    try:
        result = check_table_access(os.getenv("DATABRICKS_TEST_TABLE", DEFAULT_TEST_TABLE))
    except Exception as error:
        print(safe_connection_error(error))
        raise SystemExit(1) from None
    print(
        "Databricks connection succeeded: "
        f"read access confirmed for {result['table']}; "
        f"table_has_at_least_one_row={result['table_has_at_least_one_row']}"
    )
