
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
    // Process redirect result first on app load.
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will handle setting the user.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google after redirect.' });
        }
        // If result is null, no redirect operation was pending.
        // onAuthStateChanged will still run to set initial auth state.
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        if (error.code !== 'auth/redirect-cancelled' && error.code !== 'auth/redirect-cancelled-by-user') {
           toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
      })
      .finally(() => {
        // Whether redirect processing succeeded or failed,
        // allow onAuthStateChanged to be the final arbiter of loading state.
        // However, if onAuthStateChanged doesn't fire quickly, this might be too soon.
        // The primary setLoading(false) should be in onAuthStateChanged.
      });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved, set loading to false.
    });

    return () => unsubscribe();
  }, [toast]);

  const signInWithGoogle = async () => {
    setLoading(true); // Indicate an auth operation is starting

    const isPwaMode = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;

    if (isPwaMode) {
      // PWA mode: Use signInWithRedirect
      try {
        await signInWithRedirect(auth, googleProvider);
        // Redirect will occur. setLoading(false) will be handled by onAuthStateChanged on return.
      } catch (error: any) {
        console.error("Error initiating sign in with redirect: ", error);
        toast({
          title: 'Login Failed',
          description: error.message || 'Could not initiate sign in with Google via redirect.',
          variant: 'destructive',
        });
        setLoading(false); // Reset loading if redirect initiation itself fails
      }
    } else {
      // Non-PWA mode: Use signInWithPopup
      try {
        const result = await signInWithPopup(auth, googleProvider);
        // If successful, onAuthStateChanged will set the user and eventually setLoading(false).
        if (result.user) {
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        }
        // No explicit setLoading(false) here for success, onAuthStateChanged handles it.
      } catch (error: any) {
        console.error("Error signing in with Google Popup: ", error);
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
          toast({
            title: 'Login Popup Blocked',
            description: 'The Google Sign-In popup was blocked. Please check your browser settings to allow popups for this site, or try adding this app to your homescreen (if available) for a different login experience.',
            variant: 'destructive',
            duration: 8000, // Longer duration for this important message
          });
        } else {
          toast({
            title: 'Login Failed',
            description: error.message || 'Could not sign in with Google via popup.',
            variant: 'destructive',
          });
        }
        // setUser(null); // onAuthStateChanged should handle this if auth state truly changes to null
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
