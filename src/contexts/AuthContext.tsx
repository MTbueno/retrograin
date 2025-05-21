
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signOut, signInWithRedirect, getRedirectResult, onAuthStateChanged } from '@/lib/firebase';
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
    setLoading(true); // Ensure loading is true while checking auth state

    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will also fire, this is more for an immediate toast.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        }
        // Do not setLoading(false) here; onAuthStateChanged will handle it.
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        // Avoid toast for common "no-redirect" or "cancelled" cases
        if (error.code !== 'auth/redirect-cancelled' &&
            error.code !== 'auth/redirect-cancelled-by-user' &&
            error.code !== 'auth/no-redirect-operation') {
          toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
        // Do not setLoading(false) here; onAuthStateChanged will handle it.
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
      // Always use redirect for PWA/Nativefier consistency
      await signInWithRedirect(auth, googleProvider);
      // Redirect will occur. setLoading(false) will happen when onAuthStateChanged resolves after redirect.
    } catch (error: any) {
      console.error("Error initiating Google sign-in redirect: ", error);
      toast({
        title: 'Login Initiation Failed',
        description: error.message || 'Could not start Google sign-in process.',
        variant: 'destructive',
      });
      setLoading(false); // Set loading to false if redirect initiation itself fails
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
