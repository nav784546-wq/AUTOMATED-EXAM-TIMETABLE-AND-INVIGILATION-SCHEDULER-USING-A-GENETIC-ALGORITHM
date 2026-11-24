import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { auth } from '../firebase.js';
import {
  GENERIC_RESET_SUCCESS_MESSAGE,
  buildPasswordResetActionSettings,
  extractFirebaseAuthCode,
  shouldSuppressResetError,
  validateEmailInput,
} from '../utils/authErrors.js';

const googleProvider = new GoogleAuthProvider();

export async function signInWithEmail(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signUpWithEmail(email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function signInWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signOutAdmin() {
  await signOut(auth);
}

export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function requestResetSessionToken(email) {
  try {
    const res = await fetch('/api/auth/forgot-password/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function rollbackResetSessionToken(resetToken) {
  if (!resetToken) return;
  try {
    await fetch('/api/auth/forgot-password/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken }),
    });
  } catch {
    // Best-effort cleanup
  }
}

export async function validateResetSessionToken(resetToken) {
  if (!resetToken) return { valid: true, skipped: true };
  try {
    const res = await fetch('/api/auth/forgot-password/validate-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        valid: false,
        reason: data.reason || 'invalid',
        message:
          data.message ||
          data.detail ||
          'This password reset link has expired or has already been used. Please request a fresh reset link.',
      };
    }
    return data;
  } catch {
    return { valid: true, skipped: true };
  }
}

export async function consumeResetSessionToken(resetToken = '', email = '') {
  try {
    await fetch('/api/auth/forgot-password/consume-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, email }),
    });
  } catch {
    // Best-effort consumption
  }
}

export async function requestPasswordReset(email) {
  const check = validateEmailInput(email);
  if (!check.valid) {
    const validationErr = new Error(check.error);
    validationErr.code = 'auth/invalid-email';
    throw validationErr;
  }

  const session = await requestResetSessionToken(check.email);
  if (session && session.duplicatePrevented) {
    return {
      success: true,
      duplicatePrevented: true,
      cooldownRemainingSeconds: session.cooldownRemainingSeconds || 60,
      message: GENERIC_RESET_SUCCESS_MESSAGE,
    };
  }

  const resetToken = session?.resetToken || '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const actionSettings = buildPasswordResetActionSettings(
    origin,
    firebaseConfig.authDomain,
    resetToken
  );

  try {
    await sendPasswordResetEmail(auth, check.email, actionSettings);
    return {
      success: true,
      duplicatePrevented: false,
      cooldownRemainingSeconds: session?.cooldownRemainingSeconds || 60,
      expiresInSeconds: session?.expiresInSeconds || 900,
      message: GENERIC_RESET_SUCCESS_MESSAGE,
    };
  } catch (err) {
    const code = extractFirebaseAuthCode(err);
    if (shouldSuppressResetError(err)) {
      return {
        success: true,
        duplicatePrevented: false,
        cooldownRemainingSeconds: session?.cooldownRemainingSeconds || 60,
        expiresInSeconds: session?.expiresInSeconds || 900,
        message: GENERIC_RESET_SUCCESS_MESSAGE,
      };
    }
    if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
      const fallbackSettings = buildPasswordResetActionSettings('', firebaseConfig.authDomain);
      try {
        await sendPasswordResetEmail(auth, check.email, fallbackSettings);
        return {
          success: true,
          duplicatePrevented: false,
          cooldownRemainingSeconds: session?.cooldownRemainingSeconds || 60,
          expiresInSeconds: session?.expiresInSeconds || 900,
          message: GENERIC_RESET_SUCCESS_MESSAGE,
        };
      } catch (retryErr) {
        if (shouldSuppressResetError(retryErr)) {
          return {
            success: true,
            duplicatePrevented: false,
            cooldownRemainingSeconds: session?.cooldownRemainingSeconds || 60,
            expiresInSeconds: session?.expiresInSeconds || 900,
            message: GENERIC_RESET_SUCCESS_MESSAGE,
          };
        }
        await rollbackResetSessionToken(resetToken);
        throw retryErr;
      }
    }
    await rollbackResetSessionToken(resetToken);
    throw err;
  }
}

export async function verifyResetCode(oobCode) {
  return await verifyPasswordResetCode(auth, String(oobCode || '').trim());
}

export async function completePasswordReset(oobCode, newPassword) {
  await confirmPasswordReset(auth, String(oobCode || '').trim(), newPassword);
}

export async function syncAdminIdentity(email, firebaseUid, role = 'admin') {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanUid = String(firebaseUid || '').trim();
  if (!cleanEmail || !cleanUid) return null;
  try {
    const res = await fetch('/api/auth/admin-identity/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: cleanEmail,
        firebaseUid: cleanUid,
        role,
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function logPasswordResetAuditEvent({
  eventType,
  outcome,
  email = '',
  firebaseUid = '',
  errorCode = '',
  failureReason = '',
  metadata = {},
}) {
  if (!eventType || !outcome) return null;
  try {
    const res = await fetch('/api/auth/audit/password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: String(eventType),
        outcome: String(outcome),
        email: String(email || '').trim().toLowerCase(),
        firebaseUid: String(firebaseUid || '').trim(),
        errorCode: String(errorCode || '').trim(),
        failureReason: String(failureReason || '').trim(),
        metadata: metadata && typeof metadata === 'object' ? metadata : {},
      }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
