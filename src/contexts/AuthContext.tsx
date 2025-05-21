
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
    setLoading(true); // Ensure loading is true while checking auth state

    getRedirectResult(auth)
      .then((result) => {
        if (result && result.user) {
          // User signed in via redirect.
          // onAuthStateChanged will also fire, but this can be used for an immediate toast.
          toast({ title: 'Logged In!', description: 'Successfully signed in with Google via redirect.' });
        }
      })
      .catch((error) => {
        console.error("Error processing redirect result:", error);
        // Avoid toast for common "no-redirect" or "cancelled" cases, but show for actual errors.
        if (error.code !== 'auth/redirect-cancelled' &&
            error.code !== 'auth/redirect-cancelled-by-user' &&
            error.code !== 'auth/no-redirect-operation') {
          toast({ title: 'Login Error', description: error.message || 'Failed to process sign-in after redirect.', variant: 'destructive' });
        }
      });
      // setLoading(false) will be handled by onAuthStateChanged

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved (or confirmed no user), set loading to false.
    });

    return () => unsubscribe();
  }, [toast]);

  const signInWithGoogle = async () => {
    setLoading(true); // Set loading true at the start of the authentication attempt
    try {
      let isPwaMode = false;
      if (typeof window !== 'undefined') {
        isPwaMode = window.matchMedia('(display-mode: standalone)').matches ||
                      window.matchMedia('(display-mode: minimal-ui)').matches;
      }

      if (isPwaMode) {
        await signInWithRedirect(auth, googleProvider);
        // Redirect will occur. The loading state will be false when onAuthStateChanged resolves.
        // No further action here as the page will redirect.
      } else {
        // Use signInWithPopup for non-PWA contexts
        await signInWithPopup(auth, googleProvider);
        // For popup, success means onAuthStateChanged will eventually fire and set user/loading.
        // We can show an immediate toast.
        toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
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
      setLoading(false); // Set loading to false ONLY on a caught error here to re-enable UI
    }
  };

  const signOutUser = async () => {
    setLoading(true); // Set loading true at the start of sign-out
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
