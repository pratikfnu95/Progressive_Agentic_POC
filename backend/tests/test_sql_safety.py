import unittest

from backend.sql_safety import UnsafeQueryError, validate_read_only_sql


class SqlSafetyTests(unittest.TestCase):
    def test_adds_default_limit_to_approved_gold_query(self):
        result = validate_read_only_sql(
            "SELECT state, SUM(written_premium_total) "
            "FROM workspace.default.gold_policy_reporting_summary GROUP BY state"
        )
        self.assertIn("LIMIT 200", result.sql)
        self.assertEqual(
            result.tables,
            ("workspace.default.gold_policy_reporting_summary",),
        )

    def test_accepts_cte_with_allowlisted_base_table(self):
        result = validate_read_only_sql(
            "WITH p AS (SELECT policy_number FROM "
            "workspace.default.gold_policy_reporting_summary) SELECT * FROM p LIMIT 10"
        )
        self.assertIn("LIMIT 10", result.sql)

    def test_rejects_write_statement(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql(
                "DELETE FROM workspace.default.gold_fact_charge"
            )

    def test_rejects_multiple_statements(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql(
                "SELECT * FROM workspace.default.gold_policy_reporting_summary; "
                "DROP TABLE workspace.default.gold_fact_charge"
            )

    def test_rejects_non_gold_tables(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql(
                "SELECT * FROM workspace.default.bronze_wc_policy"
            )

    def test_rejects_unqualified_tables(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql("SELECT * FROM gold_policy_reporting_summary")

    def test_rejects_dynamic_table_sources(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql(
                "SELECT * FROM read_files('https://example.invalid/data.csv')"
            )

    def test_rejects_limit_above_cap(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql(
                "SELECT * FROM workspace.default.gold_policy_reporting_summary LIMIT 201"
            )

    def test_requires_approved_table_reference(self):
        with self.assertRaises(UnsafeQueryError):
            validate_read_only_sql("SELECT 1")


if __name__ == "__main__":
    unittest.main()
