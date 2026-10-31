"""Live Gold schemas plus carefully qualified pilot business guidance."""

from __future__ import annotations

import logging

from backend.databricks_connector import DatabricksSettings, open_connection


LOGGER = logging.getLogger(__name__)
TABLE_ORDER = (
    "workspace.default.gold_policy_reporting_summary",
    "workspace.default.gold_dim_policy_jacket",
    "workspace.default.gold_fact_policy_transaction",
    "workspace.default.gold_fact_coverage",
    "workspace.default.gold_fact_charge",
)

# These statements are summarized from the local POC knowledge base. It
# explicitly describes synthetic data and warns that its rules are not
# authoritative Progressive accounting or production rules.
BUSINESS_GUIDANCE = """
Pilot-specific guidance from the local Workers' Compensation knowledge base:
- This is synthetic POC data, not verified Progressive production data or
  authoritative insurance/accounting logic. Live schemas and returned values
  take precedence over the document.
- gold_policy_reporting_summary is the intended policy-version reporting
  grain. Use it for policy-version overview queries.
- gold_dim_policy_jacket is versioned by gold_policy_sk. Gold fact tables also
  carry gold_policy_sk; join a fact to the dimension on that key when required.
- gold_fact_policy_transaction is at source-transaction grain;
  gold_fact_coverage is one coverage row per transaction; gold_fact_charge is
  one charge row per transaction.
- Never join unaggregated coverage rows directly to unaggregated charge rows
  before summing: the many-to-many join can multiply premium and charge values.
  Aggregate each side separately at the desired grain before joining.
- Coverage written premium comes from gold_fact_coverage.written_premium;
  transaction-level premium is in gold_fact_policy_transaction and the
  summary's written_premium_total. Avoid annual premium unless requested.
- total_cost_estimate is a POC estimate, not an approved bill or accounting
  definition. Current-state/latest-version logic is not business-approved;
  ask for clarification if the requested meaning depends on it.
""".strip()


def discover_gold_schema(settings: DatabricksSettings | None = None) -> str:
    """Read the current columns for the five approved Gold tables."""
    schemas: dict[str, list[str]] = {table: [] for table in TABLE_ORDER}
    with open_connection(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET STATEMENT_TIMEOUT = 20")
            for table in TABLE_ORDER:
                catalog, schema, name = table.split(".")
                cursor.execute(
                    f"DESCRIBE TABLE `{catalog}`.`{schema}`.`{name}`"
                )
                for row in cursor.fetchall():
                    if row and row[0] and not str(row[0]).startswith("#"):
                        column_name = str(row[0])
                        data_type = str(row[1]) if len(row) > 1 else "unknown"
                        schemas[table].append(f"{column_name} {data_type}")

    empty = [table for table, columns in schemas.items() if not columns]
    if empty:
        LOGGER.error("Gold metadata discovery returned no columns for %d tables", len(empty))
        raise RuntimeError("Live schema metadata could not be loaded for all approved Gold tables.")

    return "\n\n".join(
        f"{table}\n  " + "\n  ".join(schemas[table]) for table in TABLE_ORDER
    )


def prompt_context(verified_examples: list[dict[str, str]]) -> str:
    sections = [f"BUSINESS GUIDANCE\n{BUSINESS_GUIDANCE}"]
    if verified_examples:
        rendered = []
        for example in verified_examples:
            question = str(example.get("question", "")).strip()
            sql = str(example.get("sql", "")).strip()
            if not question or not sql:
                raise ValueError("Verified examples require non-empty question and SQL fields.")
            rendered.append(f"Question: {question}\nVerified SQL:\n{sql}")
        if rendered:
            sections.append("VERIFIED SQL EXAMPLES\n" + "\n\n".join(rendered))
    else:
        sections.append(
            "VERIFIED SQL EXAMPLES\nNo SQL example has been independently run and approved yet. "
            "Do not treat sample SQL patterns from the knowledge base as verified examples."
        )
    return "\n\n".join(sections)
