import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENERIC_RESET_SUCCESS_MESSAGE,
  buildPasswordResetActionSettings,
  classifyResetError,
  evaluatePasswordStrength,
  extractFirebaseAuthCode,
  getPasswordStrengthStatus,
  mapFirebaseAuthError,
  parsePasswordResetActionParams,
  shouldSuppressResetError,
  validateEmailInput,
  validateLoginInput,
  validateNewPasswordInput,
} from './authErrors.js';

test('extractFirebaseAuthCode extracts code from error object or Firebase message string', () => {
  assert.equal(extractFirebaseAuthCode({ code: 'auth/operation-not-allowed' }), 'auth/operation-not-allowed');
  assert.equal(
    extractFirebaseAuthCode(new Error('Firebase: Error (auth/operation-not-allowed).')),
    'auth/operation-not-allowed'
  );
  assert.equal(extractFirebaseAuthCode(new Error('Something unexpected')), '');
});

test('mapFirebaseAuthError maps every required Firebase error code to user-friendly message without raw codes', () => {
  const cases = [
    ['auth/operation-not-allowed', 'Email/Password sign-in is not enabled. Contact the system administrator.'],
    ['auth/invalid-credential', 'Invalid email or password.'],
    ['auth/user-not-found', 'No account exists with this email address.'],
    ['auth/wrong-password', 'Incorrect password.'],
    ['auth/too-many-requests', 'Too many attempts. Please try again later.'],
    ['auth/network-request-failed', 'Network error. Check your internet connection.'],
    ['auth/user-disabled', 'This account has been disabled. Contact the administrator.'],
  ];

  for (const [code, expected] of cases) {
    const mapped = mapFirebaseAuthError({ code, message: `Firebase: Error (${code}).` }, 'login');
    assert.equal(mapped, expected);
    assert.equal(mapped.includes('auth/'), false);
    assert.equal(mapped.includes('Firebase:'), false);
  }
});

test('forgot-password context never exposes user-not-found account existence', () => {
  const err = { code: 'auth/user-not-found', message: 'Firebase: Error (auth/user-not-found).' };
  assert.equal(shouldSuppressResetError(err), true);
  assert.equal(mapFirebaseAuthError(err, 'forgot-password'), GENERIC_RESET_SUCCESS_MESSAGE);

  const throttled = { code: 'auth/too-many-requests' };
  assert.equal(shouldSuppressResetError(throttled), false);
  assert.equal(
    mapFirebaseAuthError(throttled, 'forgot-password'),
    'Too many attempts. Please try again later.'
  );
});

test('classifyResetError distinguishes expired, invalid-code, network, too-many-requests, and weak-password', () => {
  const expired = classifyResetError({ code: 'auth/expired-action-code' });
  assert.equal(expired.kind, 'expired');
  assert.equal(expired.canResend, true);
  assert.match(expired.message, /expired/i);

  const used = classifyResetError({ code: 'auth/invalid-action-code' });
  assert.equal(used.kind, 'invalid-code');
  assert.equal(used.canResend, true);
  assert.match(used.message, /already been used/i);

  const net = classifyResetError({ code: 'auth/network-request-failed' });
  assert.equal(net.kind, 'network');
  assert.equal(net.canRetry, true);

  const throttle = classifyResetError({ code: 'auth/too-many-requests' });
  assert.equal(throttle.kind, 'too-many-requests');
  assert.equal(throttle.canRetry, true);

  const weak = classifyResetError({ code: 'auth/weak-password' });
  assert.equal(weak.kind, 'weak-password');
  assert.match(weak.message, /8 characters/i);

  const disabled = classifyResetError({ code: 'auth/operation-not-allowed' });
  assert.equal(disabled.kind, 'operation-not-allowed');
  assert.equal(disabled.canResend, false);
  assert.equal(disabled.canRetry, false);
});

