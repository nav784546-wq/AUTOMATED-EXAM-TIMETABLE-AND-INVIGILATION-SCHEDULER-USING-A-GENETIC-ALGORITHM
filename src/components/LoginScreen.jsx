import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { signInWithEmail, signInWithGoogle } from '../services/authService.js';
import {
  PASSWORD_RESET_SUCCESS_BANNER,
  extractFirebaseAuthCode,
  mapFirebaseAuthError,
  parsePasswordResetActionParams,
  validateLoginInput,
} from '../utils/authErrors.js';
import { ForgotPassword } from './auth/ForgotPassword.jsx';

export const LoginScreen = ({ initialEmail = '', initialResetSuccess = false }) => {
  const initialAction =
    typeof window !== 'undefined'
      ? parsePasswordResetActionParams(
          window.location.search,
          window.location.pathname,
          window.location.hash
        )
      : { resetCompleteHint: false };

  const [view, setView] = useState('login');
  const [email, setEmail] = useState(String(initialEmail || '').trim());
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [infoNotice, setInfoNotice] = useState(
    initialResetSuccess || initialAction.resetCompleteHint ? PASSWORD_RESET_SUCCESS_BANNER : ''
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialEmail) {
      setEmail(String(initialEmail).trim());
    }
    if (initialResetSuccess) {
      setInfoNotice(PASSWORD_RESET_SUCCESS_BANNER);
    }
  }, [initialEmail, initialResetSuccess]);

  const clearFeedback = () => {
    setError('');
    setErrorCode('');
    setInfoNotice('');
  };

  const openForgotPassword = () => {
    clearFeedback();
    setView('forgot');
  };

  const returnToLogin = () => {
    clearFeedback();
    setPassword('');
    setView('login');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    clearFeedback();

    const check = validateLoginInput(email, password);
    if (!check.valid) {
      setError(check.error);
      return;
    }

    setLoading(true);
    try {
      await signInWithEmail(check.email, check.password);
    } catch (err) {
      const code = extractFirebaseAuthCode(err);
      setErrorCode(code);
      setError(mapFirebaseAuthError(err, 'login'));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    clearFeedback();
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      const code = extractFirebaseAuthCode(err);
      setErrorCode(code);
      setError(mapFirebaseAuthError(err, 'google'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-blue-700 text-white flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 tracking-tight">
              ExamGrid GA
            </h1>
            <p className="text-xs text-slate-500">Examination Controller Portal</p>
          </div>
        </div>

        {view === 'login' && (
          <>
            <h2 className="font-display text-lg font-semibold text-slate-900 mb-1">
              Administrator Sign In
            </h2>
            <p className="text-sm text-slate-600 mb-6">
              Access automated exam timetabling, hall capacity allocation, and invigilation duty
              reports.
            </p>

            {infoNotice && (
              <div
                role="status"
                data-testid="auth-info-banner"
                className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>{infoNotice}</span>
              </div>
            )}

            {error && (
              <div
                role="alert"
                data-testid="auth-error-alert"
                className="mb-4 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 space-y-1.5"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span className="font-medium">{error}</span>
                </div>
                {errorCode === 'auth/operation-not-allowed' && (
                  <div className="text-xs text-red-800 pl-6 space-y-1.5 leading-relaxed">
                    <p>
                      Administrator setup required: This Firebase project (
                      <span className="font-mono font-semibold">{firebaseConfig.projectId}</span>)
                      only has Google sign-in enabled by default. To allow Email/Password sign-in:
                    </p>
                    <ol className="list-decimal pl-4 space-y-0.5 text-red-700">
                      <li>Open Firebase Console → Authentication → Sign-in method.</li>
                      <li>Select Email/Password, toggle Enable, and click Save.</li>
                      <li>Ensure the administrator account exists under Authentication → Users.</li>
                    </ol>
                    <div className="pt-0.5">
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-red-900 underline hover:text-red-950"
                      >
                        <span>Open Firebase Console Sign-in Method</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      <span className="text-red-700"> · or use Continue with Google below.</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="admin-email"
                  className="block text-sm font-medium text-slate-700 mb-1.5"
                >
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="controller@university.edu"
                    disabled={loading}
                    className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 disabled:bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor="admin-password"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={openForgotPassword}
                    disabled={loading}
                    className="text-xs font-medium text-blue-700 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1 py-0.5 cursor-pointer whitespace-nowrap"
                  >
                    Forgot Password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={loading}
                    className="w-full pl-9 pr-10 py-2.5 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:border-blue-600 disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    disabled={loading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-500 hover:text-slate-700 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 whitespace-nowrap"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loading ? 'Signing In...' : 'Sign In to Dashboard'}</span>
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full min-h-[44px] py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 whitespace-nowrap"
            >
              Continue with Google
            </button>

            <p className="mt-6 pt-5 border-t border-slate-200 text-center text-xs text-slate-500 leading-relaxed">
              Administrator accounts are provisioned by an authorized Super Administrator. Public
              registration is disabled.
            </p>
          </>
        )}

        {view === 'forgot' && (
          <ForgotPassword initialEmail={email} onBack={returnToLogin} />
        )}
      </div>
    </div>
  );
};
