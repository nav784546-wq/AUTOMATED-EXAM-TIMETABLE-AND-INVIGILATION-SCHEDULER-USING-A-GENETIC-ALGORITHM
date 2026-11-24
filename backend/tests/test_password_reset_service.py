import os
import sqlite3
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from backend.services.password_reset_service import (
    RESEND_COOLDOWN_SECONDS,
    TOKEN_TTL_SECONDS,
    consume_reset_token,
    ensure_password_reset_table,
    issue_reset_request,
    rollback_reset_request,
    validate_reset_token,
)


class PasswordResetServiceTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(':memory:')
        self.conn.row_factory = sqlite3.Row
        ensure_password_reset_table(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_duplicate_prevention_blocks_spam_within_cooldown(self):
        t0 = 1_700_000_000
        first = issue_reset_request(self.conn, 'Admin@University.edu', now=t0)
        self.assertTrue(first['allowed'])
        self.assertFalse(first['duplicatePrevented'])
        self.assertTrue(first['resetToken'])

        # Duplicate click 10 seconds later must be blocked without issuing a new token
        second = issue_reset_request(self.conn, 'admin@university.edu ', now=t0 + 10)
        self.assertFalse(second['allowed'])
        self.assertTrue(second['duplicatePrevented'])
        self.assertEqual(second['cooldownRemainingSeconds'], RESEND_COOLDOWN_SECONDS - 10)

        # First token must STILL be valid because duplicate send was prevented
        check = validate_reset_token(self.conn, first['resetToken'], now=t0 + 11)
        self.assertTrue(check['valid'])

    def test_new_request_after_cooldown_invalidates_all_previous_tokens(self):
        t0 = 1_700_000_000
        first = issue_reset_request(self.conn, 'admin@university.edu', now=t0)
        t1 = t0 + RESEND_COOLDOWN_SECONDS + 1
        second = issue_reset_request(self.conn, 'admin@university.edu', now=t1)

        self.assertTrue(second['allowed'])
        self.assertNotEqual(first['resetToken'], second['resetToken'])
        self.assertEqual(second['invalidatedPreviousCount'], 1)

        # Older link must now be rejected as superseded
        old_check = validate_reset_token(self.conn, first['resetToken'], now=t1 + 5)
        self.assertFalse(old_check['valid'])
        self.assertEqual(old_check['reason'], 'superseded')
        self.assertIn('newer password reset link', old_check['message'].lower())

        # Latest link remains valid
        new_check = validate_reset_token(self.conn, second['resetToken'], now=t1 + 5)
        self.assertTrue(new_check['valid'])

    def test_token_is_single_use_only(self):
        t0 = 1_700_000_000
        issued = issue_reset_request(self.conn, 'admin@university.edu', now=t0)
        token = issued['resetToken']

        self.assertTrue(validate_reset_token(self.conn, token, now=t0 + 30)['valid'])

        consumed = consume_reset_token(self.conn, reset_token=token, email='admin@university.edu', now=t0 + 60)
        self.assertTrue(consumed['consumed'])

        # Attempting to reuse the same token fails clearly
        reused = validate_reset_token(self.conn, token, now=t0 + 65)
        self.assertFalse(reused['valid'])
        self.assertEqual(reused['reason'], 'used')
        self.assertIn('already been used', reused['message'].lower())

    def test_token_expires_after_ttl(self):
        t0 = 1_700_000_000
        issued = issue_reset_request(self.conn, 'admin@university.edu', now=t0)
        token = issued['resetToken']

        still_valid = validate_reset_token(self.conn, token, now=t0 + TOKEN_TTL_SECONDS - 1)
        self.assertTrue(still_valid['valid'])

        expired = validate_reset_token(self.conn, token, now=t0 + TOKEN_TTL_SECONDS + 1)
        self.assertFalse(expired['valid'])
        self.assertEqual(expired['reason'], 'expired')
        self.assertIn('expired', expired['message'].lower())

    def test_rollback_releases_cooldown_after_delivery_failure(self):
        t0 = 1_700_000_000
        first = issue_reset_request(self.conn, 'admin@university.edu', now=t0)
        rb = rollback_reset_request(self.conn, first['resetToken'])
        self.assertTrue(rb['rolledBack'])

        retry = issue_reset_request(self.conn, 'admin@university.edu', now=t0 + 2)
        self.assertTrue(retry['allowed'])
        self.assertNotEqual(first['resetToken'], retry['resetToken'])


if __name__ == '__main__':
    unittest.main()
