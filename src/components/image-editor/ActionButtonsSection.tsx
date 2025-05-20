
"use client";

import { useImageEditor, type ImageObject } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import JSZip from 'jszip';

const JPEG_QUALITY = 0.92;

export function ActionButtonsSection() {
  const { 
    originalImage, // This is the active original image
    allImages, // All loaded image objects
    dispatchSettings, 
    baseFileName, // Base filename of the active image
    getCanvasDataURL, // For the active image
    generateImageDataUrlWithSettings, // For generating any image with its settings
    setIsPreviewing,
    copyActiveSettings,
    pasteSettingsToActiveImage,
    copiedSettings
  } = useImageEditor();
  const { toast } = useToast();

  const handleDownload = async () => {
    if (allImages.length === 0) {
      toast({
        title: 'Error',
        description: 'No images to download.',
        variant: 'destructive',
      });
      return;
    }

    setIsPreviewing(false); // Ensure full quality for download

    // Wait for any pending canvas updates
    await new Promise(resolve => setTimeout(resolve, 100));


    if (allImages.length > 1) {
      // Batch download as ZIP
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
            console.error(`Failed to generate image data for ${imgObj.baseFileName}`);
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
      // Single image download
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

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Settings Reset', description: 'All adjustments have been reset to default for the current image.' });
  };

  const handleCopySettings = () => {
    if (!originalImage) {
      toast({ title: 'No Image', description: 'Upload an image to copy its settings.', variant: 'default' });
      return;
    }
    copyActiveSettings();
    toast({ title: 'Settings Copied!', description: 'Current image adjustments are ready to be pasted.' });
  };

  const handlePasteSettings = () => {
    if (!originalImage) {
      toast({ title: 'No Image', description: 'Select an image to paste settings to.', variant: 'default' });
      return;
    }
    if (!copiedSettings) {
      toast({ title: 'No Settings Copied', description: 'Copy settings from another image first.', variant: 'default' });
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
      <Button onClick={handleDownload} disabled={allImages.length === 0} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        {downloadButtonText}
      </Button>
    </div>
  );
}
