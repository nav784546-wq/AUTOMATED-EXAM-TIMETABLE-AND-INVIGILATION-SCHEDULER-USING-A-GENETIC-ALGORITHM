/**
 * Pure Firebase Authentication validation, error mapping, and password reset helpers.
 * Keeps sensitive raw Firebase error codes hidden from the UI while enforcing
 * non-enumerating password reset behavior and clear admin diagnostics.
 */

export const GENERIC_RESET_SUCCESS_MESSAGE =
  'If an account exists for this email address, password reset instructions will be sent.';

export const PASSWORD_RESET_SUCCESS_BANNER =
  'Password reset successful! Your password has been updated. Please sign in with your new password.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const AUTH_ERROR_MESSAGES = {
  'auth/operation-not-allowed':
    'Email/Password sign-in is not enabled. Contact the system administrator.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-login-credentials': 'Invalid email or password.',
  'auth/user-not-found': 'No account exists with this email address.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your internet connection.',
  'auth/user-disabled': 'This account has been disabled. Contact the administrator.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/missing-email': 'Please enter your administrator email address.',
  'auth/weak-password':
    'Password does not meet security requirements: minimum 8 characters with uppercase, lowercase, number, and special character.',
  'auth/expired-action-code':
    'This password reset link has expired. Reset links expire after a short window and only the latest link remains valid. Please request a fresh password reset link.',
  'auth/invalid-action-code':
    'This password reset link has already been used, is invalid, or was superseded by a newer reset request. Please request a fresh password reset link.',
  'auth/unauthorized-domain':
    'This application domain is not authorized for authentication. Contact the system administrator.',
  'auth/unauthorized-continue-uri':
    'The password reset redirect URL is not authorized. Contact the system administrator.',
  'auth/popup-closed-by-user': 'Google sign-in was cancelled before completion.',
  'auth/cancelled-popup-request': 'Google sign-in was cancelled before completion.',
  'auth/popup-blocked':
    'Google sign-in pop-up was blocked by your browser. Please allow pop-ups and try again.',
};

export const PASSWORD_REQUIREMENTS = [
  {
    id: 'minLength',
    label: 'Minimum 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'hasUppercase',
    label: 'At least 1 uppercase letter (A-Z)',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'hasLowercase',
    label: 'At least 1 lowercase letter (a-z)',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'hasNumber',
    label: 'At least 1 number (0-9)',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'hasSpecialChar',
    label: 'At least 1 special character (!@#$%^&*)',
    test: (pw) => /[^A-Za-z0-9]/.test(pw),
  },
];

export function extractFirebaseAuthCode(error) {
  if (!error) return '';
  if (typeof error.code === 'string' && error.code.trim()) {
    return error.code.trim().toLowerCase();
  }
  const msg = String(error.message || error || '');
  const match = msg.match(/\((auth\/[a-z0-9-]+)\)/i) || msg.match(/\b(auth\/[a-z0-9-]+)\b/i);
  return match ? match[1].toLowerCase() : '';
}

export function evaluatePasswordStrength(password) {
  const pw = String(password || '');
  const minLength = pw.length >= 8;
  const hasUppercase = /[A-Z]/.test(pw);
  const hasLowercase = /[a-z]/.test(pw);
  const hasNumber = /[0-9]/.test(pw);
  const hasSpecialChar = /[^A-Za-z0-9]/.test(pw);
  const score = [minLength, hasUppercase, hasLowercase, hasNumber, hasSpecialChar].filter(Boolean).length;
  const allMet = score === 5;
  const percent = score * 20;

  let level = 'empty';
  let strengthLabel = 'Enter a password';
  if (pw.length > 0) {
    if (score <= 2) {
      level = 'weak';
      strengthLabel = 'Weak';
    } else if (score === 3) {
      level = 'fair';
      strengthLabel = 'Fair';
    } else if (score === 4) {
      level = 'good';
      strengthLabel = 'Good';
    } else {
      level = 'strong';
      strengthLabel = 'Strong';
    }
  }

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecialChar,
    score,
    percent,
    level,
    strengthLabel,
    allMet,
  };
}

