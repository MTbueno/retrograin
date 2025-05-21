
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
        // Avoid toasting for common "no redirect" scenarios or user cancellations
        if (error.code !== 'auth/redirect-cancelled' && error.code !== 'auth/redirect-cancelled-by-user' && error.code !== 'auth/no-redirect-operation') {
           toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
      })
      .finally(() => {
        // Whether redirect processing succeeded or failed,
        // allow onAuthStateChanged to be the final arbiter of loading state.
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

    // Always use signInWithRedirect
    try {
      await signInWithRedirect(auth, googleProvider);
      // Redirect will occur. setLoading(false) will be handled by onAuthStateChanged on return,
      // or if the initiation of redirect itself fails below.
    } catch (error: any) {
      console.error("Error initiating sign in with redirect: ", error);
      toast({
        title: 'Login Failed',
        description: error.message || 'Could not initiate sign in with Google via redirect.',
        variant: 'destructive',
      });
      setLoading(false); // Reset loading if redirect initiation itself fails
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
