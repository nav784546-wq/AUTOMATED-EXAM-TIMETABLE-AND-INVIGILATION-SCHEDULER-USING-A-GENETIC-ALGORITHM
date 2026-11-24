import hashlib
import secrets
import time
import uuid
from typing import Any, Dict, Optional

TOKEN_TTL_SECONDS = 900  # 15 minutes
RESEND_COOLDOWN_SECONDS = 60  # Prevent duplicate emails within 60 seconds


def normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def hash_value(raw_value: str) -> str:
    return hashlib.sha256(str(raw_value or "").encode("utf-8")).hexdigest()


def ensure_password_reset_table(conn) -> None:
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS password_reset_requests (
            id TEXT PRIMARY KEY,
            email_hash TEXT NOT NULL,
            token_hash TEXT UNIQUE NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            invalidated_reason TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            used_at INTEGER DEFAULT NULL
        )
        """
    )
    c.execute(
        "CREATE INDEX IF NOT EXISTS idx_password_reset_email_status ON password_reset_requests(email_hash, status)"
    )
    conn.commit()


def issue_reset_request(
    conn,
    email: str,
    now: Optional[int] = None,
    ttl_seconds: int = TOKEN_TTL_SECONDS,
    cooldown_seconds: int = RESEND_COOLDOWN_SECONDS,
) -> Dict[str, Any]:
    """
    Create a single-use, time-limited password reset tracking token for `email`.
    - Prevents duplicate requests within `cooldown_seconds`.
    - Invalidates all previously active tokens for `email` so only the latest link remains valid.
    - Stores only SHA-256 hashes of email and token (no plaintext PII or passwords).
    """
    ensure_password_reset_table(conn)
    clean_email = normalize_email(email)
    if not clean_email or "@" not in clean_email:
        raise ValueError("A valid email address is required.")

    ts = int(now if now is not None else time.time())
    email_hash = hash_value(clean_email)
    c = conn.cursor()

    # Expire stale active rows for this email first
    c.execute(
        """
        UPDATE password_reset_requests
        SET status = 'expired', invalidated_reason = 'ttl_elapsed'
        WHERE email_hash = ? AND status = 'active' AND expires_at <= ?
        """,
        (email_hash, ts),
    )

    # Check duplicate prevention cooldown against latest active request
    c.execute(
        """
        SELECT id, created_at, expires_at
        FROM password_reset_requests
        WHERE email_hash = ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email_hash,),
    )
    active_row = c.fetchone()
    if active_row is not None:
        elapsed = ts - int(active_row["created_at"])
        if elapsed < cooldown_seconds:
            cooldown_remaining = max(1, cooldown_seconds - elapsed)
            expires_remaining = max(0, int(active_row["expires_at"]) - ts)
            conn.commit()
            return {
                "allowed": False,
                "duplicatePrevented": True,
                "cooldownRemainingSeconds": cooldown_remaining,
                "expiresInSeconds": expires_remaining,
                "ttlSeconds": ttl_seconds,
                "cooldownSeconds": cooldown_seconds,
            }

    # Invalidate ALL prior active tokens for this user so only the newest link stays valid
    c.execute(
        """
        UPDATE password_reset_requests
        SET status = 'invalidated', invalidated_reason = 'superseded'
        WHERE email_hash = ? AND status = 'active'
        """,
        (email_hash,),
    )
    invalidated_count = c.rowcount

    raw_token = secrets.token_urlsafe(32)
    token_hash = hash_value(raw_token)
    req_id = f"pwreset-{uuid.uuid4().hex[:12]}"
    expires_at = ts + int(ttl_seconds)

    c.execute(
        """
        INSERT INTO password_reset_requests (
            id, email_hash, token_hash, status, invalidated_reason, created_at, expires_at, used_at
        ) VALUES (?, ?, ?, 'active', '', ?, ?, NULL)
        """,
        (req_id, email_hash, token_hash, ts, expires_at),
    )
    conn.commit()

    return {
        "allowed": True,
        "duplicatePrevented": False,
        "resetToken": raw_token,
        "expiresAt": expires_at,
        "expiresInSeconds": int(ttl_seconds),
        "cooldownSeconds": int(cooldown_seconds),
        "cooldownRemainingSeconds": int(cooldown_seconds),
        "invalidatedPreviousCount": max(0, invalidated_count),
    }