const MISSING_REQUIREMENT_HINTS = {
  minLength: '8+ characters',
  hasUppercase: 'uppercase letter',
  hasLowercase: 'lowercase letter',
  hasNumber: 'number',
  hasSpecialChar: 'special character',
};

export function getPasswordStrengthStatus(password) {
  const strength = evaluatePasswordStrength(password);
  if (strength.level === 'empty') {
    return 'Must include 8+ characters, uppercase, lowercase, number, and special character.';
  }
  if (strength.allMet) {
    return 'All password complexity requirements met.';
  }
  const missing = PASSWORD_REQUIREMENTS.filter((req) => !strength[req.id]).map(
    (req) => MISSING_REQUIREMENT_HINTS[req.id] || req.label
  );
  return `Add ${missing.join(', ')}.`;
}

export function validateEmailInput(email) {
  const trimmed = String(email || '').trim();
  if (!trimmed) {
    return { valid: false, email: '', error: 'Please enter your administrator email address.' };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { valid: false, email: trimmed, error: 'Please enter a valid email address.' };
  }
  return { valid: true, email: trimmed, error: '' };
}

export function validateLoginInput(email, password) {
  const emailCheck = validateEmailInput(email);
  if (!emailCheck.valid) {
    return { valid: false, error: emailCheck.error };
  }
  const rawPassword = String(password || '');
  if (!rawPassword.trim()) {
    return { valid: false, error: 'Please enter your password.' };
  }
  if (rawPassword.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters.' };
  }
  return { valid: true, email: emailCheck.email, password: rawPassword, error: '' };
}

export function validateNewPasswordInput(newPassword, confirmPassword) {
  const pw = String(newPassword || '');
  const confirm = String(confirmPassword || '');
  if (!pw.trim()) {
    return { valid: false, error: 'Please enter a new password.' };
  }
  const strength = evaluatePasswordStrength(pw);
  if (!strength.allMet) {
    return {
      valid: false,
      error:
        'Password must be at least 8 characters and include at least 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character.',
    };
  }
  if (!confirm) {
    return { valid: false, error: 'Please confirm your new password.' };
  }
  if (pw !== confirm) {
    return { valid: false, error: 'Passwords do not match.' };
  }
  return { valid: true, error: '' };
}

export function mapFirebaseAuthError(error, context = 'login') {
  const code = extractFirebaseAuthCode(error);
  if (context === 'forgot-password' && code === 'auth/user-not-found') {
    return GENERIC_RESET_SUCCESS_MESSAGE;
  }
  if (code && AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }
  if (context === 'forgot-password') {
    return 'Unable to process password reset right now. Please try again later.';
  }
  if (context === 'reset-confirm') {
    return 'Unable to update your password. Please request a new reset link and try again.';
  }
  if (context === 'google') {
    return 'Google sign-in failed. Please try again or contact the system administrator.';
  }
  return 'Authentication failed. Please check your credentials and try again.';
}

export function classifyResetError(error) {
  const code = extractFirebaseAuthCode(error);
  if (code === 'auth/expired-action-code') {
    return {
      kind: 'expired',
      code,
      message: AUTH_ERROR_MESSAGES['auth/expired-action-code'],
      canResend: true,
      canRetry: false,
    };
  }
  if (code === 'auth/invalid-action-code') {
    return {
      kind: 'invalid-code',
      code,
      message: AUTH_ERROR_MESSAGES['auth/invalid-action-code'],
      canResend: true,
      canRetry: false,
    };
  }
  if (code === 'auth/network-request-failed') {
    return {
      kind: 'network',
      code,
      message:
        'Network error while verifying your password reset link. Check your internet connection and retry.',
      canResend: false,
      canRetry: true,
    };
  }
  if (code === 'auth/too-many-requests') {
    return {
      kind: 'too-many-requests',
      code,
      message: AUTH_ERROR_MESSAGES['auth/too-many-requests'],
      canResend: false,
      canRetry: true,
    };
  }
  if (code === 'auth/weak-password') {
    return {
      kind: 'weak-password',
      code,
      message: AUTH_ERROR_MESSAGES['auth/weak-password'],
      canResend: false,
      canRetry: false,
    };
  }
  if (code === 'auth/operation-not-allowed') {
    return {
      kind: 'operation-not-allowed',
      code,
      message:
        'Email/Password sign-in is currently disabled in Firebase Console. Enable Email/Password under Authentication -> Sign-in method before resetting passwords.',
      canResend: false,
      canRetry: false,
    };
  }
  return {
    kind: 'generic',
    code,
    message: mapFirebaseAuthError(error, 'reset-confirm'),
    canResend: true,
    canRetry: false,
  };
}

