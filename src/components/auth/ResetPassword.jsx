import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { auth } from '../../firebase.js';
import {
  consumeResetSessionToken,
  logPasswordResetAuditEvent,
  validateResetSessionToken,
} from '../../services/authService.js';
import {
  classifyResetError,
  extractFirebaseAuthCode,
  parsePasswordResetActionParams,
  validateNewPasswordInput,
} from '../../utils/authErrors.js';
import { ForgotPassword } from './ForgotPassword.jsx';
import { PasswordStrengthMeter } from './PasswordStrengthMeter.jsx';

/**
 * ResetPassword
 *
 * Dedicated password reset component that:
 * 1. Extracts `oobCode` (and `mode`, `apiKey`, `continueUrl`, `lang`, `resetToken`)
 *    from the current URL (or optional `action` prop).
 * 2. Calls Firebase `verifyPasswordResetCode(auth, oobCode)` once to validate the
 *    session without consuming the one-time code.
 * 3. Displays the New Password / Confirm New Password update form ONLY upon
 *    successful verification.
 * 4. Calls `confirmPasswordReset(auth, oobCode, newPassword)` on submission.
 */
export function ResetPassword({ action: actionProp = null, onReturnToLogin }) {
  const location = useLocation();

  const resolvedAction = useMemo(() => {
    if (actionProp) return actionProp;
    return parsePasswordResetActionParams(
      location.search,
      location.pathname,
      location.hash
    );
  }, [actionProp, location.search, location.pathname, location.hash]);

  const {
    oobCode = '',
    mode = '',
    resetToken = '',
    invalidMode = false,
    missingCode = false,
  } = resolvedAction;

  const [subView, setSubView] = useState('reset'); // 'reset' | 'resend' | 'success'
  const [status, setStatus] = useState(() => {
    if (invalidMode || missingCode || !oobCode) return 'error';
    return 'verifying';
  });
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [linkError, setLinkError] = useState(() => {
    if (invalidMode) {
      return {
        kind: 'invalid-mode',
        message: `Unsupported action mode "${mode}". This page only handles administrator password reset links.`,
        canResend: true,
        canRetry: false,
      };
    }
    if (missingCode || !oobCode) {
      return {
        kind: 'missing-code',
        message:
          'This password reset link is missing a verification code or is incomplete. Please request a fresh password reset link.',
        canResend: true,
        canRetry: false,
      };
    }
    return null;
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [redirectSeconds, setRedirectSeconds] = useState(3);

  // Guards verifyPasswordResetCode & initial error audit logging against double execution under React StrictMode
  const lastAttemptKeyRef = useRef('');
  const initialErrorAuditKeyRef = useRef('');

  useEffect(() => {
    if (subView !== 'success') return undefined;
    if (redirectSeconds <= 0) {
      if (typeof onReturnToLogin === 'function') {
        onReturnToLogin(verifiedEmail, true);
      }
      return undefined;
    }
    const timer = setTimeout(() => {
      setRedirectSeconds((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [subView, redirectSeconds, verifiedEmail, onReturnToLogin]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const prevTitle = document.title;
    document.title = 'Reset Your Password — ExamGrid GA';
    return () => {
      document.title = prevTitle;
    };
  }, []);

  useEffect(() => {
    if (invalidMode || missingCode || !oobCode) {
      const errorKey = `${mode || 'none'}::${invalidMode ? 'invalid_mode' : 'missing_code'}::${oobCode ? 'has' : 'empty'}`;
      if (initialErrorAuditKeyRef.current !== errorKey) {
        initialErrorAuditKeyRef.current = errorKey;
        const errCode = invalidMode ? 'invalid_mode' : 'missing_oob_code';
        const reason = invalidMode
          ? `Unsupported action mode "${mode}".`
          : 'Password reset link is missing a verification code.';
        logPasswordResetAuditEvent({
          eventType: 'RESET_FAILED',
          outcome: 'FAILED',
          firebaseUid: auth.currentUser?.uid || '',
          errorCode: errCode,
          failureReason: reason,
          metadata: { stage: 'link_parse', mode: mode || '' },
        });
      }
      return undefined;
    }

    const attemptKey = `${oobCode}::${retryNonce}`;
    if (lastAttemptKeyRef.current === attemptKey) {
      return undefined;
    }
    lastAttemptKeyRef.current = attemptKey;

    let cancelled = false;
    setStatus('verifying');
    setLinkError(null);

    (async () => {
      try {
        if (resetToken) {
          const tokenCheck = await validateResetSessionToken(resetToken);
          if (cancelled) return;
          if (!tokenCheck.valid) {
            const msg =
              tokenCheck.message ||
              'This password reset link has expired or has already been used. Please request a fresh password reset link.';
            logPasswordResetAuditEvent({
              eventType: 'RESET_FAILED',
              outcome: 'FAILED',
              firebaseUid: auth.currentUser?.uid || '',
              errorCode: `reset_token_${tokenCheck.reason || 'invalid'}`,
              failureReason: msg,
              metadata: { stage: 'session_token_validation' },
            });
            setLinkError({
              kind: tokenCheck.reason === 'expired' ? 'expired' : 'invalid-code',
              message: msg,
              canResend: true,
              canRetry: false,
            });
            setStatus('error');
            return;
          }
        }

        // Validate oobCode with Firebase without consuming it
        const emailFromCode = await verifyPasswordResetCode(auth, String(oobCode).trim());
        if (cancelled) return;
        setVerifiedEmail(emailFromCode || '');
        setStatus('ready');
        logPasswordResetAuditEvent({
          eventType: 'RESET_LINK_VERIFIED',
          outcome: 'SUCCESS',
          email: emailFromCode || '',
          firebaseUid: auth.currentUser?.uid || '',
          metadata: { stage: 'verify_oob_code', hasResetToken: Boolean(resetToken) },
        });
      } catch (err) {
        if (cancelled) return;
        const classified = classifyResetError(err);
        const code = extractFirebaseAuthCode(err) || classified.kind;
        logPasswordResetAuditEvent({
          eventType: 'RESET_FAILED',
          outcome: 'FAILED',
          firebaseUid: auth.currentUser?.uid || '',
          errorCode: code,
          failureReason: classified.message,
          metadata: { stage: 'verify_oob_code' },
        });
        setLinkError(classified);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [oobCode, mode, resetToken, invalidMode, missingCode, retryNonce]);

  const handleRetryVerification = () => {
    setRetryNonce((prev) => prev + 1);
  };

  const handleBackToLogin = (prefillEmail = '', resetSuccess = false) => {
    setNewPassword('');
    setConfirmNewPassword('');
    if (typeof onReturnToLogin === 'function') {
      onReturnToLogin(prefillEmail, resetSuccess);
    } else if (typeof window !== 'undefined') {
      window.location.assign(resetSuccess ? '/?reset=success' : '/');
    }
  };

  const handleSubmitNewPassword = async (e) => {
    e.preventDefault();
    if (submitting || status !== 'ready') return;
    setFormError('');

    const check = validateNewPasswordInput(newPassword, confirmNewPassword);
    if (!check.valid) {
      setFormError(check.error);
      logPasswordResetAuditEvent({
        eventType: 'RESET_FAILED',
        outcome: 'FAILED',
        email: verifiedEmail,
        firebaseUid: auth.currentUser?.uid || '',
        errorCode: 'validation_error',
        failureReason: check.error,
        metadata: { stage: 'client_validation' },
      });
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, String(oobCode).trim(), newPassword);
      await consumeResetSessionToken(resetToken, verifiedEmail);
      await logPasswordResetAuditEvent({
        eventType: 'RESET_COMPLETED',
        outcome: 'SUCCESS',
        email: verifiedEmail,
        firebaseUid: auth.currentUser?.uid || '',
        metadata: { stage: 'confirm_password_reset', hasResetToken: Boolean(resetToken) },
      });
      setNewPassword('');
      setConfirmNewPassword('');
      if (typeof window !== 'undefined') {
        window.history.replaceState({}, '', '/reset-password?reset=success');
      }
      setRedirectSeconds(3);
      setSubView('success');
    } catch (err) {
      const classified = classifyResetError(err);
      const code = extractFirebaseAuthCode(err) || classified.kind;
      logPasswordResetAuditEvent({
        eventType: 'RESET_FAILED',
        outcome: 'FAILED',
        email: verifiedEmail,
        firebaseUid: auth.currentUser?.uid || '',
        errorCode: code,
        failureReason: classified.message,
        metadata: { stage: 'confirm_password_reset' },
      });
      if (classified.kind === 'expired' || classified.kind === 'invalid-code') {
        setLinkError(classified);
        setStatus('error');
      } else {
        setFormError(classified.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-slate-900 tracking-tight leading-tight">
              ExamGrid GA
            </p>
            <p className="text-xs text-slate-500">Examination Controller Portal</p>
          </div>
        </div>

        {subView === 'resend' && (
          <ForgotPassword
            initialEmail={verifiedEmail}
            onBack={() => handleBackToLogin('', false)}
          />
        )}

        {subView === 'success' && (
          <div data-testid="reset-success-state" className="space-y-5">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <h1 className="font-display text-xl font-semibold text-slate-900">
                Password Reset Successful
              </h1>
            </div>

            <div
              role="status"
              className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 leading-relaxed"
            >
              Your administrator password has been updated
              {verifiedEmail ? ` for ${verifiedEmail}` : ''}. This reset link has now been consumed
              and cannot be used again. Redirecting to Admin Login in {redirectSeconds}s...
            </div>

            <button
              type="button"
              onClick={() => handleBackToLogin(verifiedEmail, true)}
              data-testid="reset-success-login-button"
              className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
            >
              <span>Continue to Admin Login</span>
            </button>
          </div>
        )}

        {subView === 'reset' && (
          <>
            <div className="flex items-center gap-2.5 mb-1">
              <KeyRound className="w-5 h-5 text-blue-700 shrink-0" />
              <h1 className="font-display text-xl font-semibold text-slate-900">
                Reset Your Password
              </h1>
            </div>

            {status === 'verifying' && (
              <div
                data-testid="reset-verifying-state"
                className="py-10 flex flex-col items-center justify-center gap-3 text-slate-600"
              >
                <Loader2 className="w-6 h-6 text-blue-700 animate-spin" />
                <p className="text-sm font-medium">Validating password reset link...</p>
                <p className="text-xs text-slate-500 text-center">
                  Confirming your single-use verification token with Firebase Authentication.
                </p>
              </div>
            )}

            {status === 'error' && linkError && (
              <div className="space-y-4 mt-4">
                <div
                  role="alert"
                  data-testid="reset-link-error"
                  data-error-kind={linkError.kind}
                  className="p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2.5 leading-relaxed"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{linkError.message}</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {linkError.canRetry && (
                    <button
                      type="button"
                      onClick={handleRetryVerification}
                      data-testid="reset-retry-button"
                      className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Retry Verification</span>
                    </button>
                  )}

                  {linkError.canResend && (
                    <button
                      type="button"
                      onClick={() => setSubView('resend')}
                      data-testid="reset-resend-button"
                      className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      <span>Resend Reset Email</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleBackToLogin('', false)}
                    data-testid="reset-back-to-login-button"
                    className="w-full min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Admin Login</span>
                  </button>
                </div>
              </div>
            )}

            {status === 'ready' && (
              <>
                <p className="text-sm text-slate-600 mb-5">
                  Create a strong new password for{' '}
                  <span className="font-medium text-slate-900">
                    {verifiedEmail || 'your administrator account'}
                  </span>
                  .
                </p>

                {formError && (
                  <div
                    role="alert"
                    data-testid="reset-form-error"
                    className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <form
                  onSubmit={handleSubmitNewPassword}
                  noValidate
                  data-testid="reset-password-form"
                  className="space-y-4"
                >
                  <div>
                    <label
                      htmlFor="reset-new-password"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="reset-new-password"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (formError) setFormError('');
                        }}
                        placeholder="Enter new password"
                        disabled={submitting}
                        className="w-full pl-9 pr-10 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((prev) => !prev)}
                        aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                        disabled={submitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                      >
                        {showNewPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="reset-confirm-password"
                      className="block text-sm font-medium text-slate-700 mb-1.5"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="reset-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmNewPassword}
                        onChange={(e) => {
                          setConfirmNewPassword(e.target.value);
                          if (formError) setFormError('');
                        }}
                        placeholder="Re-enter new password"
                        disabled={submitting}
                        className="w-full pl-9 pr-10 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 disabled:bg-slate-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        aria-label={
                          showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        disabled={submitting}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <PasswordStrengthMeter
                    password={newPassword}
                    confirmPassword={confirmNewPassword}
                    showMatchIndicator
                  />

                  <button
                    type="submit"
                    disabled={submitting}
                    data-testid="reset-submit-button"
                    className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>{submitting ? 'Resetting Password...' : 'Reset Password'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleBackToLogin('', false)}
                    disabled={submitting}
                    data-testid="reset-cancel-button"
                    className="w-full min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                  >
                    <span>Cancel / Back to Admin Login</span>
                  </button>
                </form>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default ResetPassword;
