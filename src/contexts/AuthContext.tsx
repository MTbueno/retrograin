
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signOut, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true); // Initialize loading to true
  const { toast } = useToast();

  useEffect(() => {
    // This effect runs once on mount to handle initial auth state and redirect results
    setLoading(true);

    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will also fire, this is more for an immediate toast or specific redirect handling.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google via redirect.' });
        }
        // setLoading(false) will be handled by onAuthStateChanged
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        // Avoid toast for common "no-redirect" or "cancelled" cases
        if (error.code !== 'auth/redirect-cancelled' &&
            error.code !== 'auth/redirect-cancelled-by-user' &&
            error.code !== 'auth/no-redirect-operation') {
          toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
        // setLoading(false) will be handled by onAuthStateChanged
      });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved (user or null), set loading to false.
    });

    return () => unsubscribe();
  }, [toast]); // Added toast to dependency array

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      let isPwaMode = false;
      if (typeof window !== 'undefined') {
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isMinimalUi = window.matchMedia('(display-mode: minimal-ui)').matches;
        // navigator.standalone is a non-standard property, primarily for older iOS Safari PWAs, but worth checking.
        const navigatorStandalone = (window.navigator as any)?.standalone === true;
        isPwaMode = isStandalone || isMinimalUi || navigatorStandalone;
      }

      if (isPwaMode) {
        // For PWA, use redirect method
        await signInWithRedirect(auth, googleProvider);
        // Redirect will occur. setLoading(false) will happen when onAuthStateChanged resolves after redirect.
      } else {
        // For regular browser tabs, use popup method
        await signInWithPopup(auth, googleProvider);
        // For popup, success means onAuthStateChanged will eventually fire and set user/loading.
        // We can show an immediate toast here.
        toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        // setLoading(false) will be handled by onAuthStateChanged
      }
    } catch (error: any) {
      console.error("Error signing in: ", error);
      let description = error.message || 'Could not sign in with Google.';
      if (error.code === 'auth/popup-blocked') {
        description = "The Google Sign-In popup was blocked. Please check your browser settings to allow popups for this site.";
      }
      toast({
        title: 'Login Failed',
        description,
        variant: 'destructive',
      });
      setLoading(false); // Set loading to false ONLY on a caught error here (e.g. popup blocked before Firebase takes over)
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will set user to null and loading to false.
      toast({ title: 'Logged Out', description: 'You have been successfully signed out.' });
    } catch (error: any) {
      console.error("Error signing out: ", error);
      toast({
        title: 'Logout Failed',
        description: error.message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
      setLoading(false); // Explicitly set loading false on sign out error to re-enable UI
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
