
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import piexif from 'piexifjs';
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
    copiedSettings,
    activeImageId,
  } = useImageEditor();
  const { toast } = useToast();
  const { user: firebaseUser } = useAuth();

  const [isGapiClientInitialized, setIsGapiClientInitialized] = useState(false);
  const [isDriveSdkReady, setIsDriveSdkReady] = useState(false);
  const [isDriveAuthorized, setIsDriveAuthorized] = useState(false);
  const [isConnectingOrSavingToDrive, setIsConnectingOrSavingToDrive] = useState(false);


  const handleTokenResponse = useCallback(async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
    setIsConnectingOrSavingToDrive(false); // Reset connecting state

    if (tokenResponse && tokenResponse.access_token) {
      if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken({ access_token: tokenResponse.access_token });
      }
      // Give gapi time to process the token and update its internal state
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
    let gapiAttempts = 0;
    const tryLoadGapiAndGis = () => {
      if (typeof window.gapi !== 'undefined' && typeof window.gapi.load === 'function' && typeof window.google !== 'undefined' && window.google.accounts && window.google.accounts.oauth2) {
        loadGapi((gapiSuccess) => {
          setIsGapiClientInitialized(gapiSuccess);
          if (gapiSuccess) {
            const tokenClientSuccess = initTokenClient(handleTokenResponse);
            setIsDriveSdkReady(tokenClientSuccess);
            if (tokenClientSuccess && isDriveAuthenticated()) {
              setIsDriveAuthorized(true);
            }
          } else {
            setIsDriveSdkReady(false);
          }
        });
      } else if (gapiAttempts < 40) { // Retry for up to 20 seconds (40 * 500ms)
        gapiAttempts++;
        setTimeout(tryLoadGapiAndGis, 500);
      } else {
        console.error("GAPI ou GIS (Google Identity Services) não carregaram a tempo.");
        setIsGapiClientInitialized(false);
        setIsDriveSdkReady(false);
      }
    };
    tryLoadGapiAndGis();
  }, [handleTokenResponse]);


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
      saveToDrive();
    }
  };

  const createExifWithComment = (originalExif: any): string | null => {
    try {
      const newExifObj: any = { "0th": {}, "Exif": {} };

      if (originalExif) {
        if (originalExif["0th"]) {
          newExifObj["0th"] = { ...originalExif["0th"] };
        }
        if (originalExif["Exif"]) {
          newExifObj["Exif"] = { ...originalExif["Exif"] };
        } else {
           newExifObj["Exif"] = {}; // Ensure Exif IFD exists for UserComment
        }
      } else {
        newExifObj["Exif"] = {}; // Ensure Exif IFD exists for UserComment even if no original EXIF
      }
      
      // Add UserComment
      newExifObj["Exif"][piexif.ExifIFD.UserComment] = piexif.helper.UserComment.dump("Edited in RetroGrain", "ascii");

      // Clean up empty IFDs to avoid issues with piexif.dump if they are truly empty
      if (Object.keys(newExifObj["0th"]).length === 0) delete newExifObj["0th"];
      if (Object.keys(newExifObj["Exif"]).length === 0) delete newExifObj["Exif"];
      
      if (Object.keys(newExifObj).length === 0) return null; // No data to dump

      return piexif.dump(newExifObj);
    } catch (error) {
      console.warn("Error creating EXIF data with comment:", error);
      return null;
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
      const folderId = await ensureRetroGrainFolder();
      if (folderId) {
        let currentImageURI = getCanvasDataURL('image/jpeg', JPEG_QUALITY);

        if (currentImageURI) {
            const exifBytes = createExifWithComment(activeImgObject.exifData);
            if (exifBytes) {
                try {
                    currentImageURI = piexif.insert(exifBytes, currentImageURI);
                } catch (exifError) {
                    console.warn("Could not insert EXIF data for Drive upload:", exifError);
                    toast({ title: 'Aviso EXIF', description: 'Não foi possível anexar dados EXIF à imagem do Drive.', variant: 'default' });
                }
            }
        
          const savedFile = await uploadFileToDrive(folderId, `${activeImgObject.baseFileName}_retrograin`, currentImageURI);
          if (savedFile && savedFile.id) {
            toast({ title: 'Salvo no Drive!', description: `${activeImgObject.baseFileName}_retrograin.jpg salvo na pasta RetroGrain.` });
          } else {
             toast({ title: 'Erro ao Salvar', description: 'Não foi possível confirmar o salvamento do arquivo no Drive.', variant: 'destructive' });
          }
        } else {
          toast({ title: 'Erro', description: 'Não foi possível gerar os dados da imagem para salvar.', variant: 'destructive' });
        }
      } else {
         toast({ title: 'Erro na Pasta', description: 'Não foi possível criar ou encontrar a pasta RetroGrain no Drive.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Erro ao salvar no drive:', error);
      toast({ title: 'Erro ao Salvar', description: error.message || 'Ocorreu um erro inesperado.', variant: 'destructive' });
    } finally {
      setIsConnectingOrSavingToDrive(false);
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

  const handleDownloadInternal = async () => {
    if (allImages.length === 0) return;
    setIsPreviewing(false);

    if (allImages.length === 1 && activeImageId) {
      const activeImgObject = allImages.find(img => img.id === activeImageId);
      let dataURL = getCanvasDataURL('image/jpeg', JPEG_QUALITY);
      if (dataURL && activeImgObject) {
        const exifBytes = createExifWithComment(activeImgObject.exifData);
        if (exifBytes) {
            try {
              dataURL = piexif.insert(exifBytes, dataURL);
            } catch (exifError: any) {
                console.warn("Could not insert EXIF for single download:", exifError);
                toast({ title: 'Aviso EXIF', description: `Não foi possível reanexar dados EXIF: ${exifError.message || 'Erro desconhecido'}.`, variant: 'default' });
            }
        }
      }

      if (dataURL) {
        const link = document.createElement('a');
        link.href = dataURL;
        link.download = `${activeImgObject?.baseFileName || baseFileName}_retrograin.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast({ title: 'Download Iniciado!', description: `${activeImgObject?.baseFileName || baseFileName}_retrograin.jpg` });
      } else {
        toast({ title: 'Erro no Download', description: 'Não foi possível gerar a imagem para download.', variant: 'destructive' });
      }
    } else {
      const zip = new JSZip();
      toast({ title: 'Preparando ZIP...', description: 'Gerando imagens, por favor aguarde.' });

      for (const imgObject of allImages) {
        let dataURL = await generateImageDataUrlWithSettings(imgObject.imageElement, imgObject.settings, 'image/jpeg', JPEG_QUALITY);
        if (dataURL) {
          const exifBytes = createExifWithComment(imgObject.exifData);
          if (exifBytes) {
            try {
              dataURL = piexif.insert(exifBytes, dataURL);
            } catch (exifError: any) {
              console.warn(`Could not insert EXIF for ${imgObject.baseFileName} in ZIP:`, exifError);
               toast({ title: `Aviso EXIF (${imgObject.baseFileName})`, description: `Não foi possível reanexar dados EXIF: ${exifError.message || 'Erro desconhecido'}.`, variant: 'default', duration: 2000 });
            }
          }
        }

        if (dataURL) {
          const response = await fetch(dataURL);
          const blob = await response.blob();
          zip.file(`${imgObject.baseFileName}_retrograin.jpg`, blob);
        } else {
          console.warn(`Could not generate image data for ${imgObject.baseFileName} for ZIP.`);
        }
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
    }
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

      <Button onClick={handleDownloadInternal} disabled={allImages.length === 0} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        {downloadButtonText}
      </Button>
    </div>
  );
}
