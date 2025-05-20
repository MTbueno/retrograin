
"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, UserCircle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '../ui/skeleton';

export function AuthSection() {
  const { user, loading, signInWithGoogle, signOutUser } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center space-y-2 w-full max-w-[14rem] mx-auto">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-6 w-24" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col items-center space-y-2 w-full max-w-[14rem] mx-auto">
        <div className="flex items-center space-x-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || 'User'} />
            <AvatarFallback>
              {user.displayName ? user.displayName.charAt(0).toUpperCase() : <UserCircle size={16}/>}
            </AvatarFallback>
          </Avatar>
          <span className="text-sm text-muted-foreground truncate" title={user.displayName || user.email || undefined}>
            {user.displayName || user.email}
          </span>
        </div>
        <Button onClick={signOutUser} variant="outline" className="w-full">
          <LogOut className="mr-2 h-4 w-4" />
          Logout
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2 w-full max-w-[14rem] mx-auto">
       <p className="text-xs text-muted-foreground text-center mb-2">Sign in to save to Google Drive.</p>
      <Button onClick={signInWithGoogle} className="w-full">
        <LogIn className="mr-2 h-4 w-4" />
        Sign In with Google
      </Button>
    </div>
  );
}
