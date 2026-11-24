import datetime
import hashlib
import json
import re
import time
import uuid
from typing import Any, Dict, List, Optional

ALLOWED_EVENT_TYPES = {
    "RESET_REQUESTED",
    "RESET_LINK_VERIFIED",
    "RESET_COMPLETED",
    "RESET_FAILED",
}

ALLOWED_OUTCOMES = {"SUCCESS", "FAILED"}

ALLOWED_ADMIN_ROLES = {"super_admin", "admin"}
ALLOWED_ADMIN_STATUSES = {"active", "suspended"}

ALLOWED_AUDIT_CATEGORIES = {
    "admin_access",
    "auth_security",
    "scheduling",
    "academic_data",
}

BOOTSTRAPPED_SUPER_ADMINS = {
    "naveen784546@gmail.com": "Primary Super Administrator",
    "controller@university.edu": "Examination Controller (Super Admin)",
}

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

SENSITIVE_METADATA_KEYS = {
    "password",
    "newpassword",
    "confirmpassword",
    "oobcode",
    "resettoken",
    "token",
    "idtoken",
    "secret",
}


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def hash_email(email: str) -> str:
    clean = normalize_email(email)
    if not clean:
        return ""
    return hashlib.sha256(clean.encode("utf-8")).hexdigest()


def format_utc_iso(ts: int) -> str:
    return datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )


