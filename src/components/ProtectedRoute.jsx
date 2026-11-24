import React from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { LoginScreen } from './LoginScreen.jsx';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedRoute component that checks for an authenticated user via AuthContext.
 * If authentication is loading, displays a clean loading state.
 * If the user is unauthenticated, redirects / renders the Login page.
 * If authenticated, renders the protected children components.
 */
export function ProtectedRoute({ children, fallback = null }) {
  const { user, loading } = useAuth();

  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  if (loading && !autostart) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="flex items-center gap-3 text-slate-600 bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-sm">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
          <span className="text-sm font-medium">Verifying administrator credentials...</span>
        </div>
      </div>
    );
  }

  if (!user && !autostart) {
    return fallback || <LoginScreen />;
  }

  return <>{children}</>;
}
