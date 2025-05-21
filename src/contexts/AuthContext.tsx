
"use client";

import type { User } from 'firebase/auth';
import type { ReactNode } from 'react';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, signOut, signInWithPopup, onAuthStateChanged } from '@/lib/firebase'; // Removed getRedirectResult, signInWithRedirect
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
    setLoading(true); 
    // No longer need getRedirectResult here as we are only using popup
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false); // Auth state resolved (user or null), set loading to false.
    });

    return () => unsubscribe();
  }, [toast]);

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      // Always use signInWithPopup
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged will handle setting the user and setLoading(false)
      // Toast for successful login can be triggered by onAuthStateChanged or here if needed
      // For simplicity, let onAuthStateChanged handle the primary user state update.
      // A toast here might be premature if onAuthStateChanged hasn't confirmed the user yet.
      toast({ title: 'Login Iniciado!', description: 'Por favor, complete o login na janela pop-up.' });
    } catch (error: any) {
      console.error("Error during Google sign-in with popup: ", error);
      if (error.code === 'auth/popup-closed-by-user') {
        toast({
          title: 'Login Cancelado',
          description: 'A janela de login foi fechada antes da conclusão.',
          variant: 'default',
        });
      } else if (error.code === 'auth/popup-blocked') {
        toast({
          title: 'Pop-up Bloqueado',
          description: 'O pop-up de login do Google foi bloqueado. Por favor, verifique as configurações do seu navegador para permitir pop-ups deste site.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Falha no Login',
          description: error.message || 'Não foi possível fazer login com o Google. Tente novamente.',
          variant: 'destructive',
        });
      }
      setLoading(false); // Ensure loading is false on any sign-in error
    }
  };

  const signOutUser = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      // onAuthStateChanged will set user to null and setLoading(false).
      toast({ title: 'Logged Out', description: 'Você foi desconectado com sucesso.' });
    } catch (error: any) {
      console.error("Error signing out: ", error);
      toast({
        title: 'Falha no Logout',
        description: error.message || 'Não foi possível desconectar. Por favor, tente novamente.',
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
