
"use client";

import React, { useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { initialImageSettings } from '@/contexts/ImageEditorContext';

const JPEG_QUALITY = 0.92; 

export function FileUploadSection() {
  const { addImageObject } = useImageEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processAndAddImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid File Type',
        description: `Skipping ${file.name}. Please upload an image file.`,
        variant: 'destructive',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataURL = e.target?.result as string;
      if (!dataURL) {
        toast({
          title: 'File Read Error',
          description: `Could not read data from ${file.name}.`,
          variant: 'destructive',
        });
        return;
      }
      
      const img = new Image();
      img.onload = () => {
        const baseFileName = file.name.replace(/\.[^/.]+$/, "");
        
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          addImageObject({ imageElement: img, baseFileName, settings: { ...initialImageSettings } });
        } else {
          // Convert non-JPEG to JPEG
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = img.naturalWidth;
          tempCanvas.height = img.naturalHeight;
          const tempCtx = tempCanvas.getContext('2d');

          if (tempCtx) {
            tempCtx.drawImage(img, 0, 0);
            let jpegDataUrl = tempCanvas.toDataURL('image/jpeg', JPEG_QUALITY);
            
            const jpegImage = new Image();
            jpegImage.onload = () => {
              addImageObject({ imageElement: jpegImage, baseFileName, settings: { ...initialImageSettings } });
              toast({
                title: 'Image Converted',
                description: `${file.name} was converted to JPEG (quality: ${JPEG_QUALITY * 100}%).`,
              });
            };
            jpegImage.onerror = () => {
              toast({
                title: 'Conversion Error',
                description: `Could not load the converted JPEG image for ${file.name}.`,
                variant: 'destructive',
              });
            };
            jpegImage.src = jpegDataUrl;
          } else {
            toast({
              title: 'Conversion Error',
              description: `Could not prepare ${file.name} for JPEG conversion. Using original.`,
              variant: 'destructive',
            });
            addImageObject({ imageElement: img, baseFileName, settings: { ...initialImageSettings } });
          }
        }
      };
      img.onerror = () => {
         toast({
          title: 'Image Load Error',
          description: `Could not load ${file.name}.`,
          variant: 'destructive',
        });
      }
      img.src = dataURL;
    };
    reader.onerror = () => {
      toast({
        title: 'File Read Error',
        description: `Could not read ${file.name}.`,
        variant: 'destructive',
      });
    }
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      // Removed the 10 images limit check
      Array.from(files).forEach(processAndAddImage);
      
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="space-y-2 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium">Upload Image(s)</Label>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif" 
        multiple
        className="hidden"
      />
      <Button onClick={handleUploadClick} variant="outline" className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        Choose Image(s)
      </Button>
      <p className="text-xs text-muted-foreground text-center">JPEGs preferred.</p>
    </div>
  );
}