export function shouldSuppressResetError(error) {
  const code = extractFirebaseAuthCode(error);
  return code === 'auth/user-not-found';
}

export function isLocalDevelopmentOrigin(origin) {
  const val = String(origin || '').trim().toLowerCase();
  return (
    !val ||
    val.startsWith('http://localhost') ||
    val.startsWith('http://127.0.0.1') ||
    val.startsWith('https://localhost') ||
    val.startsWith('https://127.0.0.1')
  );
}

export function buildPasswordResetActionSettings(origin, authDomain, resetToken = '') {
  const cleanOrigin = String(origin || '').trim().replace(/\/+$/, '');
  const cleanAuthDomain = String(authDomain || '').trim();
  const cleanToken = String(resetToken || '').trim();
  if (cleanOrigin && !isLocalDevelopmentOrigin(cleanOrigin)) {
    const query = new URLSearchParams({ reset: '1' });
    if (cleanToken) {
      query.set('resetToken', cleanToken);
    }
    return {
      url: `${cleanOrigin}/reset-password?${query.toString()}`,
      handleCodeInApp: true,
    };
  }
  if (cleanAuthDomain) {
    return {
      url: `https://${cleanAuthDomain}/`,
      handleCodeInApp: false,
    };
  }
  return undefined;
}

function normalizePathname(rawPath = '') {
  const stripped = String(rawPath || '').trim().replace(/\/+$/, '');
  return stripped || '/';
}

function extractParamsFromNestedUrl(rawUrl) {
  if (!rawUrl) return new URLSearchParams();
  try {
    const parsed = new URL(rawUrl, 'https://placeholder.local');
    return parsed.searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export function parsePasswordResetActionParams(search = '', pathname = '/', hash = '') {
  const normalizedPath = normalizePathname(pathname);
  const rawHash = String(hash || '');
  const hashQueryIndex = rawHash.indexOf('?');
  const hashPath = normalizePathname(
    hashQueryIndex >= 0 ? rawHash.slice(0, hashQueryIndex).replace(/^#/, '') : rawHash.replace(/^#/, '')
  );
  const hashSearch = hashQueryIndex >= 0 ? rawHash.slice(hashQueryIndex) : '';

  const primaryParams = new URLSearchParams(String(search || ''));
  const hashParams = new URLSearchParams(hashSearch);

  const rawContinueUrl = (
    primaryParams.get('continueUrl') ||
    hashParams.get('continueUrl') ||
    ''
  ).trim();
  const nestedContinueParams = extractParamsFromNestedUrl(rawContinueUrl);

  const pickParam = (key) =>
    (
      primaryParams.get(key) ||
      hashParams.get(key) ||
      nestedContinueParams.get(key) ||
      ''
    ).trim();

  const mode = pickParam('mode');
  const oobCode = pickParam('oobCode');
  const apiKey = pickParam('apiKey');
  const lang = pickParam('lang');
  const reset = pickParam('reset');
  const resetToken = pickParam('resetToken');

  const isResetPath = normalizedPath === '/reset-password' || hashPath === '/reset-password';
  const invalidMode = Boolean(mode && mode !== 'resetPassword');
  const missingCode = (isResetPath || mode === 'resetPassword') && !invalidMode && !oobCode;
  const isResetRoute = isResetPath || mode === 'resetPassword' || Boolean(oobCode);
  const active = !invalidMode && Boolean(oobCode) && (mode === 'resetPassword' || isResetPath);

  return {
    isResetRoute,
    isResetPath,
    active,
    mode,
    oobCode,
    apiKey,
    continueUrl: rawContinueUrl,
    lang,
    resetToken,
    invalidMode,
    missingCode,
    invalidLink: invalidMode || missingCode,
    resetCompleteHint: reset === '1' || reset === 'success',
  };
}
