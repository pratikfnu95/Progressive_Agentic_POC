import os
import unittest
from unittest.mock import patch

from backend.api_service import SESSION_COOKIE, dispatch_request


class ApiAuthTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(
            os.environ,
            {
                "VERCEL": "1",
                "APP_ACCESS_PASSWORD": "test-only-code",
                "APP_SESSION_SECRET": "test-only-secret-with-at-least-32-characters",
            },
            clear=False,
        )
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def test_login_sets_a_cookie_that_authenticates_session(self):
        status, data, token = dispatch_request(
            {"action": "login", "password": "test-only-code"}
        )
        self.assertEqual(status, 200)
        self.assertTrue(data["authenticated"])
        self.assertIsNotNone(token)
        status, data, _ = dispatch_request(
            {"action": "status"}, f"{SESSION_COOKIE}={token}"
        )
        self.assertEqual(status, 200)
        self.assertTrue(data["authenticated"])

    def test_bad_code_is_rejected(self):
        status, data, _ = dispatch_request(
            {"action": "login", "password": "incorrect"}
        )
        self.assertEqual(status, 401)
        self.assertNotIn("authenticated", data)

    def test_api_actions_require_an_authenticated_cookie(self):
        status, data, _ = dispatch_request(
            {"action": "generate", "question": "show premium totals"}
        )
        self.assertEqual(status, 401)
        self.assertIn("access code", data["error"])


if __name__ == "__main__":
    unittest.main()
