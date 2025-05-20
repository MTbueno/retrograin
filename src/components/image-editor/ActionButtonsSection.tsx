
"use client";

import { useImageEditor, type ImageObject } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste, Save } from 'lucide-react'; // Added Save Icon
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';
import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext'; // For checking Firebase Auth user
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
  const { user: firebaseUser } = useAuth(); // Firebase user

  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const [isDriveAuthorized, setIsDriveAuthorized] = useState(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  
  // Token client callback
  const handleTokenResponse = useCallback(async (tokenResponse: google.accounts.oauth2.TokenResponse) => {
    if (tokenResponse && tokenResponse.access_token) {
      gapi.client.setToken({ access_token: tokenResponse.access_token });
      setIsDriveAuthorized(true);
      toast({ title: 'Google Drive Connected!', description: 'You can now save images to Drive.' });
      // Automatically try to save if an action was pending
      if (isSavingToDrive) { 
        // This logic might need refinement if saveToDrive was called before token response
        // For now, we assume the user clicks "Save to Drive" again or this state triggers action.
      }
    } else {
      setIsDriveAuthorized(false);
      console.error("Failed to get access token or tokenResponse error:", tokenResponse);
      const errorMessage = (tokenResponse as any)?.error_description || "Failed to connect to Google Drive.";
      toast({ title: 'Drive Connection Failed', description: errorMessage, variant: 'destructive' });
    }
  }, [toast, isSavingToDrive]);


  useEffect(() => {
    loadGapi(() => {
      setIsGapiLoaded(true);
      // Initialize token client once GAPI is loaded
      // The actual token request will happen on button click
      initTokenClient(handleTokenResponse);
      // Check initial auth state
      if (isDriveAuthenticated()) {
        setIsDriveAuthorized(true);
      }
    });
  }, [handleTokenResponse]);
  
  useEffect(() => {
    // This effect checks GAPI's auth state if GAPI itself is loaded.
    if (isGapiLoaded) {
        setIsDriveAuthorized(isDriveAuthenticated());
    }
  }, [isGapiLoaded]);


  const handleDownload = async () => {
    if (allImages.length === 0) {
      toast({
        title: 'Error',
        description: 'No images to download.',
        variant: 'destructive',
      });
      return;
    }
    setIsPreviewing(false);
    await new Promise(resolve => setTimeout(resolve, 100));

    if (allImages.length > 1) {
      const zip = new JSZip();
      toast({ title: 'Processing Images...', description: 'Generating ZIP file. Please wait.' });
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
              title: 'Skipping File',
              description: `Could not generate ${imgObj.baseFileName} for ZIP.`,
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
        toast({ title: 'Batch Downloaded!', description: 'All images saved in retrograin_edits.zip' });
      } catch (error) {
        console.error("Error generating ZIP:", error);
        toast({
          title: 'ZIP Generation Failed',
          description: 'An error occurred while creating the ZIP file.',
          variant: 'destructive',
        });
      }
    } else if (originalImage) {
      const mimeType = 'image/jpeg';
      const fileExtension = 'jpg';
      const currentImageURI = getCanvasDataURL(mimeType, JPEG_QUALITY);
      if (!currentImageURI) {
        toast({
          title: 'Error',
          description: 'Could not generate image for download.',
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
      toast({ title: 'Image Downloaded!', description: `Saved as ${downloadFileName}` });
    }
  };

  const handleSaveToDrive = async () => {
    if (!firebaseUser) {
      toast({ title: 'Not Logged In', description: 'Please sign in to save to Google Drive.', variant: 'default' });
      return;
    }
    if (!originalImage) {
      toast({ title: 'No Image', description: 'Please upload and edit an image to save.', variant: 'default' });
      return;
    }

    setIsSavingToDrive(true);

    if (!isGapiLoaded) {
        toast({ title: 'Google API not loaded', description: 'Please wait a moment and try again.', variant: 'default' });
        setIsSavingToDrive(false);
        return;
    }
    
    if (!isDriveAuthenticated()) {
      toast({ title: 'Authorization Required', description: 'Please authorize access to Google Drive.', variant: 'default' });
      requestAccessToken(); // This will trigger the GIS popup
      // The actual save will happen in the token client callback or require another click
      // For now, we set isSavingToDrive to false, user might need to click again after auth.
      // A more sophisticated flow could queue the action.
      // setIsSavingToDrive(false); // Or keep it true and handle in callback. Let's keep true.
      return; // Wait for token callback
    }

    try {
      toast({ title: 'Saving to Drive...', description: 'Please wait.' });
      const folderId = await ensureRetroGrainFolder();
      if (folderId) {
        const currentImageURI = getCanvasDataURL('image/jpeg', JPEG_QUALITY);
        if (currentImageURI) {
          const savedFile = await uploadFileToDrive(folderId, `${baseFileName}_retrograin`, currentImageURI);
          if (savedFile && savedFile.id) {
            toast({ title: 'Saved to Drive!', description: `${baseFileName}_retrograin.jpg saved in RetroGrain folder.` });
          } else {
            toast({ title: 'Save Failed', description: 'Could not save the image to Google Drive.', variant: 'destructive' });
          }
        } else {
          toast({ title: 'Error', description: 'Could not generate image data for saving.', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Folder Error', description: 'Could not create or find the RetroGrain folder in Google Drive.', variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('Error saving to drive:', error);
      toast({ title: 'Save Error', description: error.message || 'An unexpected error occurred.', variant: 'destructive' });
    } finally {
      setIsSavingToDrive(false);
    }
  };
  
  const handleDisconnectDrive = () => {
    revokeAccessToken();
    setIsDriveAuthorized(false);
    toast({ title: 'Google Drive Disconnected' });
  };

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Settings Reset', description: 'All adjustments have been reset for the current image.' });
  };

  const handleCopySettings = () => {
    if (!originalImage) {
      toast({ title: 'No Image', description: 'Upload an image to copy its settings.' });
      return;
    }
    copyActiveSettings();
    toast({ title: 'Settings Copied!', description: 'Current image adjustments are ready to be pasted.' });
  };

  const handlePasteSettings = () => {
    if (!originalImage) {
      toast({ title: 'No Image', description: 'Select an image to paste settings to.' });
      return;
    }
    if (!copiedSettings) {
      toast({ title: 'No Settings Copied', description: 'Copy settings from another image first.' });
      return;
    }
    pasteSettingsToActiveImage();
    toast({ title: 'Settings Pasted!', description: 'Adjustments have been applied to the current image.' });
  };

  const downloadButtonText = allImages.length > 1 ? "Download All (ZIP)" : "Download Image";

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Button onClick={handleReset} disabled={!originalImage} variant="outline" className="w-full">
        <RotateCcwSquare className="mr-2 h-4 w-4" /> 
        Reset Adjustments
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={handleCopySettings} disabled={!originalImage} variant="outline" className="w-full">
          <Copy className="mr-2 h-4 w-4" />
          Copy
        </Button>
        <Button onClick={handlePasteSettings} disabled={!originalImage || !copiedSettings} variant="outline" className="w-full">
          <ClipboardPaste className="mr-2 h-4 w-4" />
          Paste
        </Button>
      </div>
      
      {firebaseUser && (
        isDriveAuthorized ? (
          <Button onClick={handleDisconnectDrive} variant="outline" className="w-full">
            Disconnect Drive
          </Button>
        ) : (
          <Button 
            onClick={handleSaveToDrive} 
            disabled={!isGapiLoaded || isSavingToDrive || !originalImage} 
            variant="outline" 
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavingToDrive ? 'Connecting...' : 'Connect to Drive'}
          </Button>
        )
      )}

      {firebaseUser && isDriveAuthorized && (
         <Button 
            onClick={handleSaveToDrive} 
            disabled={isSavingToDrive || !originalImage} 
            variant="default" // Or outline, depending on preference
            className="w-full"
          >
            <Save className="mr-2 h-4 w-4" />
            {isSavingToDrive ? 'Saving...' : 'Save to Google Drive'}
          </Button>
      )}

      <Button onClick={handleDownload} disabled={allImages.length === 0} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        {downloadButtonText}
      </Button>
    </div>
  );
}
