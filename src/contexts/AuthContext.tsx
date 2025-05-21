
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut as firebaseSignOut, signInWithRedirect, getRedirectResult, onAuthStateChanged } from '@/lib/firebase';
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
    // setLoading(true) is already done at initialization.
    // onAuthStateChanged will set it to false once the auth state is resolved.

    // Check for redirect result first on app load.
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will handle setting the user and further loading state.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google after redirect.' });
        }
        // If result is null, no redirect operation was pending or it was handled.
        // onAuthStateChanged will still run to set initial auth state and loading.
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        if (error.code !== 'auth/redirect-cancelled' && error.code !== 'auth/redirect-cancelled-by-user') {
           toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
        // Ensure loading is false if redirect processing fails and onAuthStateChanged might not immediately resolve.
        // However, onAuthStateChanged should still fire.
      });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved, set loading to false.
    });

    return () => unsubscribe();
  }, [toast]); // Added toast as it's used in the effect, though its instance is stable from useToast.

  const signInWithGoogle = async () => {
    setLoading(true); // Indicate an operation is starting

    const isPwaMode = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

    if (isPwaMode) {
      // PWA mode: Use signInWithRedirect
      try {
        await signInWithRedirect(auth, googleProvider);
        // The app will navigate away. setLoading(false) is implicitly handled on page reload by onAuthStateChanged.
      } catch (error: any) {
        console.error("Error initiating sign in with redirect: ", error);
        toast({
          title: 'Login Failed',
          description: error.message || 'Could not initiate sign in with Google via redirect.',
          variant: 'destructive',
        });
        setLoading(false); // Reset loading if redirect initiation fails
      }
    } else {
      // Non-PWA mode: Use signInWithPopup
      try {
        const result = await signInWithPopup(auth, googleProvider);
        // If successful, onAuthStateChanged will set the user and setLoading(false).
        if (result.user) {
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        }
        // No setLoading(false) here for success case with popup, as onAuthStateChanged covers it.
      } catch (error: any) {
        console.error("Error signing in with Google Popup: ", error);
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
          toast({
            title: 'Login Popup Blocked',
            description: 'The Google Sign-In popup was blocked or cancelled. Please allow popups for this site.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Login Failed',
            description: error.message || 'Could not sign in with Google via popup.',
            variant: 'destructive',
          });
        }
        setUser(null); // Ensure user state is cleared if popup fails
        setLoading(false); // Reset loading if popup fails
      }
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      // User state will be updated by onAuthStateChanged to null, which also sets loading to false.
      toast({ title: 'Logged Out', description: 'You have been successfully signed out.' });
    } catch (error: any) {
      console.error("Error signing out: ", error);
      toast({
        title: 'Logout Failed',
        description: error.message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
      setLoading(false); // Explicitly set loading false on sign out error
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
