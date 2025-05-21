
"use client";

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Download, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function PwaInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState<any | null>(null); // Use 'any' for broader compatibility
  const [isVisible, setIsVisible] = useState(false);
  const [isPwaMode, setIsPwaMode] = useState(false);
  const [hasMounted, setHasMounted] = useState(false); // For hydration safety
  const { toast } = useToast();

  useEffect(() => {
    setHasMounted(true); // Signal that the component has mounted on the client

    if (typeof window !== 'undefined') {
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      const minimalUi = window.matchMedia('(display-mode: minimal-ui)').matches;
      const navigatorStandalone = (window.navigator as any)?.standalone === true;
      setIsPwaMode(standalone || minimalUi || navigatorStandalone);

      const handleBeforeInstallPrompt = (event: Event) => {
        event.preventDefault();
        setInstallPromptEvent(event);
        // Only show the prompt if not already in PWA mode
        if (!(standalone || minimalUi || navigatorStandalone)) {
           setIsVisible(true);
        }
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      // Check if already installed and hide if so
      window.addEventListener('appinstalled', () => {
        setIsVisible(false);
        setInstallPromptEvent(null);
      });

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', () => {
            setIsVisible(false);
            setInstallPromptEvent(null);
        });
      };
    }
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

  const handleInstallClick = useCallback(async () => {
    if (!installPromptEvent) {
        toast({
            title: "Instalação não disponível",
            description: "O prompt de instalação não está disponível no momento.",
            variant: "default",
        });
        return;
    }
    try {
      // @ts-ignore
      await installPromptEvent.prompt();
      // @ts-ignore
      const { outcome } = await installPromptEvent.userChoice;
      if (outcome === 'accepted') {
        toast({ title: "RetroGrain Instalado!", description: "O aplicativo foi adicionado à sua tela inicial."});
      } else {
        toast({ title: "Instalação Cancelada", description: "Você pode instalar o RetroGrain a qualquer momento.", variant: "default"});
      }
    } catch (error) {
        console.error("Erro ao tentar instalar PWA:", error);
        toast({
            title: "Erro na Instalação",
            description: "Não foi possível iniciar a instalação. Tente novamente mais tarde.",
            variant: "destructive",
        });
    } finally {
        setInstallPromptEvent(null);
        setIsVisible(false);
    }
  }, [installPromptEvent, toast]);

  if (!hasMounted) {
    return null; // Render nothing on the server and on the client's initial render
  }

  // Do not show any custom prompt if running as PWA or if the prompt is not available/visible
  if (isPwaMode || !isVisible) {
    return null;
  }

  // Show custom install button if browser supports `beforeinstallprompt`
  if (installPromptEvent) {
    return (
      <div className="fixed bottom-4 right-4 z-50 max-w-sm">
        <Alert className="shadow-lg rounded-lg">
          <Download className="h-5 w-5" />
          <AlertTitle className="font-semibold">Instalar RetroGrain</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground mb-3">
            Tenha uma experiência mais rápida e integrada instalando o RetroGrain no seu dispositivo.
          </AlertDescription>
          <Button onClick={handleInstallClick} size="sm" className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Instalar Aplicativo
          </Button>
        </Alert>
      </div>
    );
  }

  // Fallback for browsers that don't fire `beforeinstallprompt` but might support manual "Add to Home Screen"
  // (e.g., Safari on iOS). This is a more generic message.
  // We check !isPwaMode again to ensure this only shows in browser tabs.
  if (!isPwaMode && !installPromptEvent) { // Added !installPromptEvent here
     // Simple check for iOS Safari to provide more specific instructions
    const isIOS = typeof window !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = typeof window !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS && isSafari) {
      return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <Alert className="shadow-lg rounded-lg">
            <ExternalLink className="h-5 w-5" />
            <AlertTitle className="font-semibold">Adicionar à Tela de Início</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              Para instalar, toque no ícone de Compartilhar <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-share inline-block mx-1"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
              e depois em "Adicionar à Tela de Início".
            </AlertDescription>
          </Alert>
        </div>
      );
    }
    // Generic message for other browsers if prompt event not caught
     return (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
            <Alert className="shadow-lg rounded-lg">
                <Download className="h-5 w-5" />
                <AlertTitle className="font-semibold">Melhor Experiência!</AlertTitle>
                <AlertDescription className="text-sm text-muted-foreground">
                Adicione este app à sua tela inicial para acesso rápido e offline.
                </AlertDescription>
            </Alert>
        </div>
    );
  }

  return null;
}
