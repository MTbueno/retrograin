"use client";

import React, { useRef } from 'react';
import { useImageEditor, initialImageSettings } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function FileUploadSection() {
  const { setOriginalImage, dispatchSettings, setFileName } = useImageEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast({
          title: 'Invalid File Type',
          description: 'Please upload an image file (e.g., PNG, JPEG, GIF).',
          variant: 'destructive',
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setOriginalImage(img);
          dispatchSettings({ type: 'RESET_SETTINGS' }); // Reset settings for new image
          setFileName(file.name.replace(/\.[^/.]+$/, "") + "_retrograin.png"); // Set initial download name
        };
        img.onerror = () => {
           toast({
            title: 'Image Load Error',
            description: 'Could not load the selected image file.',
            variant: 'destructive',
          });
        }
        img.src = e.target?.result as string;
      };
      reader.onerror = () => {
        toast({
          title: 'File Read Error',
          description: 'Could not read the selected file.',
          variant: 'destructive',
        });
      }
      reader.readAsDataURL(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Upload Image</Label>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />
      <Button onClick={handleUploadClick} variant="outline" className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        Choose Image
      </Button>
    </div>
  );
}
