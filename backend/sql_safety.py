"""Conservative read-only SQL validation for the Databricks Gold pilot."""

from __future__ import annotations

from dataclasses import dataclass

import sqlglot
from sqlglot import exp
from sqlglot.errors import ParseError

from backend.databricks_connector import TABLE_ALLOWLIST, quote_approved_table


GOLD_TABLES = frozenset(
    table for table in TABLE_ALLOWLIST if table.startswith("workspace.default.gold_")
)
MAX_RESULT_ROWS = 200


class UnsafeQueryError(ValueError):
    """Raised when SQL cannot be proven to be an approved read-only query."""


@dataclass(frozen=True)
class ValidatedQuery:
    sql: str
    tables: tuple[str, ...]
    row_limit: int


def validate_read_only_sql(statement: str) -> ValidatedQuery:
    if not isinstance(statement, str) or not statement.strip():
        raise UnsafeQueryError("The generated SQL was empty.")

    try:
        parsed = sqlglot.parse(statement, read="databricks")
    except ParseError:
        raise UnsafeQueryError("The SQL could not be safely parsed as Databricks SQL.") from None

    if len(parsed) != 1 or parsed[0] is None:
        raise UnsafeQueryError("Only one SQL statement is allowed.")

    query = parsed[0]
    if not isinstance(query, exp.Query) or not isinstance(query, (exp.Select, exp.Subquery)):
        raise UnsafeQueryError("Only a single read-only SELECT query is allowed.")
    if any(isinstance(node, (exp.Into, exp.Lock)) for node in query.walk()):
        raise UnsafeQueryError("SELECT INTO and locking clauses are not allowed.")

    cte_names = {
        cte.alias_or_name.casefold()
        for cte in query.find_all(exp.CTE)
        if cte.alias_or_name
    }
    tables: set[str] = set()
    for table_node in query.find_all(exp.Table):
        # Table-valued functions and other dynamic sources are not approved.
        if not isinstance(table_node.this, exp.Identifier):
            raise UnsafeQueryError("Dynamic table sources are not allowed.")
        name = table_node.name.casefold()
        if not table_node.catalog and not table_node.db and name in cte_names:
            continue
        catalog = table_node.catalog.casefold()
        schema = table_node.db.casefold()
        qualified_name = f"{catalog}.{schema}.{name}"
        if qualified_name not in GOLD_TABLES:
            raise UnsafeQueryError(
                "Queries may reference only approved Gold tables in workspace.default."
            )
        tables.add(qualified_name)

    if not tables:
        raise UnsafeQueryError("The query must read at least one approved Gold table.")

    for table in tables:
        quote_approved_table(table)

    limit = query.args.get("limit")
    if limit is None:
        query = query.limit(MAX_RESULT_ROWS)
    else:
        limit_value = limit.expression
        if not isinstance(limit_value, exp.Literal) or not limit_value.is_int:
            raise UnsafeQueryError("LIMIT must be a fixed integer no greater than 200.")
        if int(limit_value.this) > MAX_RESULT_ROWS:
            raise UnsafeQueryError("LIMIT cannot exceed 200 rows.")

    return ValidatedQuery(
        sql=query.sql(dialect="databricks"),
        tables=tuple(sorted(tables)),
        row_limit=MAX_RESULT_ROWS,
    )