def rollback_reset_request(conn, reset_token: str) -> Dict[str, Any]:
    """
    Invalidate an active reset token when email delivery failed so the user is not locked out
    by the duplicate-prevention cooldown.
    """
    ensure_password_reset_table(conn)
    token = str(reset_token or "").strip()
    if not token:
        return {"rolledBack": False}
    token_hash = hash_value(token)
    c = conn.cursor()
    c.execute(
        """
        UPDATE password_reset_requests
        SET status = 'invalidated', invalidated_reason = 'delivery_failed'
        WHERE token_hash = ? AND status = 'active'
        """,
        (token_hash,),
    )
    conn.commit()
    return {"rolledBack": c.rowcount > 0}


def validate_reset_token(conn, reset_token: str, now: Optional[int] = None) -> Dict[str, Any]:
    """
    Validate that a reset token exists, is the latest active token, has not been used,
    and has not expired.
    """
    ensure_password_reset_table(conn)
    token = str(reset_token or "").strip()
    if not token:
        return {
            "valid": False,
            "reason": "invalid",
            "message": "This password reset link is incomplete or invalid. Please request a fresh password reset link.",
        }

    ts = int(now if now is not None else time.time())
    token_hash = hash_value(token)
    c = conn.cursor()
    c.execute(
        "SELECT id, status, invalidated_reason, expires_at, used_at FROM password_reset_requests WHERE token_hash = ?",
        (token_hash,),
    )
    row = c.fetchone()
    if not row:
        return {
            "valid": False,
            "reason": "invalid",
            "message": "This password reset link is invalid. Please request a fresh password reset link.",
        }

    status = row["status"]
    invalidated_reason = row["invalidated_reason"] or ""
    expires_at = int(row["expires_at"])

    if status == "used":
        return {
            "valid": False,
            "reason": "used",
            "message": "This password reset link has already been used. Each link is valid for one use only. Please sign in or request a new reset link.",
        }

    if status == "invalidated":
        if invalidated_reason == "superseded":
            return {
                "valid": False,
                "reason": "superseded",
                "message": "A newer password reset link was requested for this account, so this earlier link is no longer valid. Please open the newest reset email or request a fresh link.",
            }
        return {
            "valid": False,
            "reason": "invalidated",
            "message": "This password reset link is no longer valid. Please request a fresh password reset link.",
        }

    if status == "expired" or ts >= expires_at:
        if status == "active":
            c.execute(
                "UPDATE password_reset_requests SET status = 'expired', invalidated_reason = 'ttl_elapsed' WHERE id = ?",
                (row["id"],),
            )
            conn.commit()
        return {
            "valid": False,
            "reason": "expired",
            "message": "This password reset link has expired. Password reset links expire after 15 minutes. Please request a fresh password reset link.",
        }

    return {
        "valid": True,
        "reason": "active",
        "expiresAt": expires_at,
        "remainingSeconds": expires_at - ts,
    }


def consume_reset_token(
    conn,
    reset_token: str = "",
    email: str = "",
    now: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Atomically mark a reset token as used after a successful password change and invalidate any
    remaining active tokens for the same account.
    """
    ensure_password_reset_table(conn)
    ts = int(now if now is not None else time.time())
    c = conn.cursor()

    resolved_email_hash = hash_value(normalize_email(email)) if normalize_email(email) else None
    consumed = False

    token = str(reset_token or "").strip()
    if token:
        token_hash = hash_value(token)
        c.execute(
            "SELECT id, email_hash FROM password_reset_requests WHERE token_hash = ?",
            (token_hash,),
        )
        row = c.fetchone()
        if row:
            if not resolved_email_hash:
                resolved_email_hash = row["email_hash"]
            c.execute(
                """
                UPDATE password_reset_requests
                SET status = 'used', invalidated_reason = 'consumed', used_at = ?
                WHERE id = ? AND status = 'active'
                """,
                (ts, row["id"]),
            )
            consumed = c.rowcount > 0

    invalidated_others = 0
    if resolved_email_hash:
        c.execute(
            """
            UPDATE password_reset_requests
            SET status = 'invalidated', invalidated_reason = 'password_reset_completed'
            WHERE email_hash = ? AND status = 'active'
            """,
            (resolved_email_hash,),
        )
        invalidated_others = max(0, c.rowcount)

    conn.commit()
    return {
        "consumed": consumed,
        "invalidatedOtherActiveTokens": invalidated_others,
    }
