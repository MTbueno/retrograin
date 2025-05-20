
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquare, Copy, ClipboardPaste } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const JPEG_QUALITY = 0.92;

export function ActionButtonsSection() {
  const { 
    originalImage, 
    dispatchSettings, 
    baseFileName, 
    getCanvasDataURL, 
    setIsPreviewing,
    copyActiveSettings,
    pasteSettingsToActiveImage,
    copiedSettings
  } = useImageEditor();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!originalImage) {
      toast({
        title: 'Error',
        description: 'No image to download.',
        variant: 'destructive',
      });
      return;
    }

    setIsPreviewing(false); 

    setTimeout(() => {
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
    }, 50);
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

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Button onClick={handleDownload} disabled={!originalImage} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        Download Image
      </Button>
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
    </div>
  );
}
