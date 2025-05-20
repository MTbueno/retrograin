
"use client";

import React, { useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const JPEG_QUALITY = 0.92;

export function FileUploadSection() {
  const { addImageObject } = useImageEditor(); // Changed from setOriginalImage and setBaseFileName
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
      const img = new Image();
      img.onload = () => {
        const baseFileName = file.name.replace(/\.[^/.]+$/, "");
        
        if (file.type === 'image/jpeg') {
          addImageObject({ imageElement: img, baseFileName, settings: initialImageSettings });
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
              addImageObject({ imageElement: jpegImage, baseFileName, settings: initialImageSettings });
              toast({
                title: 'Image Converted',
                description: `${file.name} was converted to JPEG for editing.`,
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
            // Fallback to original if conversion context fails
            addImageObject({ imageElement: img, baseFileName, settings: initialImageSettings });
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
      img.src = e.target?.result as string;
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
      if (files.length > 10) {
        toast({
          title: 'Too Many Files',
          description: 'You can upload a maximum of 10 images at a time.',
          variant: 'destructive',
        });
        // Optionally, only process the first 10
        // Array.from(files).slice(0, 10).forEach(processAndAddImage);
        return;
      }
      Array.from(files).forEach(processAndAddImage);
      
      // Clear the file input after processing to allow re-uploading the same file(s)
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
        accept="image/*"
        multiple // Allow multiple files
        className="hidden"
      />
      <Button onClick={handleUploadClick} variant="outline" className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        Choose Image(s)
      </Button>
      <p className="text-xs text-muted-foreground text-center">Up to 10 images.</p>
    </div>
  );
}
// Need to import initialImageSettings if it's not globally available
import { initialImageSettings } from '@/contexts/ImageEditorContext';
