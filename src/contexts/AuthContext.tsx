
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signOut, signInWithRedirect, getRedirectResult, onAuthStateChanged } from '@/lib/firebase'; // Changed firebaseSignOut to signOut
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
    setLoading(true); // Explicitly set loading true at the start of effect

    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will handle setting the user state.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google after redirect.' });
        }
        // If result is null, no redirect operation was pending or it was handled.
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        if (error.code !== 'auth/redirect-cancelled' && 
            error.code !== 'auth/redirect-cancelled-by-user' && 
            error.code !== 'auth/no-redirect-operation') {
           toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
      });
      // setLoading(false) is NOT called here; onAuthStateChanged will handle it.

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved (or confirmed no user), set loading to false.
    });

    return () => unsubscribe();
  }, [toast]);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      // Always use signInWithRedirect
      await signInWithRedirect(auth, googleProvider);
      // Redirect will occur. The useEffect above will handle the result when the app reloads.
      // setLoading(false) is not needed here as the page will redirect.
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
      await signOut(auth); // Use signOut directly
      // User state will be updated to null by onAuthStateChanged, 
      // which also sets loading to false.
      toast({ title: 'Logged Out', description: 'You have been successfully signed out.' });
    } catch (error: any) {
      console.error("Error signing out: ", error);
      toast({
        title: 'Logout Failed',
        description: error.message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
      setLoading(false); // Explicitly set loading false on sign out error as onAuthStateChanged might not fire if user was already null
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
