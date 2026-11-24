import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutAdmin,
  subscribeToAuthChanges,
  requestPasswordReset,
  verifyResetCode,
  completePasswordReset,
  syncAdminIdentity,
} from '../services/authService.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToAuthChanges((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser?.uid && firebaseUser?.email) {
        syncAdminIdentity(firebaseUser.email, firebaseUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  const value = {
    user,
    loading,
    login: signInWithEmail,
    signup: signUpWithEmail,
    loginWithGoogle: signInWithGoogle,
    logout: signOutAdmin,
    requestPasswordReset,
    verifyResetCode,
    completePasswordReset,
  };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
