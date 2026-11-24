#!/usr/bin/env node
/**
 * Firebase Authentication & Project Configuration Diagnostic Script
 *
 * Verifies:
 * 1. firebase-applet-config.json validity (required keys, no remix placeholders)
 * 2. Frontend SDK wiring (src/firebase.js & src/services/authService.js)
 * 3. Live Firebase Identity Toolkit project config & authorizedDomains reachability
 * 4. Email/Password Sign-In provider status (detects PASSWORD_LOGIN_DISABLED / auth/operation-not-allowed)
 * 5. Password Reset (sendOobCode PASSWORD_RESET) endpoint availability
 *
 * Usage:
 *   node scripts/verify_firebase_auth.mjs
 *   node scripts/verify_firebase_auth.mjs --json
 *   node scripts/verify_firebase_auth.mjs --allow-disabled
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const JSON_OUTPUT = args.has('--json');
const ALLOW_DISABLED = args.has('--allow-disabled');

function readJson(relPath) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing required file: ${relPath}`);
  }
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function readText(relPath) {
  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) {
    return '';
  }
  return fs.readFileSync(fullPath, 'utf8');
}

async function runDiagnostics() {
  const report = {
    timestamp: new Date().toISOString(),
    configCheck: { passed: false, details: {} },
    frontendWiringCheck: { passed: false, details: {} },
    projectConfigCheck: { passed: false, details: {} },
    emailPasswordProviderCheck: { enabled: false, status: 'UNKNOWN', details: {} },
    passwordResetEndpointCheck: { reachable: false, details: {} },
    overallStatus: 'FAIL',
    remediationSteps: [],
  };

  // 1. Validate firebase-applet-config.json
  const cfg = readJson('firebase-applet-config.json');
  const requiredFields = [
    'projectId',
    'appId',
    'apiKey',
    'authDomain',
    'firestoreDatabaseId',
    'messagingSenderId',
  ];
  const missingFields = requiredFields.filter((k) => !String(cfg[k] || '').trim());
  const hasPlaceholder =
    String(cfg.projectId || '').includes('remixed') ||
    String(cfg.firestoreDatabaseId || '').includes('remixed') ||
    String(cfg.apiKey || '').includes('YOUR_');

  const expectedAuthDomain = `${cfg.projectId}.firebaseapp.com`;
  const appIdMatchesSender = String(cfg.appId || '').startsWith(`1:${cfg.messagingSenderId}:`);

  report.configCheck = {
    passed: missingFields.length === 0 && !hasPlaceholder && appIdMatchesSender,
    details: {
      projectId: cfg.projectId,
      authDomain: cfg.authDomain,
      expectedAuthDomain,
      authDomainMatchesProject: cfg.authDomain === expectedAuthDomain,
      firestoreDatabaseId: cfg.firestoreDatabaseId,
      messagingSenderId: cfg.messagingSenderId,
      appIdMatchesSender,
      missingFields,
      hasPlaceholder,
    },
  };

  // 2. Verify frontend Firebase & authService wiring
  const firebaseJs = readText('src/firebase.js');
  const authServiceJs = readText('src/services/authService.js');
  const authErrorsJs = readText('src/utils/authErrors.js');
  const appJsx = readText('src/App.jsx');
  const loginScreenJsx = readText('src/components/LoginScreen.jsx');
  const forgotPasswordJsx = readText('src/components/auth/ForgotPassword.jsx');
  const resetPasswordJsx = readText('src/components/auth/ResetPassword.jsx');

  const wiringDetails = {
    usesInitializeApp: firebaseJs.includes('initializeApp(firebaseConfig)'),
    usesGetAuth: firebaseJs.includes('getAuth(app)'),
    usesNamedFirestoreDb: firebaseJs.includes('getFirestore(app, firebaseConfig.firestoreDatabaseId)'),
    usesSignInWithEmailAndPassword: authServiceJs.includes('signInWithEmailAndPassword'),
    usesSendPasswordResetEmail:
      authServiceJs.includes('sendPasswordResetEmail') &&
      forgotPasswordJsx.includes('sendPasswordResetEmail'),
    usesVerifyAndConfirmReset:
      resetPasswordJsx.includes('verifyPasswordResetCode') &&
      resetPasswordJsx.includes('confirmPasswordReset') &&
      resetPasswordJsx.includes('oobCode'),
    mountsResetRouteBeforeProtectedRoute:
      appJsx.includes('ResetPassword') &&
      appJsx.includes('path="/reset-password"') &&
      authErrorsJs.includes('/reset-password'),
    hasForgotPasswordComponent:
      forgotPasswordJsx.includes('GENERIC_RESET_SUCCESS_MESSAGE') &&
      loginScreenJsx.includes('ForgotPassword'),
    handlesOperationNotAllowed:
      authErrorsJs.includes('auth/operation-not-allowed') ||
      loginScreenJsx.includes('auth/operation-not-allowed'),
    hasPublicAdminSignupUI: loginScreenJsx.includes('Create Administrator Account'),
  };
  report.frontendWiringCheck = {
    passed:
      wiringDetails.usesInitializeApp &&
      wiringDetails.usesGetAuth &&
      wiringDetails.usesNamedFirestoreDb &&
      wiringDetails.usesSignInWithEmailAndPassword &&
      wiringDetails.usesSendPasswordResetEmail &&
      wiringDetails.usesVerifyAndConfirmReset &&
      wiringDetails.mountsResetRouteBeforeProtectedRoute &&
      wiringDetails.hasForgotPasswordComponent &&
      wiringDetails.handlesOperationNotAllowed &&
      !wiringDetails.hasPublicAdminSignupUI,
    details: wiringDetails,
  };

  // 3. Query Identity Toolkit getProjectConfig
  try {
    const pcRes = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(cfg.apiKey)}`
    );
    const pcBody = await pcRes.json().catch(() => ({}));
    const authorizedDomains = Array.isArray(pcBody.authorizedDomains) ? pcBody.authorizedDomains : [];
    const expectedAppHosts = [
      `${cfg.projectId}.firebaseapp.com`,
      process.env.APP_URL ? new URL(process.env.APP_URL).hostname : null,
    ].filter(Boolean);
    const missingHosts = expectedAppHosts.filter((h) => !authorizedDomains.includes(h));

    report.projectConfigCheck = {
      passed: pcRes.ok && String(pcBody.projectId || '') === String(cfg.messagingSenderId || ''),
      details: {
        httpStatus: pcRes.status,
        projectNumber: pcBody.projectId || null,
        matchesMessagingSenderId: String(pcBody.projectId || '') === String(cfg.messagingSenderId || ''),
        authorizedDomains,
        missingExpectedHosts: missingHosts,
        error: pcRes.ok ? null : pcBody?.error?.message || `HTTP ${pcRes.status}`,
      },
    };
  } catch (err) {
    report.projectConfigCheck = {
      passed: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  // 4. Probe Email/Password Sign-In Provider via synthetic non-existent credentials
  try {
    const siRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'diagnostic-probe-nonexistent@invalid.local',
          password: 'DiagnosticProbePassword_12345!',
          returnSecureToken: true,
        }),
      }
    );
    const siBody = await siRes.json().catch(() => ({}));
    const rawMsg = String(siBody?.error?.message || '');
    const disabled =
      rawMsg.includes('PASSWORD_LOGIN_DISABLED') || rawMsg.includes('OPERATION_NOT_ALLOWED');
    const providerActive =
      rawMsg.includes('INVALID_LOGIN_CREDENTIALS') ||
      rawMsg.includes('EMAIL_NOT_FOUND') ||
      rawMsg.includes('INVALID_PASSWORD') ||
      rawMsg.includes('TOO_MANY_ATTEMPTS_TRY_LATER');

    report.emailPasswordProviderCheck = {
      enabled: providerActive && !disabled,
      status: disabled ? 'DISABLED' : providerActive ? 'ENABLED' : 'ERROR',
      details: {
        httpStatus: siRes.status,
        identityToolkitCode: rawMsg || null,
        mapsToFirebaseClientError: disabled
          ? 'auth/operation-not-allowed'
          : providerActive
            ? 'none (provider active)'
            : 'unknown',
      },
    };

    if (disabled) {
      report.remediationSteps.push(
        `Open Firebase Console Authentication Sign-in method: https://console.firebase.google.com/project/${cfg.projectId}/authentication/providers`,
        'Click "Email/Password" under Sign-in providers.',
        'Toggle "Email/Password" to Enabled and click "Save".',
        `Verify authorized domains under Authentication -> Settings -> Authorized domains include your Cloud Run URLs and ${cfg.authDomain}.`
      );
    }
  } catch (err) {
    report.emailPasswordProviderCheck = {
      enabled: false,
      status: 'NETWORK_ERROR',
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  // 5. Probe Password Reset (sendOobCode PASSWORD_RESET) reachability
  try {
    const rpRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: 'diagnostic-probe-nonexistent@invalid.local',
        }),
      }
    );
    const rpBody = await rpRes.json().catch(() => ({}));
    const rpErr = String(rpBody?.error?.message || '');
    const reachable =
      rpRes.ok || rpErr.includes('EMAIL_NOT_FOUND') || rpErr.includes('TOO_MANY_ATTEMPTS_TRY_LATER');
    report.passwordResetEndpointCheck = {
      reachable,
      details: {
        httpStatus: rpRes.status,
        responseCode: rpErr || 'OK',
      },
    };
  } catch (err) {
    report.passwordResetEndpointCheck = {
      reachable: false,
      details: { error: err instanceof Error ? err.message : String(err) },
    };
  }

  const allPassed =
    report.configCheck.passed &&
    report.frontendWiringCheck.passed &&
    report.projectConfigCheck.passed &&
    report.emailPasswordProviderCheck.enabled &&
    report.passwordResetEndpointCheck.reachable;

  const diagnosticOnlyPassed =
    report.configCheck.passed &&
    report.frontendWiringCheck.passed &&
    report.projectConfigCheck.passed &&
    report.passwordResetEndpointCheck.reachable;

  report.overallStatus = allPassed
    ? 'PASS'
    : diagnosticOnlyPassed && ALLOW_DISABLED
      ? 'PASS_WITH_DISABLED_PROVIDER'
      : 'FAIL';

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('=== ExamGrid GA Firebase Auth Diagnostic ===');
    console.log(`Project ID        : ${cfg.projectId} (Number: ${report.projectConfigCheck.details.projectNumber || 'N/A'})`);
    console.log(`Auth Domain       : ${cfg.authDomain}`);
    console.log(`Firestore DB ID   : ${cfg.firestoreDatabaseId}`);
    console.log(`Config Valid      : ${report.configCheck.passed ? 'YES' : 'NO'}`);
    console.log(`Frontend Wiring   : ${report.frontendWiringCheck.passed ? 'YES' : 'NO'}`);
    console.log(`Project Config API: ${report.projectConfigCheck.passed ? 'OK' : 'FAIL'}`);
    console.log(
      `Email/Password    : ${report.emailPasswordProviderCheck.status} (${report.emailPasswordProviderCheck.details.identityToolkitCode || 'N/A'})`
    );
    console.log(
      `Password Reset API: ${report.passwordResetEndpointCheck.reachable ? 'REACHABLE' : 'UNREACHABLE'} (${report.passwordResetEndpointCheck.details.responseCode})`
    );
    console.log(`Authorized Domains: ${(report.projectConfigCheck.details.authorizedDomains || []).join(', ') || 'None'}`);
    if (report.remediationSteps.length > 0) {
      console.log('\nAction Required in Firebase Console:');
      report.remediationSteps.forEach((step, idx) => console.log(`  ${idx + 1}. ${step}`));
    }
    console.log(`\nOverall Result    : ${report.overallStatus}`);
  }

  process.exit(report.overallStatus === 'FAIL' ? 1 : 0);
}

runDiagnostics().catch((err) => {
  console.error('Diagnostic failed unexpectedly:', err);
  process.exit(1);
});
