
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquareIcon as ResetIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const JPEG_QUALITY = 0.92;

export function ActionButtonsSection() {
  const { originalImage, dispatchSettings, baseFileName, getCanvasDataURL, setIsPreviewing } = useImageEditor();
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

    // Ensure we are not in preview mode for final quality download
    setIsPreviewing(false); 

    // Allow a brief moment for canvas to re-render at full quality if it was previewing
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
    }, 50); // Small delay to ensure full quality render if needed
  };

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Settings Reset', description: 'All adjustments have been reset to default.' });
  };

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Button onClick={handleDownload} disabled={!originalImage} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        Download Image
      </Button>
      <Button onClick={handleReset} disabled={!originalImage} variant="outline" className="w-full">
        <ResetIcon className="mr-2 h-4 w-4" />
        Reset Adjustments
      </Button>
    </div>
  );
}
