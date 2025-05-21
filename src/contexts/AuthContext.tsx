
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
  isPWA: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPWA, setIsPWA] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsPWA(window.matchMedia('(display-mode: standalone)').matches);
    }

    setLoading(true); // Start loading, getRedirectResult or onAuthStateChanged will set it false.

    // Check for redirect result first on app load.
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will handle setting the user and loading state.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        }
        // If result is null, no redirect operation was pending.
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        // Avoid toast for user-cancelled redirects if applicable
        if (error.code !== 'auth/redirect-cancelled' && error.code !== 'auth/redirect-cancelled-by-user') {
           toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
      });
      // .finally(() => {
      //  No setLoading(false) here, onAuthStateChanged handles it.
      // });

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    setLoading(true);
    if (isPWA) {
      try {
        // For PWA, use redirect method
        await signInWithRedirect(auth, googleProvider);
        // Redirect will occur, getRedirectResult will handle the user on return
      } catch (error: any) {
        console.error("Error initiating sign in with redirect: ", error);
        toast({
          title: 'Login Failed',
          description: error.message || 'Could not initiate sign in with Google. Please try again.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    } else {
      // For regular browser, use popup method
      try {
        const result = await signInWithPopup(auth, googleProvider);
        // setLoading(true) was already called.
        // onAuthStateChanged will set user and setLoading(false)
        if (result.user) {
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        }
      } catch (error: any) {
        console.error("Error signing in with Google: ", error);
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
          toast({
            title: 'Login Popup Blocked',
            description: 'The Google Sign-In popup was blocked. Please allow popups and try again, or install the app as a PWA for a smoother experience.',
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Login Failed',
            description: error.message || 'Could not sign in with Google. Please try again.',
            variant: 'destructive',
          });
        }
        setUser(null);
        setLoading(false);
      }
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      // User state will be updated by onAuthStateChanged to null
      toast({ title: 'Logged Out', description: 'You have been successfully signed out.' });
    } catch (error: any) {
      console.error("Error signing out: ", error);
      toast({
        title: 'Logout Failed',
        description: error.message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOutUser, isPWA }}>
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