test('evaluatePasswordStrength and validateNewPasswordInput enforce all 5 complexity rules and matching', () => {
  assert.equal(validateEmailInput('').valid, false);
  assert.equal(validateEmailInput('not-an-email').valid, false);
  assert.equal(validateEmailInput(' admin@university.edu ').valid, true);
  assert.equal(validateEmailInput(' admin@university.edu ').email, 'admin@university.edu');

  assert.equal(validateLoginInput('admin@university.edu', '').valid, false);
  assert.equal(validateLoginInput('admin@university.edu', '12345').valid, false);
  assert.equal(validateLoginInput('admin@university.edu', '123456').valid, true);

  assert.deepEqual(evaluatePasswordStrength('Strong1!'), {
    minLength: true,
    hasUppercase: true,
    hasLowercase: true,
    hasNumber: true,
    hasSpecialChar: true,
    score: 5,
    percent: 100,
    level: 'strong',
    strengthLabel: 'Strong',
    allMet: true,
  });
  assert.equal(evaluatePasswordStrength('').level, 'empty');
  assert.equal(evaluatePasswordStrength('abc').level, 'weak');
  assert.equal(evaluatePasswordStrength('Abcdefgh').level, 'fair');
  assert.equal(evaluatePasswordStrength('Abcdefg1').level, 'good');

  assert.match(getPasswordStrengthStatus(''), /Must include 8\+ characters/i);
  assert.match(getPasswordStrengthStatus('abc'), /Add 8\+ characters, uppercase letter, number, special character/i);
  assert.equal(getPasswordStrengthStatus('Strong1!'), 'All password complexity requirements met.');

  // Missing special char, uppercase, number, or length < 8 must fail
  assert.equal(validateNewPasswordInput('short', 'short').valid, false);
  assert.equal(validateNewPasswordInput('lowercase1!', 'lowercase1!').valid, false);
  assert.equal(validateNewPasswordInput('UPPERCASE1!', 'UPPERCASE1!').valid, false);
  assert.equal(validateNewPasswordInput('NoNumbers!!', 'NoNumbers!!').valid, false);
  assert.equal(validateNewPasswordInput('NoSpecial12', 'NoSpecial12').valid, false);
  assert.equal(validateNewPasswordInput('StrongPass1!', 'Different1!').valid, false);
  assert.equal(validateNewPasswordInput('StrongPass1!', 'StrongPass1!').valid, true);
});

test('buildPasswordResetActionSettings points deployed origin to /reset-password and falls back to authDomain on localhost', () => {
  const prodSettings = buildPasswordResetActionSettings(
    'https://ais-dev-iohybruky3rxypvcupkkgl-775353331947.asia-southeast1.run.app/',
    'gen-lang-client-0697181413.firebaseapp.com',
    'tok_abc123'
  );
  assert.deepEqual(prodSettings, {
    url: 'https://ais-dev-iohybruky3rxypvcupkkgl-775353331947.asia-southeast1.run.app/reset-password?reset=1&resetToken=tok_abc123',
    handleCodeInApp: true,
  });

  const localSettings = buildPasswordResetActionSettings(
    'http://localhost:3000',
    'gen-lang-client-0697181413.firebaseapp.com',
    'tok_abc123'
  );
  assert.deepEqual(localSettings, {
    url: 'https://gen-lang-client-0697181413.firebaseapp.com/',
    handleCodeInApp: false,
  });
});

test('parsePasswordResetActionParams handles /reset-password, root links, wrong mode, missing oobCode, and extra params', () => {
  const full = parsePasswordResetActionParams(
    '?mode=resetPassword&oobCode=ABC123xyz&apiKey=AIzaTest&continueUrl=https%3A%2F%2Fapp.example%2F&lang=en&resetToken=tok_999',
    '/reset-password'
  );
  assert.deepEqual(full, {
    isResetRoute: true,
    isResetPath: true,
    active: true,
    mode: 'resetPassword',
    oobCode: 'ABC123xyz',
    apiKey: 'AIzaTest',
    continueUrl: 'https://app.example/',
    lang: 'en',
    resetToken: 'tok_999',
    invalidMode: false,
    missingCode: false,
    invalidLink: false,
    resetCompleteHint: false,
  });

  const missingCodeOnRoute = parsePasswordResetActionParams('', '/reset-password');
  assert.equal(missingCodeOnRoute.isResetRoute, true);
  assert.equal(missingCodeOnRoute.missingCode, true);
  assert.equal(missingCodeOnRoute.invalidMode, false);
  assert.equal(missingCodeOnRoute.active, false);

  const wrongMode = parsePasswordResetActionParams('?mode=verifyEmail&oobCode=XYZ', '/reset-password');
  assert.equal(wrongMode.isResetRoute, true);
  assert.equal(wrongMode.invalidMode, true);
  assert.equal(wrongMode.active, false);

  const rootResetSuccess = parsePasswordResetActionParams('?reset=success', '/');
  assert.equal(rootResetSuccess.isResetRoute, false);
  assert.equal(rootResetSuccess.resetCompleteHint, true);
});
