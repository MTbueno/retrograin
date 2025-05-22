
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste, Save, Eye, EyeOff } from 'lucide-react';
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


export function ActionButtonsSection() {
  const {
    originalImage,
    allImages,
    dispatchSettings,
    settings,
    baseFileName, 
    getCanvasDataURL, 
    generateImageDataUrlWithSettings,
    copyActiveSettings,
    pasteSettingsToActiveImage,
    copiedSettings,
    activeImageId,
    jpegQualityExport,
  } = useImageEditor();
  const { toast } = useToast();
  const { user: firebaseUser } = useAuth();

  const [isGapiClientInitialized, setIsGapiClientInitialized] = useState(false); // GAPI client library (gapi.client) is loaded and init
  const [isDriveSdkReady, setIsDriveSdkReady] = useState(false); // True if GIS token client is init
  const [isDriveAuthorized, setIsDriveAuthorized] = useState(false); // True if user has granted Drive scope
  const [isConnectingOrSavingToDrive, setIsConnectingOrSavingToDrive] = useState(false);


  const handleTokenResponse = useCallback(async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
    setIsConnectingOrSavingToDrive(false); 

    if (tokenResponse && tokenResponse.access_token) {
      if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken({ access_token: tokenResponse.access_token });
      }
      setTimeout(() => {
        if (isDriveAuthenticated()) {
          setIsDriveAuthorized(true);
          toast({ title: 'Google Drive Conectado!', description: 'Agora você pode salvar imagens no Drive.' });
        } else {
          setIsDriveAuthorized(false);
          console.error("Token do Drive recebido, mas isDriveAuthenticated() ainda é falso após um atraso.");
          toast({ title: 'Falha na Conexão', description: 'Erro ao verificar a conexão com o Drive após autorização.', variant: 'destructive' });
        }
      }, 500); 
    } else {
      setIsDriveAuthorized(false);
      const errorDescription = (tokenResponse as any)?.error_description || "Falha ao obter token de acesso do Google Drive.";
      const errorCode = (tokenResponse as any)?.error;
      console.error("Falha ao obter token de acesso do Drive:", errorCode, errorDescription, tokenResponse);
      toast({ title: 'Falha na Conexão com Drive', description: `${errorDescription} (Erro: ${errorCode || 'desconhecido'})`, variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => {
    if (!firebaseUser) {
      setIsGapiClientInitialized(false);
      setIsDriveSdkReady(false);
      setIsDriveAuthorized(false);
      return;
    }

    let gapiInitAttempts = 0;
    const maxGapiInitAttempts = 20; 

    const attemptGapiInit = () => {
      if (typeof window.gapi !== 'undefined' && typeof window.gapi.load === 'function') {
        loadGapi((gapiSuccess) => {
          setIsGapiClientInitialized(gapiSuccess);
          if (gapiSuccess) {
            let gisInitAttempts = 0;
            const maxGisInitAttempts = 10; 
            const attemptGisTokenClientInit = () => {
              if (typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.oauth2) {
                const tokenClientSuccess = initTokenClient(handleTokenResponse);
                setIsDriveSdkReady(tokenClientSuccess);
                if (tokenClientSuccess) {
                  if (isDriveAuthenticated()) {
                    setIsDriveAuthorized(true);
                  }
                }
              } else if (gisInitAttempts < maxGisInitAttempts) {
                gisInitAttempts++;
                setTimeout(attemptGisTokenClientInit, 500);
              }
            };
            attemptGisTokenClientInit();
          }
        });
      } else if (gapiInitAttempts < maxGapiInitAttempts) {
        gapiInitAttempts++;
        setTimeout(attemptGapiInit, 500);
      }
    };
    attemptGapiInit();
  }, [firebaseUser, handleTokenResponse]);


  const handleDriveAction = () => {
    if (!firebaseUser) {
      toast({ title: 'Não Logado', description: 'Por favor, faça login para usar o Google Drive.', variant: 'default' });
      return;
    }
    if (!isGapiClientInitialized || !isDriveSdkReady) {
      toast({ title: 'SDK do Drive não está pronto', description: 'Aguarde um momento e tente novamente. Verifique o console para erros.', variant: 'default' });
      return;
    }

    if (!isDriveAuthenticated()) {
      setIsConnectingOrSavingToDrive(true);
      toast({ title: 'Autorização Necessária', description: 'Conectando ao Google Drive...', variant: 'default' });
      requestAccessToken(); 
    } else {
      setIsDriveAuthorized(true);
      toast({ title: 'Já Conectado!', description: 'Você já está conectado ao Google Drive.', variant: 'default' });
    }
  };

  const saveToDrive = async () => {
    const activeImgObject = allImages.find(img => img.id === activeImageId);
    if (!activeImgObject || !originalImage) {
      toast({ title: 'Nenhuma Imagem Ativa', description: 'Por favor, carregue e selecione uma imagem para salvar.', variant: 'default' });
      setIsConnectingOrSavingToDrive(false);
      return;
    }
    
    setIsConnectingOrSavingToDrive(true);
    toast({ title: 'Salvando no Drive...', description: 'Por favor, aguarde.' });
    try {
      const currentImageURI = await getCanvasDataURL('image/jpeg', jpegQualityExport);
      if (!currentImageURI) {
        toast({ title: 'Erro ao Salvar', description: 'Não foi possível gerar dados da imagem para o Drive.', variant: 'destructive' });
        setIsConnectingOrSavingToDrive(false);
        return;
      }

      const folderId = await ensureRetroGrainFolder();
      if (folderId) {
        const savedFile = await uploadFileToDrive(folderId, `${activeImgObject.baseFileName}_retrograin`, currentImageURI);
        if (savedFile && savedFile.id) {
          toast({ title: 'Salvo no Drive!', description: `${activeImgObject.baseFileName}_retrograin.jpg salvo na pasta RetroGrain.` });
        } else {
           toast({ title: 'Erro ao Salvar', description: 'Não foi possível confirmar o salvamento do arquivo no Drive.', variant: 'destructive' });
        }
      } else {
         toast({ title: 'Erro na Pasta', description: 'Não foi possível criar ou encontrar a pasta RetroGrain no Drive.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Erro ao salvar no drive:', error);
      const errorMessage = error.result?.error?.message || error.message || 'Ocorreu um erro inesperado.';
      toast({ title: 'Erro ao Salvar no Drive', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsConnectingOrSavingToDrive(false);
    }
  };

  const handleDisconnectDrive = () => {
    revokeAccessToken(); 
    setIsDriveAuthorized(false);
    setIsConnectingOrSavingToDrive(false); 
    toast({ title: 'Google Drive Desconectado' });
  };

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Ajustes Resetados', description: 'Todos os ajustes foram resetados para a imagem atual.' });
  };

  const handleToggleOriginalView = () => {
    if (!originalImage) return;
    const newViewingOriginalState = !settings.isViewingOriginal;
    dispatchSettings({ type: 'SET_IS_VIEWING_ORIGINAL', payload: newViewingOriginalState });
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

  const downloadSingleActiveImage = async () => {
    if (!activeImageId || !originalImage) {
        toast({ title: 'Nenhuma Imagem Ativa', description: 'Selecione uma imagem para baixar.', variant: 'default' });
        return;
    }
    const activeImgObject = allImages.find(img => img.id === activeImageId);
    const dataURL = await getCanvasDataURL('image/jpeg', jpegQualityExport);
    
    if (dataURL && activeImgObject) {
      const link = document.createElement('a');
      link.href = dataURL;
      link.download = `${activeImgObject.baseFileName || baseFileName}_retrograin.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: 'Download Iniciado!', description: `${activeImgObject.baseFileName || baseFileName}_retrograin.jpg` });
    } else {
      toast({ title: 'Erro no Download', description: 'Não foi possível gerar a imagem para download.', variant: 'destructive' });
    }
  };

  const downloadAllImagesAsZip = async () => {
    if (allImages.length === 0) return;
    toast({ title: 'Preparando ZIP...', description: `Gerando ${allImages.length} imagens. Por favor aguarde.` });
    
    const zip = new JSZip();
    let filesAdded = 0;
    for (const imgObject of allImages) {
      let dataURL = await generateImageDataUrlWithSettings(imgObject.imageElement, imgObject.settings, 'image/jpeg', jpegQualityExport);
      
      if (dataURL) {
        const base64Data = dataURL.split(',')[1];
        if (base64Data) {
            zip.file(`${imgObject.baseFileName}_retrograin.jpg`, base64Data, {base64: true});
            filesAdded++;
        } else {
            console.warn(`Could not get base64 data for ${imgObject.baseFileName}`);
        }
      } else {
        console.warn(`Could not generate image data for ${imgObject.baseFileName} for ZIP.`);
        toast({ title: 'Erro no ZIP', description: `Falha ao gerar ${imgObject.baseFileName}.`, variant: 'destructive' });
      }
    }

    if (filesAdded === 0) {
        toast({ title: 'ZIP Vazio', description: 'Nenhuma imagem pôde ser adicionada ao ZIP.', variant: 'destructive' });
        return;
    }

    zip.generateAsync({ type: 'blob' })
      .then(function (content) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = 'retrograin_edits.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast({ title: 'Download do ZIP Iniciado!', description: 'retrograin_edits.zip' });
      })
      .catch(err => {
        console.error("Error generating ZIP:", err);
        toast({ title: 'Erro ao Gerar ZIP', description: err.message || 'Não foi possível criar o arquivo ZIP.', variant: 'destructive' });
      });
  };

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Button onClick={handleReset} disabled={!originalImage} variant="outline" className="w-full">
        <RotateCcwSquare className="mr-2 h-4 w-4" />
        Resetar Ajustes
      </Button>

      <Button 
        onClick={handleToggleOriginalView} 
        disabled={!originalImage} 
        variant="outline" 
        className="w-full"
        title={settings.isViewingOriginal ? "Mostrar Editada" : "Mostrar Original"}
        onPointerDown={() => dispatchSettings({ type: 'SET_IS_VIEWING_ORIGINAL', payload: true })}
        onPointerUp={() => dispatchSettings({ type: 'SET_IS_VIEWING_ORIGINAL', payload: false })}
        onPointerLeave={() => {if (settings.isViewingOriginal) dispatchSettings({ type: 'SET_IS_VIEWING_ORIGINAL', payload: false })}}
      >
        {settings.isViewingOriginal ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
        {settings.isViewingOriginal ? "Ver Original" : "Ver Editada"}
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
              onClick={saveToDrive}
              disabled={isConnectingOrSavingToDrive || !originalImage}
              variant="default"
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {isConnectingOrSavingToDrive ? 'Salvando...' : 'Salvar no Google Drive'}
            </Button>
            <Button onClick={handleDisconnectDrive} variant="outline" className="w-full">
              Desconectar Drive
            </Button>
          </>
        ) : (
          <Button
            onClick={handleDriveAction}
            disabled={!isGapiClientInitialized || !isDriveSdkReady || isConnectingOrSavingToDrive}
            variant="outline"
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {isConnectingOrSavingToDrive ? 'Conectando...' : 'Conectar ao Drive'}
          </Button>
        )
      )}

      {allImages.length > 1 ? (
        <>
          <Button onClick={downloadSingleActiveImage} disabled={!originalImage} className="w-full" variant="default">
            <Download className="mr-2 h-4 w-4" />
            Baixar Imagem Atual
          </Button>
          <Button onClick={downloadAllImagesAsZip} disabled={allImages.length === 0} className="w-full" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Baixar Tudo (ZIP)
          </Button>
        </>
      ) : (
        <Button onClick={downloadSingleActiveImage} disabled={!originalImage} className="w-full" variant="default">
          <Download className="mr-2 h-4 w-4" />
          Baixar Imagem
        </Button>
      )}
    </div>
  );
}

