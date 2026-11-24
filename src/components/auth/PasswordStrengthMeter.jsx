import React, { useMemo } from 'react';
import { CheckCircle2, Circle, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  PASSWORD_REQUIREMENTS,
  evaluatePasswordStrength,
  getPasswordStrengthStatus,
} from '../../utils/authErrors.js';

const LEVEL_STYLES = {
  empty: {
    bar: 'bg-slate-200',
    badge: 'text-slate-600 bg-slate-100 border-slate-200',
    status: 'text-slate-500',
  },
  weak: {
    bar: 'bg-red-600',
    badge: 'text-red-700 bg-red-50 border-red-200',
    status: 'text-red-700',
  },
  fair: {
    bar: 'bg-amber-500',
    badge: 'text-amber-800 bg-amber-50 border-amber-200',
    status: 'text-amber-800',
  },
  good: {
    bar: 'bg-blue-600',
    badge: 'text-blue-700 bg-blue-50 border-blue-200',
    status: 'text-blue-700',
  },
  strong: {
    bar: 'bg-emerald-600',
    badge: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    status: 'text-emerald-700',
  },
};

/**
 * Reusable PasswordStrengthMeter component.
 * Evaluates password complexity (length, uppercase, lowercase, numbers, special characters)
 * and renders a segmented progress bar, strength badge, descriptive status text,
 * and optional requirement checklist / match indicator.
 */
export function PasswordStrengthMeter({
  password = '',
  confirmPassword = undefined,
  showMatchIndicator = false,
  showRequirements = true,
  className = '',
}) {
  const strength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const statusText = useMemo(() => getPasswordStrengthStatus(password), [password]);
  const styles = LEVEL_STYLES[strength.level] || LEVEL_STYLES.empty;
  const passwordsMatch =
    Boolean(confirmPassword) && Boolean(password) && password === confirmPassword;

  return (
    <div
      aria-label="Password strength and requirements"
      data-testid="password-strength-meter"
      data-strength-level={strength.level}
      data-percent={strength.percent}
      className={`p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-3 ${className}`.trim()}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            {strength.allMet ? (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <ShieldAlert className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            Password Strength
          </span>
          <span
            data-testid="password-strength-label"
            className={`text-xs font-semibold px-2 py-0.5 rounded border ${styles.badge}`}
          >
            {strength.strengthLabel} ({strength.score}/5)
          </span>
        </div>

        <div
          role="progressbar"
          data-testid="password-strength-progressbar"
          aria-label="Password strength"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={strength.percent}
          aria-valuetext={`${strength.strengthLabel}, ${strength.score} of 5 requirements met (${strength.percent}%)`}
          className="grid grid-cols-5 gap-1.5"
        >
          {[1, 2, 3, 4, 5].map((segment) => {
            const active = strength.score >= segment;
            return (
              <div
                key={segment}
                className={`h-1.5 rounded-full transition-colors ${
                  active ? styles.bar : 'bg-slate-200'
                }`}
              />
            );
          })}
        </div>

        <p
          data-testid="password-strength-status"
          aria-live="polite"
          className={`text-xs leading-relaxed ${styles.status}`}
        >
          {statusText}
        </p>
      </div>

      {showRequirements && (
        <ul data-testid="password-requirements-list" className="space-y-1.5">
          {PASSWORD_REQUIREMENTS.map((req) => {
            const met = strength[req.id];
            return (
              <li
                key={req.id}
                data-requirement-id={req.id}
                data-met={met ? 'true' : 'false'}
                className={`flex items-center gap-2 text-xs ${
                  met ? 'text-emerald-700 font-medium' : 'text-slate-600'
                }`}
              >
                {met ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                )}
                <span>{req.label}</span>
              </li>
            );
          })}

          {showMatchIndicator && (
            <li
              data-requirement-id="passwordsMatch"
              data-met={passwordsMatch ? 'true' : 'false'}
              className={`flex items-center gap-2 text-xs ${
                passwordsMatch ? 'text-emerald-700 font-medium' : 'text-slate-600'
              }`}
            >
              {passwordsMatch ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              <span>Passwords match</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default PasswordStrengthMeter;
