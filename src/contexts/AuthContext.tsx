
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
    // setLoading(true); // Already true by default

    // Check for redirect result first
    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will handle setting the user state and final loading state.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google via redirect.' });
        }
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        // Avoid toast for common "no-redirect" cases, but show for actual errors
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
      const isPwaMode = typeof window !== 'undefined' &&
        (window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches);

      if (isPwaMode) {
        await signInWithRedirect(auth, googleProvider);
        // Redirect will occur. Loading state will be handled by useEffect processing redirect result
        // and onAuthStateChanged setting loading to false.
      } else {
        // Use signInWithPopup for non-PWA contexts
        const result = await signInWithPopup(auth, googleProvider);
        // setUser(result.user); // This will be handled by onAuthStateChanged
        toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
        // setLoading(false) will be handled by onAuthStateChanged when user state updates
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
      setLoading(false); // Set loading to false on error to re-enable UI
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await signOut(auth);
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
