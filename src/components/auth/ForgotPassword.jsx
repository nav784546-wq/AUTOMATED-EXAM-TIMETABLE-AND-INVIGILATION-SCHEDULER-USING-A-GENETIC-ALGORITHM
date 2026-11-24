import React, { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Loader2,
  Mail,
  RefreshCw,
} from 'lucide-react';
import firebaseConfig from '../../../firebase-applet-config.json';
import { auth } from '../../firebase.js';
import {
  logPasswordResetAuditEvent,
  requestResetSessionToken,
  rollbackResetSessionToken,
} from '../../services/authService.js';
import {
  GENERIC_RESET_SUCCESS_MESSAGE,
  buildPasswordResetActionSettings,
  extractFirebaseAuthCode,
  mapFirebaseAuthError,
  shouldSuppressResetError,
  validateEmailInput,
} from '../../utils/authErrors.js';

/**
 * ForgotPassword
 *
 * Secure, non-enumerating administrator password recovery component powered by
 * Firebase Authentication's sendPasswordResetEmail().
 * - Prevents duplicate emails during the active cooldown window.
 * - Invalidates previously issued reset links whenever a fresh link is generated.
 * - Enforces single-use, 15-minute expiration guidance and provides a Resend option.
 */
export function ForgotPassword({ initialEmail = '', onBack }) {
  const [resetEmail, setResetEmail] = useState(String(initialEmail || '').trim());
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [duplicateNotice, setDuplicateNotice] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [expiryMinutes, setExpiryMinutes] = useState(15);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = String(initialEmail || '').trim();
    if (trimmed && !resetEmail.trim()) {
      setResetEmail(trimmed);
    }
  }, [initialEmail]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const sendResetWithAuthorizedFallback = async (normalizedEmail, resetToken) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const primarySettings = buildPasswordResetActionSettings(
      origin,
      firebaseConfig.authDomain,
      resetToken
    );

    try {
      await sendPasswordResetEmail(auth, normalizedEmail, primarySettings);
    } catch (err) {
      const code = extractFirebaseAuthCode(err);
      if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
        const fallbackSettings = buildPasswordResetActionSettings('', firebaseConfig.authDomain);
        await sendPasswordResetEmail(auth, normalizedEmail, fallbackSettings);
        return;
      }
      throw err;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setDuplicateNotice('');

    const check = validateEmailInput(resetEmail);
    if (!check.valid) {
      setSuccessMessage('');
      setError(check.error);
      return;
    }

    if (cooldownSeconds > 0 && submittedEmail.toLowerCase() === check.email.toLowerCase()) {
      setDuplicateNotice(
        `A password reset link was recently sent. To prevent invalidating your active link, please wait ${cooldownSeconds}s before requesting another link.`
      );
      return;
    }

    setLoading(true);
    let issuedToken = '';
    try {
      const session = await requestResetSessionToken(check.email);
      if (session && session.duplicatePrevented) {
        const remaining = Number(session.cooldownRemainingSeconds) || 60;
        setSubmittedEmail(check.email);
        setCooldownSeconds(remaining);
        setSuccessMessage(GENERIC_RESET_SUCCESS_MESSAGE);
        setDuplicateNotice(
          `A password reset link was just requested. Duplicate emails are paused for ${remaining}s so your latest link stays valid.`
        );
        logPasswordResetAuditEvent({
          eventType: 'RESET_REQUESTED',
          outcome: 'SUCCESS',
          email: check.email,
          firebaseUid: auth.currentUser?.uid || '',
          metadata: { stage: 'forgot_password', duplicatePrevented: true },
        });
        return;
      }

      issuedToken = session?.resetToken || '';
      if (session?.expiresInSeconds) {
        setExpiryMinutes(Math.max(1, Math.round(Number(session.expiresInSeconds) / 60)));
      }

      await sendResetWithAuthorizedFallback(check.email, issuedToken);
      setSubmittedEmail(check.email);
      setSuccessMessage(GENERIC_RESET_SUCCESS_MESSAGE);
      setCooldownSeconds(Number(session?.cooldownSeconds) || 60);
      logPasswordResetAuditEvent({
        eventType: 'RESET_REQUESTED',
        outcome: 'SUCCESS',
        email: check.email,
        firebaseUid: auth.currentUser?.uid || '',
        metadata: { stage: 'forgot_password', duplicatePrevented: false },
      });
    } catch (err) {
      if (shouldSuppressResetError(err)) {
        setSubmittedEmail(check.email);
        setSuccessMessage(GENERIC_RESET_SUCCESS_MESSAGE);
        setCooldownSeconds(60);
        logPasswordResetAuditEvent({
          eventType: 'RESET_REQUESTED',
          outcome: 'SUCCESS',
          email: check.email,
          firebaseUid: auth.currentUser?.uid || '',
          metadata: { stage: 'forgot_password', suppressed: true },
        });
      } else {
        await rollbackResetSessionToken(issuedToken);
        const mapped = mapFirebaseAuthError(err, 'forgot-password');
        setSuccessMessage('');
        setError(mapped);
        logPasswordResetAuditEvent({
          eventType: 'RESET_FAILED',
          outcome: 'FAILED',
          email: check.email,
          firebaseUid: auth.currentUser?.uid || '',
          errorCode: extractFirebaseAuthCode(err) || 'reset_request_failed',
          failureReason: mapped,
          metadata: { stage: 'forgot_password' },
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const isCooldownLocked =
    cooldownSeconds > 0 &&
    submittedEmail &&
    submittedEmail.toLowerCase() === resetEmail.trim().toLowerCase();

  return (
    <div>
      {typeof onBack === 'function' && (
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 mb-4 py-1 pr-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </button>
      )}

      <div className="flex items-center gap-2.5 mb-1">
        <KeyRound className="w-5 h-5 text-blue-700 shrink-0" />
        <h2 className="font-display text-lg font-semibold text-slate-900">
          Reset Administrator Password
        </h2>
      </div>
      <p className="text-sm text-slate-600 mb-6">
        Enter your registered administrator email address. We will send a single-use password reset
        link to your inbox.
      </p>

      {error && (
        <div
          role="alert"
          data-testid="forgot-error-alert"
          className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {duplicateNotice && (
        <div
          role="status"
          data-testid="forgot-duplicate-alert"
          className="mb-4 p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 flex items-start gap-2"
        >
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>{duplicateNotice}</span>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          data-testid="forgot-success-alert"
          className="mb-4 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 space-y-2"
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="font-medium">{successMessage}</span>
          </div>
          <p className="text-xs text-emerald-800 pl-6 leading-relaxed">
            Check your inbox{submittedEmail ? ` for ${submittedEmail}` : ''} and spam folder. Only
            the newest reset link remains valid, expires in {expiryMinutes} minutes, and can be used
            once.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor="reset-email"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Registered Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => {
                setResetEmail(e.target.value);
                if (duplicateNotice) setDuplicateNotice('');
              }}
              placeholder="controller@university.edu"
              disabled={loading}
              className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 disabled:bg-slate-50"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || Boolean(isCooldownLocked)}
          data-testid="forgot-submit-button"
          className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 whitespace-nowrap"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : successMessage ? (
            <RefreshCw className="w-4 h-4" />
          ) : null}
          <span>
            {loading
              ? 'Sending Instructions...'
              : isCooldownLocked
                ? `Resend Password Reset Link (${cooldownSeconds}s)`
                : successMessage
                  ? 'Resend Password Reset Link'
                  : 'Send Reset Instructions'}
          </span>
        </button>
      </form>
    </div>
  );
}

export default ForgotPassword;
