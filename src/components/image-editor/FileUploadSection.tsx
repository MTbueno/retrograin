
"use client";

import React, { useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const JPEG_QUALITY = 0.92;

export function FileUploadSection() {
  const { setOriginalImage, dispatchSettings, setBaseFileName } = useImageEditor();
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
          // Convert to JPEG if not already JPEG
          if (file.type === 'image/jpeg') {
            setOriginalImage(img);
            dispatchSettings({ type: 'RESET_SETTINGS' });
            setBaseFileName(file.name.replace(/\.[^/.]+$/, ""));
          } else {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.naturalWidth;
            tempCanvas.height = img.naturalHeight;
            const tempCtx = tempCanvas.getContext('2d');

            if (tempCtx) {
              tempCtx.drawImage(img, 0, 0);
              const jpegDataUrl = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
              
              const jpegImage = new Image();
              jpegImage.onload = () => {
                setOriginalImage(jpegImage);
                dispatchSettings({ type: 'RESET_SETTINGS' });
                setBaseFileName(file.name.replace(/\.[^/.]+$/, "")); // Use original base name
                toast({
                  title: 'Image Converted',
                  description: `${file.name} was converted to JPEG for editing.`,
                });
              };
              jpegImage.onerror = () => {
                toast({
                  title: 'Conversion Error',
                  description: 'Could not load the converted JPEG image.',
                  variant: 'destructive',
                });
              };
              jpegImage.src = jpegDataUrl;
            } else {
              toast({
                title: 'Conversion Error',
                description: 'Could not prepare image for JPEG conversion.',
                variant: 'destructive',
              });
              // Fallback to original if conversion context fails, though less ideal
              setOriginalImage(img);
              dispatchSettings({ type: 'RESET_SETTINGS' });
              setBaseFileName(file.name.replace(/\.[^/.]+$/, ""));
            }
          }
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
    <div className="space-y-2 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium">Upload Image</Label>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*" // Accept all image types, conversion handled internally
        className="hidden"
      />
      <Button onClick={handleUploadClick} variant="outline" className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        Choose Image
      </Button>
    </div>
  );
}
