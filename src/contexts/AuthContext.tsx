
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode, Dispatch, SetStateAction } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut as firebaseSignOut } from '@/lib/firebase';
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
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    // Call signInWithPopup immediately
    try {
      const result = await signInWithPopup(auth, googleProvider);
      // User state will be updated by onAuthStateChanged
      // setLoading(true) can be set after the popup initiation if needed,
      // but the popup itself should be triggered directly by user action.
      setLoading(true); // Set loading after popup attempt
      if (result.user) {
        toast({ title: 'Logged In!', description: 'Successfully signed in with Google.' });
      }
    } catch (error: any) {
      console.error("Error signing in with Google: ", error);
      // Check for specific popup blocked error
      if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
        toast({
          title: 'Login Popup Blocked',
          description: 'The Google Sign-In popup was blocked by your browser. Please allow popups for this site and try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Login Failed',
          description: error.message || 'Could not sign in with Google. Please try again.',
          variant: 'destructive',
        });
      }
      setUser(null); // Ensure user is null on error
    } finally {
      // setLoading(false) will be handled by onAuthStateChanged or if an error occurs before that
      // For a more immediate feedback if popup is blocked, we might set loading false here.
      // However, onAuthStateChanged is the source of truth for user state.
      // If an error occurs and onAuthStateChanged doesn't fire, we might need to set loading to false here.
      if (!auth.currentUser) { // If after everything, there's still no user
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
      setLoading(false); // onAuthStateChanged will also set loading, but this ensures it for sign-out errors
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