def sanitize_metadata(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(metadata, dict):
        return {}
    cleaned: Dict[str, Any] = {}
    for raw_key, raw_val in metadata.items():
        key = str(raw_key or "").strip()
        if not key or key.lower() in SENSITIVE_METADATA_KEYS:
            continue
        if isinstance(raw_val, (str, int, float, bool)) or raw_val is None:
            cleaned[key[:64]] = raw_val[:200] if isinstance(raw_val, str) else raw_val
    return cleaned


def ensure_audit_log_tables(conn) -> None:
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_identity_links (
            email_hash TEXT PRIMARY KEY,
            firebase_uid TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            updated_at INTEGER NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_admin_identity_uid ON admin_identity_links(firebase_uid)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_audit_logs (
            id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            outcome TEXT NOT NULL,
            firebase_uid TEXT DEFAULT NULL,
            uid_resolution TEXT NOT NULL DEFAULT 'unlinked',
            email_hash TEXT NOT NULL DEFAULT '',
            error_code TEXT NOT NULL DEFAULT '',
            failure_reason TEXT NOT NULL DEFAULT '',
            client_ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            created_at_iso TEXT NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pw_audit_uid_created ON password_reset_audit_logs(firebase_uid, created_at DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_pw_audit_outcome_created ON password_reset_audit_logs(outcome, created_at DESC)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS admin_accounts (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'admin',
            status TEXT NOT NULL DEFAULT 'active',
            firebase_uid TEXT DEFAULT NULL,
            created_by TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_admin_accounts_email ON admin_accounts(email)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_admin_accounts_uid ON admin_accounts(firebase_uid)"
    )

    c.execute(
        """
        CREATE TABLE IF NOT EXISTS system_audit_logs (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            outcome TEXT NOT NULL DEFAULT 'SUCCESS',
            actor_email TEXT NOT NULL DEFAULT '',
            actor_uid TEXT DEFAULT NULL,
            actor_role TEXT NOT NULL DEFAULT '',
            target_type TEXT NOT NULL DEFAULT '',
            target_id TEXT NOT NULL DEFAULT '',
            target_label TEXT NOT NULL DEFAULT '',
            client_ip TEXT NOT NULL DEFAULT '',
            user_agent TEXT NOT NULL DEFAULT '',
            metadata_json TEXT NOT NULL DEFAULT '{}',
            created_at INTEGER NOT NULL,
            created_at_iso TEXT NOT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_sys_audit_created ON system_audit_logs(created_at DESC)"
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_sys_audit_cat_outcome ON system_audit_logs(category, outcome, created_at DESC)"
    )
    conn.commit()


def _serialize_admin_row(row) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "status": row["status"],
        "firebaseUid": row["firebase_uid"] or "",
        "createdBy": row["created_by"] or "",
        "createdAt": row["created_at"],
        "createdAtIso": format_utc_iso(int(row["created_at"])),
        "updatedAt": row["updated_at"],
        "updatedAtIso": format_utc_iso(int(row["updated_at"])),
    }


def bootstrap_admin_accounts(
    conn,
    current_email: str = "",
    current_uid: str = "",
    now: Optional[int] = None,
) -> None:
    ensure_audit_log_tables(conn)
    ts = int(now if now is not None else time.time())
    c = conn.cursor()

    for boot_email, boot_name in BOOTSTRAPPED_SUPER_ADMINS.items():
        c.execute("SELECT id, firebase_uid FROM admin_accounts WHERE email = ?", (boot_email,))
        row = c.fetchone()
        if not row:
            c.execute(
                """
                INSERT INTO admin_accounts (
                    id, email, name, role, status, firebase_uid, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, 'super_admin', 'active', NULL, 'system', ?, ?)
                """,
                (f"adm-{uuid.uuid4().hex[:10]}", boot_email, boot_name, ts, ts),
            )

    clean_email = normalize_email(current_email)
    clean_uid = str(current_uid or "").strip()[:128]
    if clean_email and EMAIL_RE.match(clean_email):
        c.execute("SELECT id, firebase_uid FROM admin_accounts WHERE email = ?", (clean_email,))
        row = c.fetchone()
        if row:
            if clean_uid and not row["firebase_uid"]:
                c.execute(
                    "UPDATE admin_accounts SET firebase_uid = ?, updated_at = ? WHERE id = ?",
                    (clean_uid, ts, row["id"]),
                )
        elif clean_uid:
            # First authenticated user outside defaults gets admin unless no active super_admin exists
            c.execute(
                "SELECT COUNT(*) as cnt FROM admin_accounts WHERE role = 'super_admin' AND status = 'active'"
            )
            has_super = int(c.fetchone()["cnt"] or 0) > 0
            assigned_role = "admin" if has_super else "super_admin"
            display_name = clean_email.split("@")[0].replace(".", " ").title()[:120]
            c.execute(
                """
                INSERT INTO admin_accounts (
                    id, email, name, role, status, firebase_uid, created_by, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'active', ?, 'auth_bootstrap', ?, ?)
                """,
                (
                    f"adm-{uuid.uuid4().hex[:10]}",
                    clean_email,
                    display_name or "Portal Administrator",
                    assigned_role,
                    clean_uid,
                    ts,
                    ts,
                ),
            )

    conn.commit()


def resolve_requester_admin(
    conn,
    email: str = "",
    uid: str = "",
    bootstrap: bool = True,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    if bootstrap:
        bootstrap_admin_accounts(conn, current_email=email, current_uid=uid)

    clean_email = normalize_email(email)
    clean_uid = str(uid or "").strip()[:128]
    c = conn.cursor()

    row = None
    if clean_email:
        c.execute("SELECT * FROM admin_accounts WHERE email = ?", (clean_email,))
        row = c.fetchone()
    if not row and clean_uid:
        c.execute("SELECT * FROM admin_accounts WHERE firebase_uid = ?", (clean_uid,))
        row = c.fetchone()

    if row:
        profile = _serialize_admin_row(row)
        is_super = profile["role"] == "super_admin" and profile["status"] == "active"
        return {
            "found": True,
            "profile": profile,
            "role": profile["role"],
            "status": profile["status"],
            "isSuperAdmin": is_super,
        }

    if clean_email in BOOTSTRAPPED_SUPER_ADMINS:
        return {
            "found": True,
            "profile": {
                "id": f"boot-{hashlib.sha256(clean_email.encode('utf-8')).hexdigest()[:8]}",
                "email": clean_email,
                "name": BOOTSTRAPPED_SUPER_ADMINS[clean_email],
                "role": "super_admin",
                "status": "active",
                "firebaseUid": clean_uid,
                "createdBy": "system",
                "createdAt": int(time.time()),
                "createdAtIso": format_utc_iso(int(time.time())),
                "updatedAt": int(time.time()),
                "updatedAtIso": format_utc_iso(int(time.time())),
            },
            "role": "super_admin",
            "status": "active",
            "isSuperAdmin": True,
        }

    return {
        "found": False,
        "profile": None,
        "role": "guest",
        "status": "unknown",
        "isSuperAdmin": False,
    }


def list_admin_accounts(
    conn,
    requester_email: str = "",
    requester_uid: str = "",
) -> Dict[str, Any]:
    requester = resolve_requester_admin(conn, email=requester_email, uid=requester_uid)
    c = conn.cursor()
    if requester["isSuperAdmin"]:
        c.execute(
            """
            SELECT * FROM admin_accounts
            ORDER BY CASE WHEN role = 'super_admin' THEN 0 ELSE 1 END, created_at ASC
            """
        )
        accounts = [_serialize_admin_row(r) for r in c.fetchall()]
    elif requester["found"] and requester["profile"]:
        accounts = [requester["profile"]]
    else:
        accounts = []

    return {
        "accounts": accounts,
        "requester": requester["profile"],
        "requesterRole": requester["role"],
        "isSuperAdmin": requester["isSuperAdmin"],
    }


def create_admin_account(
    conn,
    email: str,
    name: str,
    role: str = "admin",
    firebase_uid: str = "",
    requester_email: str = "",
    requester_uid: str = "",
    client_ip: str = "",
    user_agent: str = "",
    now: Optional[int] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    ts = int(now if now is not None else time.time())
    requester = resolve_requester_admin(conn, email=requester_email, uid=requester_uid)

    clean_email = normalize_email(email)
    clean_name = str(name or "").strip()[:160]
    clean_role = str(role or "admin").strip().lower()
    clean_uid = str(firebase_uid or "").strip()[:128] or None

    if not requester["isSuperAdmin"]:
        record_system_audit_log(
            conn,
            category="admin_access",
            action="ADMIN_PROVISION_DENIED",
            summary=f"Unauthorized attempt to provision administrator {clean_email or 'unknown'}.",
            outcome="FAILED",
            actor_email=requester_email,
            actor_uid=requester_uid,
            actor_role=requester["role"],
            target_type="administrator",
            target_id="",
            target_label=clean_email,
            client_ip=client_ip,
            user_agent=user_agent,
            metadata={"reason": "super_admin_required", "requestedRole": clean_role},
            now=ts,
        )
        raise PermissionError("Only Super Administrators can add or manage administrator accounts.")

    if not clean_email or not EMAIL_RE.match(clean_email):
        raise ValueError("Please enter a valid administrator email address.")
    if not clean_name:
        raise ValueError("Administrator full name is required.")
    if clean_role not in ALLOWED_ADMIN_ROLES:
        raise ValueError("Role must be 'super_admin' or 'admin'.")

    c = conn.cursor()
    c.execute("SELECT id FROM admin_accounts WHERE email = ?", (clean_email,))
    if c.fetchone():
        raise ValueError(f"An administrator account for '{clean_email}' already exists.")

    account_id = f"adm-{uuid.uuid4().hex[:10]}"
    actor_email_val = normalize_email(requester_email) or (
        requester["profile"]["email"] if requester["profile"] else ""
    )
    c.execute(
        """
        INSERT INTO admin_accounts (
            id, email, name, role, status, firebase_uid, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
        """,
        (account_id, clean_email, clean_name, clean_role, clean_uid, actor_email_val, ts, ts),
    )
    conn.commit()

    if clean_uid:
        link_admin_firebase_uid(
            conn, email=clean_email, firebase_uid=clean_uid, role=clean_role, now=ts
        )

    c.execute("SELECT * FROM admin_accounts WHERE id = ?", (account_id,))
    created = _serialize_admin_row(c.fetchone())

    role_label = "Super Administrator" if clean_role == "super_admin" else "Administrator"
    record_system_audit_log(
        conn,
        category="admin_access",
        action="ADMIN_PROVISIONED",
        summary=f"Provisioned {role_label} account for {clean_name} ({clean_email}).",
        outcome="SUCCESS",
        actor_email=actor_email_val,
        actor_uid=requester_uid,
        actor_role=requester["role"],
        target_type="administrator",
        target_id=account_id,
        target_label=clean_email,
        client_ip=client_ip,
        user_agent=user_agent,
        metadata={"assignedRole": clean_role, "name": clean_name},
        now=ts,
    )
    return created


def update_admin_account(
    conn,
    account_id: str,
    name: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
    requester_email: str = "",
    requester_uid: str = "",
    client_ip: str = "",
    user_agent: str = "",
    now: Optional[int] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    ts = int(now if now is not None else time.time())
    requester = resolve_requester_admin(conn, email=requester_email, uid=requester_uid)

    if not requester["isSuperAdmin"]:
        record_system_audit_log(
            conn,
            category="admin_access",
            action="ADMIN_UPDATE_DENIED",
            summary=f"Unauthorized attempt to update administrator '{account_id}'.",
            outcome="FAILED",
            actor_email=requester_email,
            actor_uid=requester_uid,
            actor_role=requester["role"],
            target_type="administrator",
            target_id=account_id,
            target_label=account_id,
            client_ip=client_ip,
            user_agent=user_agent,
            metadata={"reason": "super_admin_required"},
            now=ts,
        )
        raise PermissionError("Only Super Administrators can modify administrator accounts.")

    c = conn.cursor()
    c.execute("SELECT * FROM admin_accounts WHERE id = ?", (account_id,))
    existing_row = c.fetchone()
    if not existing_row:
        raise LookupError("Administrator account not found.")

    existing = _serialize_admin_row(existing_row)
    next_name = str(name).strip()[:160] if name is not None else existing["name"]
    next_role = str(role).strip().lower() if role is not None else existing["role"]
    next_status = str(status).strip().lower() if status is not None else existing["status"]

    if not next_name:
        raise ValueError("Administrator name cannot be empty.")
    if next_role not in ALLOWED_ADMIN_ROLES:
        raise ValueError("Role must be 'super_admin' or 'admin'.")
    if next_status not in ALLOWED_ADMIN_STATUSES:
        raise ValueError("Status must be 'active' or 'suspended'.")

    req_email = normalize_email(requester_email)
    is_self = (
        (req_email and req_email == existing["email"])
        or (requester_uid and existing["firebaseUid"] and requester_uid == existing["firebaseUid"])
    )
    if is_self and (next_role != "super_admin" or next_status != "active"):
        raise ValueError("You cannot demote or suspend your own active Super Administrator account.")

    if existing["role"] == "super_admin" and existing["status"] == "active" and (
        next_role != "super_admin" or next_status != "active"
    ):
        c.execute(
            "SELECT COUNT(*) as cnt FROM admin_accounts WHERE role = 'super_admin' AND status = 'active' AND id != ?",
            (account_id,),
        )
        if int(c.fetchone()["cnt"] or 0) == 0:
            raise ValueError("At least one active Super Administrator account must remain.")

    c.execute(
        """
        UPDATE admin_accounts
        SET name = ?, role = ?, status = ?, updated_at = ?
        WHERE id = ?
        """,
        (next_name, next_role, next_status, ts, account_id),
    )
    conn.commit()

    c.execute("SELECT * FROM admin_accounts WHERE id = ?", (account_id,))
    updated = _serialize_admin_row(c.fetchone())

    if next_role != existing["role"]:
        action = "ADMIN_ROLE_UPDATED"
        summary = f"Changed role for {existing['email']} from {existing['role']} to {next_role}."
    elif next_status != existing["status"]:
        action = "ADMIN_STATUS_UPDATED"
        summary = f"Updated account status for {existing['email']} from {existing['status']} to {next_status}."
    else:
        action = "ADMIN_UPDATED"
        summary = f"Updated administrator profile for {existing['email']}."

    actor_email_val = req_email or (requester["profile"]["email"] if requester["profile"] else "")
    record_system_audit_log(
        conn,
        category="admin_access",
        action=action,
        summary=summary,
        outcome="SUCCESS",
        actor_email=actor_email_val,
        actor_uid=requester_uid,
        actor_role=requester["role"],
        target_type="administrator",
        target_id=account_id,
        target_label=existing["email"],
        client_ip=client_ip,
        user_agent=user_agent,
        metadata={
            "previousRole": existing["role"],
            "newRole": next_role,
            "previousStatus": existing["status"],
            "newStatus": next_status,
        },
        now=ts,
    )
    return updated


def delete_admin_account(
    conn,
    account_id: str,
    requester_email: str = "",
    requester_uid: str = "",
    client_ip: str = "",
    user_agent: str = "",
    now: Optional[int] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    ts = int(now if now is not None else time.time())
    requester = resolve_requester_admin(conn, email=requester_email, uid=requester_uid)

    if not requester["isSuperAdmin"]:
        record_system_audit_log(
            conn,
            category="admin_access",
            action="ADMIN_REMOVE_DENIED",
            summary=f"Unauthorized attempt to remove administrator '{account_id}'.",
            outcome="FAILED",
            actor_email=requester_email,
            actor_uid=requester_uid,
            actor_role=requester["role"],
            target_type="administrator",
            target_id=account_id,
            target_label=account_id,
            client_ip=client_ip,
            user_agent=user_agent,
            metadata={"reason": "super_admin_required"},
            now=ts,
        )
        raise PermissionError("Only Super Administrators can remove administrator accounts.")

    c = conn.cursor()
    c.execute("SELECT * FROM admin_accounts WHERE id = ?", (account_id,))
    existing_row = c.fetchone()
    if not existing_row:
        raise LookupError("Administrator account not found.")

    existing = _serialize_admin_row(existing_row)
    req_email = normalize_email(requester_email)
    is_self = (
        (req_email and req_email == existing["email"])
        or (requester_uid and existing["firebaseUid"] and requester_uid == existing["firebaseUid"])
    )
    if is_self:
        raise ValueError("You cannot remove your own administrator account.")

    if existing["role"] == "super_admin" and existing["status"] == "active":
        c.execute(
            "SELECT COUNT(*) as cnt FROM admin_accounts WHERE role = 'super_admin' AND status = 'active' AND id != ?",
            (account_id,),
        )
        if int(c.fetchone()["cnt"] or 0) == 0:
            raise ValueError("Cannot remove the last active Super Administrator account.")

    c.execute("DELETE FROM admin_accounts WHERE id = ?", (account_id,))
    conn.commit()

    actor_email_val = req_email or (requester["profile"]["email"] if requester["profile"] else "")
    record_system_audit_log(
        conn,
        category="admin_access",
        action="ADMIN_REMOVED",
        summary=f"Removed administrator account {existing['name']} ({existing['email']}).",
        outcome="SUCCESS",
        actor_email=actor_email_val,
        actor_uid=requester_uid,
        actor_role=requester["role"],
        target_type="administrator",
        target_id=account_id,
        target_label=existing["email"],
        client_ip=client_ip,
        user_agent=user_agent,
        metadata={"removedRole": existing["role"]},
        now=ts,
    )
    return {"success": True, "deletedId": account_id, "email": existing["email"]}


def link_admin_firebase_uid(
    conn,
    email: str,
    firebase_uid: str,
    role: str = "admin",
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Persistently map an administrator's SHA-256 email hash to their Firebase UID
    so subsequent password reset audit events link to the exact admin UID without
    requiring IAM-restricted Admin SDK directory lookups.
    """
    ensure_audit_log_tables(conn)
    clean_uid = str(firebase_uid or "").strip()[:128]
    clean_email = normalize_email(email)
    e_hash = hash_email(clean_email)
    if not e_hash or not clean_uid:
        raise ValueError("Both a valid email and firebase_uid are required.")

    ts = int(now if now is not None else time.time())
    clean_role = str(role or "admin").strip()[:32] or "admin"
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO admin_identity_links (email_hash, firebase_uid, role, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email_hash) DO UPDATE SET
            firebase_uid = excluded.firebase_uid,
            role = excluded.role,
            updated_at = excluded.updated_at
        """,
        (e_hash, clean_uid, clean_role, ts),
    )
    # Keep admin_accounts UID synced if record exists
    c.execute(
        "UPDATE admin_accounts SET firebase_uid = ?, updated_at = ? WHERE email = ?",
        (clean_uid, ts, clean_email),
    )
    conn.commit()
    return {
        "linked": True,
        "emailHash": e_hash,
        "firebaseUid": clean_uid,
        "role": clean_role,
        "updatedAt": ts,
    }


def resolve_admin_firebase_uid(
    conn,
    email: str = "",
    explicit_uid: str = "",
) -> Dict[str, Optional[str]]:
    ensure_audit_log_tables(conn)
    clean_uid = str(explicit_uid or "").strip()[:128]
    if clean_uid:
        return {"firebaseUid": clean_uid, "resolution": "linked_payload"}

    e_hash = hash_email(email)
    if e_hash:
        c = conn.cursor()
        c.execute(
            "SELECT firebase_uid FROM admin_identity_links WHERE email_hash = ?",
            (e_hash,),
        )
        row = c.fetchone()
        if row and row["firebase_uid"]:
            return {"firebaseUid": row["firebase_uid"], "resolution": "linked_directory"}

    return {"firebaseUid": None, "resolution": "unlinked"}


def record_password_reset_audit(
    conn,
    event_type: str,
    outcome: str,
    email: str = "",
    firebase_uid: str = "",
    error_code: str = "",
    failure_reason: str = "",
    client_ip: str = "",
    user_agent: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Record a password reset success or failure audit entry with UTC timestamp and
    linked administrator Firebase UID. Never logs plaintext passwords or reset codes.
    """
    ensure_audit_log_tables(conn)

    norm_event = str(event_type or "").strip().upper()
    if norm_event not in ALLOWED_EVENT_TYPES:
        raise ValueError(f"Unsupported password reset audit event_type: {event_type}")

    norm_outcome = str(outcome or "").strip().upper()
    if norm_outcome not in ALLOWED_OUTCOMES:
        raise ValueError(f"Unsupported password reset audit outcome: {outcome}")

    ts = int(now if now is not None else time.time())
    ts_iso = format_utc_iso(ts)
    e_hash = hash_email(email)
    uid_info = resolve_admin_firebase_uid(conn, email=email, explicit_uid=firebase_uid)
    resolved_uid = uid_info["firebaseUid"]
    resolution = uid_info["resolution"] or "unlinked"

    if resolved_uid and e_hash:
        c_link = conn.cursor()
        c_link.execute(
            """
            INSERT INTO admin_identity_links (email_hash, firebase_uid, role, updated_at)
            VALUES (?, ?, 'admin', ?)
            ON CONFLICT(email_hash) DO NOTHING
            """,
            (e_hash, resolved_uid, ts),
        )

    audit_id = f"audit-{uuid.uuid4().hex[:12]}"
    clean_error_code = str(error_code or "").strip()[:80]
    clean_reason = str(failure_reason or "").strip()[:300]
    clean_ip = str(client_ip or "").strip()[:64]
    clean_ua = str(user_agent or "").strip()[:240]
    clean_meta = sanitize_metadata(metadata)

    c = conn.cursor()
    c.execute(
        """
        INSERT INTO password_reset_audit_logs (
            id, event_type, outcome, firebase_uid, uid_resolution, email_hash,
            error_code, failure_reason, client_ip, user_agent, metadata_json,
            created_at, created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            audit_id,
            norm_event,
            norm_outcome,
            resolved_uid,
            resolution,
            e_hash,
            clean_error_code,
            clean_reason,
            clean_ip,
            clean_ua,
            json.dumps(clean_meta),
            ts,
            ts_iso,
        ),
    )
    conn.commit()

    return {
        "id": audit_id,
        "eventType": norm_event,
        "outcome": norm_outcome,
        "firebaseUid": resolved_uid,
        "uidResolution": resolution,
        "emailHash": e_hash,
        "errorCode": clean_error_code,
        "failureReason": clean_reason,
        "clientIp": clean_ip,
        "userAgent": clean_ua,
        "metadata": clean_meta,
        "createdAt": ts,
        "createdAtIso": ts_iso,
    }


def _serialize_audit_row(row) -> Dict[str, Any]:
    try:
        meta = json.loads(row["metadata_json"] or "{}")
    except Exception:
        meta = {}
    return {
        "id": row["id"],
        "eventType": row["event_type"],
        "outcome": row["outcome"],
        "firebaseUid": row["firebase_uid"],
        "uidResolution": row["uid_resolution"],
        "emailHash": row["email_hash"],
        "errorCode": row["error_code"],
        "failureReason": row["failure_reason"],
        "clientIp": row["client_ip"],
        "userAgent": row["user_agent"],
        "metadata": meta,
        "createdAt": row["created_at"],
        "createdAtIso": row["created_at_iso"],
    }


def list_password_reset_audit_logs(
    conn,
    firebase_uid: Optional[str] = None,
    outcome: Optional[str] = None,
    event_type: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    ensure_audit_log_tables(conn)
    clauses: List[str] = []
    params: List[Any] = []

    if firebase_uid:
        clauses.append("firebase_uid = ?")
        params.append(str(firebase_uid).strip())
    if outcome:
        clauses.append("outcome = ?")
        params.append(str(outcome).strip().upper())
    if event_type:
        clauses.append("event_type = ?")
        params.append(str(event_type).strip().upper())

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    safe_limit = max(1, min(500, int(limit or 100)))
    c = conn.cursor()
    c.execute(
        f"""
        SELECT * FROM password_reset_audit_logs
        {where_sql}
        ORDER BY created_at DESC, rowid DESC
        LIMIT ?
        """,
        tuple(params) + (safe_limit,),
    )
    return [_serialize_audit_row(r) for r in c.fetchall()]


def get_password_reset_audit_summary(
    conn,
    firebase_uid: Optional[str] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    c = conn.cursor()
    if firebase_uid:
        uid = str(firebase_uid).strip()
        c.execute(
            """
            SELECT
                COUNT(*) as total_events,
                SUM(CASE WHEN outcome = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN outcome = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN event_type = 'RESET_COMPLETED' AND outcome = 'SUCCESS' THEN 1 ELSE 0 END) as resets_completed
            FROM password_reset_audit_logs
            WHERE firebase_uid = ?
            """,
            (uid,),
        )
    else:
        c.execute(
            """
            SELECT
                COUNT(*) as total_events,
                SUM(CASE WHEN outcome = 'SUCCESS' THEN 1 ELSE 0 END) as success_count,
                SUM(CASE WHEN outcome = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
                SUM(CASE WHEN event_type = 'RESET_COMPLETED' AND outcome = 'SUCCESS' THEN 1 ELSE 0 END) as resets_completed
            FROM password_reset_audit_logs
            """
        )
    row = c.fetchone()
    return {
        "totalEvents": int(row["total_events"] or 0),
        "successCount": int(row["success_count"] or 0),
        "failedCount": int(row["failed_count"] or 0),
        "resetsCompleted": int(row["resets_completed"] or 0),
    }


def record_system_audit_log(
    conn,
    category: str,
    action: str,
    summary: str,
    outcome: str = "SUCCESS",
    actor_email: str = "",
    actor_uid: str = "",
    actor_role: str = "",
    target_type: str = "",
    target_id: str = "",
    target_label: str = "",
    client_ip: str = "",
    user_agent: str = "",
    metadata: Optional[Dict[str, Any]] = None,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    norm_cat = str(category or "").strip().lower()
    if norm_cat not in ALLOWED_AUDIT_CATEGORIES:
        raise ValueError(f"Unsupported audit category: {category}")

    norm_action = str(action or "").strip().upper()[:80]
    if not norm_action:
        raise ValueError("Audit action is required.")

    clean_summary = str(summary or "").strip()[:300]
    if not clean_summary:
        raise ValueError("Audit summary is required.")

    norm_outcome = str(outcome or "SUCCESS").strip().upper()
    if norm_outcome not in ALLOWED_OUTCOMES:
        raise ValueError(f"Unsupported audit outcome: {outcome}")

    ts = int(now if now is not None else time.time())
    ts_iso = format_utc_iso(ts)
    log_id = f"syslog-{uuid.uuid4().hex[:12]}"
    clean_actor_email = normalize_email(actor_email)[:160]
    clean_actor_uid = str(actor_uid or "").strip()[:128] or None
    clean_actor_role = str(actor_role or "").strip()[:32]
    clean_target_type = str(target_type or "").strip()[:64]
    clean_target_id = str(target_id or "").strip()[:128]
    clean_target_label = str(target_label or "").strip()[:200]
    clean_ip = str(client_ip or "").strip()[:64]
    clean_ua = str(user_agent or "").strip()[:240]
    clean_meta = sanitize_metadata(metadata)

    c = conn.cursor()
    c.execute(
        """
        INSERT INTO system_audit_logs (
            id, category, action, summary, outcome,
            actor_email, actor_uid, actor_role,
            target_type, target_id, target_label,
            client_ip, user_agent, metadata_json,
            created_at, created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            log_id,
            norm_cat,
            norm_action,
            clean_summary,
            norm_outcome,
            clean_actor_email,
            clean_actor_uid,
            clean_actor_role,
            clean_target_type,
            clean_target_id,
            clean_target_label,
            clean_ip,
            clean_ua,
            json.dumps(clean_meta),
            ts,
            ts_iso,
        ),
    )
    conn.commit()

    return {
        "id": log_id,
        "source": "system_audit",
        "category": norm_cat,
        "action": norm_action,
        "summary": clean_summary,
        "outcome": norm_outcome,
        "actorEmail": clean_actor_email,
        "actorUid": clean_actor_uid or "",
        "actorRole": clean_actor_role,
        "targetType": clean_target_type,
        "targetId": clean_target_id,
        "targetLabel": clean_target_label,
        "clientIp": clean_ip,
        "userAgent": clean_ua,
        "metadata": clean_meta,
        "createdAt": ts,
        "createdAtIso": ts_iso,
    }


def _describe_password_reset_row(row) -> str:
    ev = row["event_type"]
    outcome = row["outcome"]
    err = row["error_code"]
    reason = row["failure_reason"]
    if ev == "RESET_REQUESTED":
        return "Password reset instructions requested"
    if ev == "RESET_LINK_VERIFIED":
        return "Password reset verification code validated"
    if ev == "RESET_COMPLETED":
        return "Administrator password updated via recovery link"
    if outcome == "FAILED":
        suffix = f" ({err})" if err else ""
        if reason:
            return f"Password reset attempt failed{suffix}: {reason}"
        return f"Password reset attempt failed{suffix}"
    return ev


def _serialize_system_audit_row(row) -> Dict[str, Any]:
    try:
        meta = json.loads(row["metadata_json"] or "{}")
    except Exception:
        meta = {}
    return {
        "id": row["id"],
        "source": "system_audit",
        "category": row["category"],
        "action": row["action"],
        "summary": row["summary"],
        "outcome": row["outcome"],
        "actorEmail": row["actor_email"] or "",
        "actorUid": row["actor_uid"] or "",
        "actorRole": row["actor_role"] or "",
        "targetType": row["target_type"] or "",
        "targetId": row["target_id"] or "",
        "targetLabel": row["target_label"] or "",
        "clientIp": row["client_ip"] or "",
        "userAgent": row["user_agent"] or "",
        "metadata": meta,
        "createdAt": int(row["created_at"]),
        "createdAtIso": row["created_at_iso"],
    }


def _password_reset_row_to_unified(row, uid_to_email: Dict[str, str]) -> Dict[str, Any]:
    try:
        meta = json.loads(row["metadata_json"] or "{}")
    except Exception:
        meta = {}
    if row["error_code"]:
        meta["errorCode"] = row["error_code"]
    if row["failure_reason"]:
        meta["failureReason"] = row["failure_reason"]
    if row["uid_resolution"]:
        meta["uidResolution"] = row["uid_resolution"]

    uid = row["firebase_uid"] or ""
    actor_email = uid_to_email.get(uid, "") if uid else ""
    return {
        "id": row["id"],
        "source": "password_reset_audit",
        "category": "auth_security",
        "action": row["event_type"],
        "summary": _describe_password_reset_row(row),
        "outcome": row["outcome"],
        "actorEmail": actor_email,
        "actorUid": uid,
        "actorRole": "admin" if uid else "",
        "targetType": "credential",
        "targetId": row["email_hash"][:12] if row["email_hash"] else "",
        "targetLabel": actor_email or (f"UID {uid[:10]}" if uid else "Unlinked Account"),
        "clientIp": row["client_ip"] or "",
        "userAgent": row["user_agent"] or "",
        "metadata": meta,
        "createdAt": int(row["created_at"]),
        "createdAtIso": row["created_at_iso"],
    }


def list_unified_system_audit_logs(
    conn,
    category: Optional[str] = None,
    outcome: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    now: Optional[int] = None,
) -> Dict[str, Any]:
    ensure_audit_log_tables(conn)
    c = conn.cursor()

    uid_to_email: Dict[str, str] = {}
    c.execute("SELECT email, firebase_uid FROM admin_accounts WHERE firebase_uid IS NOT NULL")
    for r in c.fetchall():
        if r["firebase_uid"]:
            uid_to_email[r["firebase_uid"]] = r["email"]

    c.execute("SELECT * FROM system_audit_logs ORDER BY created_at DESC, rowid DESC LIMIT 500")
    sys_items = [_serialize_system_audit_row(r) for r in c.fetchall()]

    c.execute("SELECT * FROM password_reset_audit_logs ORDER BY created_at DESC, rowid DESC LIMIT 500")
    pw_items = [_password_reset_row_to_unified(r, uid_to_email) for r in c.fetchall()]

    combined = sys_items + pw_items
    combined.sort(key=lambda item: (item["createdAt"], item["id"]), reverse=True)

    current_ts = int(now if now is not None else time.time())
    cutoff_24h = current_ts - 86400
    by_category = {
        "admin_access": 0,
        "auth_security": 0,
        "scheduling": 0,
        "academic_data": 0,
    }
    success_count = 0
    failed_count = 0
    last_24h_count = 0
    for item in combined:
        if item["outcome"] == "SUCCESS":
            success_count += 1
        elif item["outcome"] == "FAILED":
            failed_count += 1
        if item["createdAt"] >= cutoff_24h:
            last_24h_count += 1
        if item["category"] in by_category:
            by_category[item["category"]] += 1

    cat_filter = str(category or "").strip().lower()
    outcome_filter = str(outcome or "").strip().upper()
    search_filter = str(search or "").strip().lower()

    filtered: List[Dict[str, Any]] = []
    for item in combined:
        if cat_filter and cat_filter != "all" and item["category"] != cat_filter:
            continue
        if outcome_filter and outcome_filter != "ALL" and item["outcome"] != outcome_filter:
            continue
        if search_filter:
            haystack = " ".join(
                [
                    item["id"],
                    item["action"],
                    item["summary"],
                    item["category"],
                    item["actorEmail"],
                    item["actorUid"],
                    item["targetType"],
                    item["targetId"],
                    item["targetLabel"],
                ]
            ).lower()
            if search_filter not in haystack:
                continue
        filtered.append(item)

    safe_offset = max(0, int(offset or 0))
    safe_limit = max(1, min(200, int(limit or 50)))
    paged = filtered[safe_offset : safe_offset + safe_limit]

    return {
        "logs": paged,
        "total": len(filtered),
        "summary": {
            "totalEvents": len(combined),
            "successCount": success_count,
            "failedCount": failed_count,
            "last24HoursCount": last_24h_count,
            "byCategory": by_category,
        },
    }
