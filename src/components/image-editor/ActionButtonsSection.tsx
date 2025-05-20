"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Download, RotateCcwSquareIcon as ResetIcon } from 'lucide-react'; // RotateCcwSquareIcon alias
import { useToast } from '@/hooks/use-toast';

export function ActionButtonsSection() {
  const { processedImageURI, dispatchSettings, originalImage, fileName } = useImageEditor();
  const { toast } = useToast();

  const handleDownload = () => {
    if (!processedImageURI || !originalImage) {
      toast({
        title: 'Error',
        description: 'No image to download or image not processed.',
        variant: 'destructive',
      });
      return;
    }
    const link = document.createElement('a');
    link.href = processedImageURI;
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
      <Button onClick={handleDownload} disabled={!originalImage || !processedImageURI} className="w-full" variant="default">
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
