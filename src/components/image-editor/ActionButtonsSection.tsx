
"use client";

import { useImageEditor, type ImageObject } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  loadGapi, 
  initTokenClient, 
  requestAccessToken, 
  ensureRetroGrainFolder, 
  uploadFileToDrive,
  isDriveAuthenticated,
  revokeAccessToken
} from '@/lib/googleDrive';

const JPEG_QUALITY = 0.92;

export function ActionButtonsSection() {
  const { 
    originalImage,
    allImages,
    dispatchSettings, 
    baseFileName,
    getCanvasDataURL,
    generateImageDataUrlWithSettings,
    setIsPreviewing,
    copyActiveSettings,
    pasteSettingsToActiveImage,
    copiedSettings
  } = useImageEditor();
  const { toast } = useToast();
  const { user: firebaseUser } = useAuth(); 

  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [isDriveAuthorized, setIsDriveAuthorized] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  
  const handleTokenResponse = useCallback(async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
    if (tokenResponse && tokenResponse.access_token) {
      gapi.client.setToken({ access_token: tokenResponse.access_token });
      setIsDriveAuthorized(true);
      toast({ title: 'Google Drive Conectado!', description: 'Agora você pode salvar imagens no Drive.' });
    } else {
      setIsDriveAuthorized(false);
      console.error("Falha ao obter token de acesso ou erro na tokenResponse:", tokenResponse);
      const errorMessage = (tokenResponse as any)?.error_description || "Falha ao conectar ao Google Drive.";
      toast({ title: 'Falha na Conexão com Drive', description: errorMessage, variant: 'destructive' });
    }
    setIsSavingToDrive(false); // Reset saving state regardless of outcome
  }, [toast]);


  useEffect(() => {
    loadGapi(() => {
      setIsGapiLoaded(true);
      initTokenClient(handleTokenResponse);
      if (isDriveAuthenticated()) {
        setIsDriveAuthorized(true);
      }
    });
  }, [handleTokenResponse]);
  
  useEffect(() => {
    if (isGapiLoaded) {
        setIsDriveAuthorized(isDriveAuthenticated());
    }
  }, [isGapiLoaded]);


  const handleDownload = async () => {
    if (allImages.length === 0) {
      toast({
        title: 'Erro',
        description: 'Nenhuma imagem para baixar.',
        variant: 'destructive',
      });
      return;
    }
    setIsPreviewing(false);
    await new Promise(resolve => setTimeout(resolve, 100));

    if (allImages.length > 1) {
      const zip = new JSZip();
      toast({ title: 'Processando Imagens...', description: 'Gerando arquivo ZIP. Por favor, aguarde.' });
      try {
        for (const imgObj of allImages) {
          const imageDataUrl = await generateImageDataUrlWithSettings(
            imgObj.imageElement,
            imgObj.settings,
            'image/jpeg',
            JPEG_QUALITY
          );
          if (imageDataUrl) {
            const blob = await (await fetch(imageDataUrl)).blob();
            zip.file(`${imgObj.baseFileName}_retrograin.jpg`, blob);
          } else {
            toast({
              title: 'Pulando Arquivo',
              description: `Não foi possível gerar ${imgObj.baseFileName} para o ZIP.`,
              variant: 'destructive'
            });
          }
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = 'retrograin_edits.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast({ title: 'Download em Lote Concluído!', description: 'Todas as imagens salvas em retrograin_edits.zip' });
      } catch (error) {
        console.error("Erro ao gerar ZIP:", error);
        toast({
          title: 'Falha na Geração do ZIP',
          description: 'Ocorreu um erro ao criar o arquivo ZIP.',
          variant: 'destructive',
        });
      }
    } else if (originalImage) {
      const mimeType = 'image/jpeg';
      const fileExtension = 'jpg';
      const currentImageURI = getCanvasDataURL(mimeType, JPEG_QUALITY);
      if (!currentImageURI) {
        toast({
          title: 'Erro',
          description: 'Não foi possível gerar a imagem para download.',
          variant: 'destructive',
        });
        return;
      }
      const downloadFileName = `${baseFileName}_retrograin.${fileExtension}`;
      const link = document.createElement('a');
      link.href = currentImageURI;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Imagem Baixada!', description: `Salva como ${downloadFileName}` });
    }
  };

  const handleSaveToDrive = async () => {
    if (!firebaseUser) {
      toast({ title: 'Não Logado', description: 'Por favor, faça login para salvar no Google Drive.', variant: 'default' });
      return;
    }
    if (!originalImage && isDriveAuthorized) { // Only show this if already authorized but no image
      toast({ title: 'Nenhuma Imagem', description: 'Por favor, carregue e edite uma imagem para salvar.', variant: 'default' });
      return;
    }
  
    if (!isGapiLoaded) {
      toast({ title: 'API do Google não carregada', description: 'Por favor, aguarde um momento e tente novamente.', variant: 'default' });
      return;
    }
  
    if (!isDriveAuthenticated()) {
      toast({ title: 'Autorização Necessária', description: 'Por favor, autorize o acesso ao Google Drive.', variant: 'default' });
      setIsSavingToDrive(true); // Indicate an action is pending user authorization
      requestAccessToken();
      // We set isSavingToDrive to false in the token callback or if user cancels
      return; 
    }
  
    // If we reach here, user is authenticated with Drive and GAPI is loaded.
    // Proceed to save only if there's an image.
    if (!originalImage) {
      toast({ title: 'Nenhuma Imagem', description: 'Por favor, carregue e edite uma imagem para salvar.', variant: 'default' });
      return;
    }

    setIsSavingToDrive(true);
    try {
      toast({ title: 'Salvando no Drive...', description: 'Por favor, aguarde.' });
      const folderId = await ensureRetroGrainFolder();
      if (folderId) {
        const currentImageURI = getCanvasDataURL('image/jpeg', JPEG_QUALITY);
        if (currentImageURI) {
          const savedFile = await uploadFileToDrive(folderId, `${baseFileName}_retrograin`, currentImageURI);
          if (savedFile && savedFile.id) {
            toast({ title: 'Salvo no Drive!', description: `${baseFileName}_retrograin.jpg salvo na pasta RetroGrain.` });
          } else {
            toast({ title: 'Falha ao Salvar', description: 'Não foi possível salvar a imagem no Google Drive.', variant: 'destructive' });
          }
        } else {
          toast({ title: 'Erro', description: 'Não foi possível gerar os dados da imagem para salvar.', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Erro na Pasta', description: 'Não foi possível criar ou encontrar a pasta RetroGrain no Google Drive.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Erro ao salvar no drive:', error);
      toast({ title: 'Erro ao Salvar', description: error.message || 'Ocorreu um erro inesperado.', variant: 'destructive' });
    } finally {
      setIsSavingToDrive(false);
    }
  };
  
  const handleDisconnectDrive = () => {
    revokeAccessToken();
    setIsDriveAuthorized(false);
    toast({ title: 'Google Drive Desconectado' });
  };

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Ajustes Resetados', description: 'Todos os ajustes foram resetados para a imagem atual.' });
  };

  const handleCopySettings = () => {
    if (!originalImage) {
      toast({ title: 'Nenhuma Imagem', description: 'Carregue uma imagem para copiar seus ajustes.' });
      return;
    }
    copyActiveSettings();
    toast({ title: 'Ajustes Copiados!', description: 'Os ajustes da imagem atual estão prontos para serem colados.' });
  };

  const handlePasteSettings = () => {
    if (!originalImage) {
      toast({ title: 'Nenhuma Imagem', description: 'Selecione uma imagem para colar os ajustes.' });
      return;
    }
    if (!copiedSettings) {
      toast({ title: 'Nenhum Ajuste Copiado', description: 'Copie os ajustes de outra imagem primeiro.' });
      return;
    }
    pasteSettingsToActiveImage();
    toast({ title: 'Ajustes Colados!', description: 'Os ajustes foram aplicados à imagem atual.' });
  };

  const downloadButtonText = allImages.length > 1 ? "Baixar Tudo (ZIP)" : "Baixar Imagem";

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Button onClick={handleReset} disabled={!originalImage} variant="outline" className="w-full">
        <RotateCcwSquare className="mr-2 h-4 w-4" /> 
        Resetar Ajustes
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleCopySettings} disabled={!originalImage} variant="outline" className="w-full">
          <Copy className="mr-2 h-4 w-4" />
          Copiar
        </Button>
        <Button onClick={handlePasteSettings} disabled={!originalImage || !copiedSettings} variant="outline" className="w-full">
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Colar
        </Button>
      </div>
      
      {firebaseUser && (
        isDriveAuthorized ? (
          <>
            <Button 
              onClick={handleSaveToDrive} 
              disabled={isSavingToDrive || !originalImage} 
              variant="default" 
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSavingToDrive ? 'Salvando...' : 'Salvar no Google Drive'}
            </Button>
            <Button onClick={handleDisconnectDrive} variant="outline" className="w-full">
              Desconectar Drive
            </Button>
          </>
        ) : (
          <Button 
            onClick={handleSaveToDrive} // This same handler will now trigger auth if needed
            disabled={!isGapiLoaded || isSavingToDrive } 
            variant="outline" 
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavingToDrive ? 'Conectando...' : 'Conectar ao Drive'}
          </Button>
        )
      )}

      <Button onClick={handleDownload} disabled={allImages.length === 0} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        {downloadButtonText}
      </Button>
    </div>
  );
}
