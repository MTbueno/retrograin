
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, FileImage, RotateCcwSquareIcon as ResetIcon } from 'lucide-react'; // Added FileImage for JPEG
import { useToast } from '@/hooks/use-toast';

export function ActionButtonsSection() {
  const { originalImage, dispatchSettings, baseFileName, getCanvasDataURL, setIsPreviewing } = useImageEditor();
  const { toast } = useToast();

  const handleDownload = (format: 'png' | 'jpeg') => {
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
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const quality = format === 'jpeg' ? 0.92 : undefined; // JPEG quality
      const fileExtension = format === 'jpeg' ? 'jpg' : 'png';
      
      const currentImageURI = getCanvasDataURL(mimeType, quality);

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
    <div className="space-y-3">
      <Button onClick={() => handleDownload('png')} disabled={!originalImage} className="w-full" variant="default">
        <Download className="mr-2 h-4 w-4" />
        Download (PNG - Melhor Qualidade)
      </Button>
      <Button onClick={() => handleDownload('jpeg')} disabled={!originalImage} className="w-full" variant="secondary">
        <FileImage className="mr-2 h-4 w-4" />
        Download (JPEG - Menor Tamanho)
      </Button>
      <Button onClick={handleReset} disabled={!originalImage} variant="outline" className="w-full">
        <ResetIcon className="mr-2 h-4 w-4" />
        Reset Adjustments
      </Button>
    </div>
  );
}
