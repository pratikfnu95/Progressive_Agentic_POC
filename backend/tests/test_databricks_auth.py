import os
import unittest
from unittest.mock import patch

from backend.api_service import _safe_generation_error
from backend.databricks_connector import DatabricksSettings, open_connection, safe_connection_error


class DatabricksAuthTests(unittest.TestCase):
    def test_settings_reject_missing_service_principal_without_browser_fallback(self):
        with patch.dict(
            os.environ,
            {
                "DATABRICKS_SERVER_HOSTNAME": "example.databricks.com",
                "DATABRICKS_HTTP_PATH": "/sql/1.0/warehouses/example",
                "DATABRICKS_CLIENT_ID": "",
                "DATABRICKS_CLIENT_SECRET": "",
            },
        ):
            with self.assertRaisesRegex(ValueError, "browser sign-in is disabled"):
                DatabricksSettings.from_environment()

    def test_open_connection_does_not_connect_without_service_principal(self):
        with patch(
            "backend.databricks_connector.DatabricksSettings.from_environment",
            side_effect=ValueError("Databricks browser sign-in is disabled"),
        ), patch("backend.databricks_connector.sql.connect") as connect:
            with self.assertRaisesRegex(ValueError, "browser sign-in is disabled"):
                with open_connection():
                    pass
            connect.assert_not_called()

    def test_invalid_client_error_is_actionable_without_echoing_provider_text(self):
        error = _safe_generation_error(
            RuntimeError("invalid_client: Client authentication failed; do-not-echo")
        )
        self.assertIn("service-principal credentials", error)
        self.assertNotIn("do-not-echo", error)

    def test_connection_probe_hides_provider_error_text(self):
        message = safe_connection_error(
            RuntimeError("invalid_client: do-not-echo-this-value")
        )
        self.assertIn("rejected", message)
        self.assertNotIn("do-not-echo-this-value", message)


if __name__ == "__main__":
    unittest.main()
