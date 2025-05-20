
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquareIcon as ResetIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ActionButtonsSection() {
  // getCanvasDataURL is used to get the latest image URI on demand
  // processedImageURI is removed from here as it's not reliably up-to-date for the download button's direct use.
  const { originalImage, dispatchSettings, fileName, getCanvasDataURL, setProcessedImageURI } = useImageEditor();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!originalImage) { // Simplified check, actual URI check below
      toast({
        title: 'Error',
        description: 'No image to download.',
        variant: 'destructive',
      });
      return;
    }

    const currentImageURI = getCanvasDataURL(); // Get fresh URI on click

    if (!currentImageURI) {
      toast({
        title: 'Error',
        description: 'Could not generate image for download.',
        variant: 'destructive',
      });
      return;
    }
    
    // Optionally, update the context's processedImageURI if other parts rely on it being the last downloaded URI
    // setProcessedImageURI(currentImageURI); 

    const link = document.createElement('a');
    link.href = currentImageURI;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Image Downloaded!', description: `Saved as ${fileName}` });
  };

  const handleReset = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_SETTINGS' });
    toast({ title: 'Settings Reset', description: 'All adjustments have been reset to default.' });
  };

  return (
    <div className="space-y-3">
      {/* Download button is enabled if there's an original image. URI generation happens on click. */}
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
