import sqlite3
import unittest

from backend.services.audit_log_service import (
    create_admin_account,
    delete_admin_account,
    ensure_audit_log_tables,
    get_password_reset_audit_summary,
    link_admin_firebase_uid,
    list_admin_accounts,
    list_password_reset_audit_logs,
    list_unified_system_audit_logs,
    record_password_reset_audit,
    record_system_audit_log,
    resolve_requester_admin,
    update_admin_account,
)


class AuditLogServiceTests(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.row_factory = sqlite3.Row
        ensure_audit_log_tables(self.conn)

    def tearDown(self):
        self.conn.close()

    def test_links_email_to_firebase_uid_and_records_success_and_failed_events(self):
        link_admin_firebase_uid(
            self.conn,
            email="Controller@University.edu",
            firebase_uid="uid_admin_001",
            role="super_admin",
            now=1700000000,
        )

        fail_entry = record_password_reset_audit(
            self.conn,
            event_type="RESET_FAILED",
            outcome="FAILED",
            email="controller@university.edu",
            error_code="auth/expired-action-code",
            failure_reason="Link expired",
            client_ip="10.0.0.5",
            user_agent="TestBrowser/1.0",
            metadata={"stage": "verify", "oobCode": "MUST_BE_STRIPPED", "password": "secret"},
            now=1700000100,
        )

        self.assertEqual(fail_entry["firebaseUid"], "uid_admin_001")
        self.assertEqual(fail_entry["uidResolution"], "linked_directory")
        self.assertEqual(fail_entry["outcome"], "FAILED")
        self.assertNotIn("oobCode", fail_entry["metadata"])
        self.assertNotIn("password", fail_entry["metadata"])
        self.assertEqual(fail_entry["metadata"]["stage"], "verify")
        self.assertTrue(fail_entry["createdAtIso"].endswith("Z"))

        ok_entry = record_password_reset_audit(
            self.conn,
            event_type="RESET_COMPLETED",
            outcome="SUCCESS",
            email="controller@university.edu",
            client_ip="10.0.0.5",
            metadata={"stage": "confirm", "newPassword": "hidden"},
            now=1700000200,
        )

        self.assertEqual(ok_entry["firebaseUid"], "uid_admin_001")
        self.assertEqual(ok_entry["outcome"], "SUCCESS")
        self.assertNotIn("newPassword", ok_entry["metadata"])

        logs = list_password_reset_audit_logs(self.conn, firebase_uid="uid_admin_001")
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0]["eventType"], "RESET_COMPLETED")
        self.assertEqual(logs[1]["eventType"], "RESET_FAILED")

        summary = get_password_reset_audit_summary(self.conn, firebase_uid="uid_admin_001")
        self.assertEqual(summary["totalEvents"], 2)
        self.assertEqual(summary["successCount"], 1)
        self.assertEqual(summary["failedCount"], 1)
        self.assertEqual(summary["resetsCompleted"], 1)

    def test_records_unlinked_failure_when_uid_unknown_and_supports_explicit_uid(self):
        unlinked = record_password_reset_audit(
            self.conn,
            event_type="RESET_FAILED",
            outcome="FAILED",
            email="unknown@university.edu",
            error_code="auth/invalid-action-code",
            failure_reason="Already used",
            now=1700000300,
        )
        self.assertIsNone(unlinked["firebaseUid"])
        self.assertEqual(unlinked["uidResolution"], "unlinked")

        explicit = record_password_reset_audit(
            self.conn,
            event_type="RESET_REQUESTED",
            outcome="SUCCESS",
            email="newadmin@university.edu",
            firebase_uid="uid_admin_999",
            now=1700000400,
        )
        self.assertEqual(explicit["firebaseUid"], "uid_admin_999")
        self.assertEqual(explicit["uidResolution"], "linked_payload")

        failed_only = list_password_reset_audit_logs(self.conn, outcome="FAILED")
        self.assertEqual(len(failed_only), 1)
        self.assertEqual(failed_only[0]["errorCode"], "auth/invalid-action-code")

    def test_super_admin_rbac_and_unified_system_audit_logs(self):
        req_super = resolve_requester_admin(
            self.conn, email="naveen784546@gmail.com", uid="uid_super_1"
        )
        self.assertTrue(req_super["isSuperAdmin"])

        # Super Admin provisions a standard admin
        created_admin = create_admin_account(
            self.conn,
            email="dean.exam@university.edu",
            name="Dr. Priya Nair",
            role="admin",
            requester_email="naveen784546@gmail.com",
            requester_uid="uid_super_1",
            now=1700001000,
        )
        self.assertEqual(created_admin["role"], "admin")

        # Standard admin cannot provision or modify accounts -> raises PermissionError and logs FAILED
        with self.assertRaises(PermissionError):
            create_admin_account(
                self.conn,
                email="rogue@university.edu",
                name="Rogue User",
                role="super_admin",
                requester_email="dean.exam@university.edu",
                requester_uid="uid_dean_2",
                now=1700001100,
            )

        # Standard admin list only exposes self
        non_super_list = list_admin_accounts(
            self.conn, requester_email="dean.exam@university.edu"
        )
        self.assertFalse(non_super_list["isSuperAdmin"])
        self.assertEqual(len(non_super_list["accounts"]), 1)
        self.assertEqual(non_super_list["accounts"][0]["email"], "dean.exam@university.edu")

        # Super Admin updates role & status, then deletes
        updated = update_admin_account(
            self.conn,
            created_admin["id"],
            role="super_admin",
            requester_email="naveen784546@gmail.com",
            requester_uid="uid_super_1",
            now=1700001200,
        )
        self.assertEqual(updated["role"], "super_admin")

        # Cannot self-demote
        with self.assertRaises(ValueError):
            update_admin_account(
                self.conn,
                req_super["profile"]["id"],
                role="admin",
                requester_email="naveen784546@gmail.com",
                requester_uid="uid_super_1",
                now=1700001250,
            )

        deleted = delete_admin_account(
            self.conn,
            created_admin["id"],
            requester_email="naveen784546@gmail.com",
            requester_uid="uid_super_1",
            now=1700001300,
        )
        self.assertTrue(deleted["success"])

        # Add a scheduling audit log & a password reset log to test unified stream
        record_system_audit_log(
            self.conn,
            category="scheduling",
            action="TIMETABLE_FINALIZED",
            summary="Finalized Spring 2026 examination timetable.",
            outcome="SUCCESS",
            actor_email="naveen784546@gmail.com",
            actor_uid="uid_super_1",
            actor_role="super_admin",
            target_type="timetable",
            target_id="tt-active",
            target_label="Spring 2026 Timetable",
            metadata={"token": "strip_me", "totalExams": 14},
            now=1700001400,
        )
        record_password_reset_audit(
            self.conn,
            event_type="RESET_COMPLETED",
            outcome="SUCCESS",
            email="naveen784546@gmail.com",
            firebase_uid="uid_super_1",
            now=1700001500,
        )

        unified = list_unified_system_audit_logs(self.conn, now=1700001600)
        self.assertEqual(unified["summary"]["totalEvents"], 6)
        self.assertEqual(unified["summary"]["successCount"], 5)
        self.assertEqual(unified["summary"]["failedCount"], 1)
        self.assertEqual(unified["summary"]["last24HoursCount"], 6)
        self.assertEqual(unified["logs"][0]["action"], "RESET_COMPLETED")
        self.assertEqual(unified["logs"][1]["action"], "TIMETABLE_FINALIZED")
        self.assertNotIn("token", unified["logs"][1]["metadata"])

        sched_only = list_unified_system_audit_logs(self.conn, category="scheduling", now=1700001600)
        self.assertEqual(sched_only["total"], 1)
        self.assertEqual(sched_only["logs"][0]["targetId"], "tt-active")

        failed_only = list_unified_system_audit_logs(self.conn, outcome="FAILED", now=1700001600)
        self.assertEqual(failed_only["total"], 1)
        self.assertEqual(failed_only["logs"][0]["action"], "ADMIN_PROVISION_DENIED")


if __name__ == "__main__":
    unittest.main()
