
"use client";

import React, { useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { initialImageSettings } from '@/contexts/ImageEditorContext';
import piexif from 'piexifjs';

const JPEG_QUALITY = 0.92; // Quality for non-JPEG to JPEG conversion

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
      
      let preservedExifData: object | null = null;
      try {
        if (file.type === "image/jpeg" || file.type === "image/jpg") {
            const fullExifObj = piexif.load(dataURL);
            const tempExif: any = {}; // Start with an empty object to store only relevant tags

            // Preserve DateTime from 0th IFD if it exists
            if (fullExifObj["0th"] && fullExifObj["0th"][piexif.ImageIFD.DateTime]) {
              if (!tempExif["0th"]) tempExif["0th"] = {};
              tempExif["0th"][piexif.ImageIFD.DateTime] = fullExifObj["0th"][piexif.ImageIFD.DateTime];
            }

            // Preserve DateTimeOriginal and DateTimeDigitized from Exif IFD if they exist
            if (fullExifObj["Exif"]) {
              let exifIfdHasData = false;
              if (fullExifObj["Exif"][piexif.ExifIFD.DateTimeOriginal]) {
                if (!tempExif["Exif"]) tempExif["Exif"] = {};
                tempExif["Exif"][piexif.ExifIFD.DateTimeOriginal] = fullExifObj["Exif"][piexif.ExifIFD.DateTimeOriginal];
                exifIfdHasData = true;
              }
              if (fullExifObj["Exif"][piexif.ExifIFD.DateTimeDigitized]) {
                if (!tempExif["Exif"]) tempExif["Exif"] = {}; // Ensure Exif IFD exists
                tempExif["Exif"][piexif.ExifIFD.DateTimeDigitized] = fullExifObj["Exif"][piexif.ExifIFD.DateTimeDigitized];
                exifIfdHasData = true;
              }
            }
            
            // If tempExif has any top-level keys (0th or Exif), then assign it. Otherwise, null.
            if (Object.keys(tempExif).length > 0) {
                preservedExifData = tempExif;
            } else {
                preservedExifData = null;
            }
        }
      } catch (exifError) {
        console.warn(`Could not load or process EXIF data for ${file.name}:`, exifError);
        preservedExifData = null; 
      }

      const img = new Image();
      img.onload = () => {
        const baseFileName = file.name.replace(/\.[^/.]+$/, "");
        
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          addImageObject({ imageElement: img, baseFileName, settings: { ...initialImageSettings }, exifData: preservedExifData });
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
              addImageObject({ imageElement: jpegImage, baseFileName, settings: { ...initialImageSettings }, exifData: null }); // EXIF from non-JPEG is not preserved
              toast({
                title: 'Image Converted',
                description: `${file.name} was converted to JPEG (quality: ${JPEG_QUALITY * 100}%). Original EXIF (if any) not transferred from non-JPEG formats.`,
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
            addImageObject({ imageElement: img, baseFileName, settings: { ...initialImageSettings }, exifData: null });
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
      if (files.length > 10) {
        toast({
          title: 'Too Many Files',
          description: 'You can upload a maximum of 10 images at a time.',
          variant: 'destructive',
        });
        return;
      }
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
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif" // HEIC/HEIF might not have EXIF readable this way
        multiple
        className="hidden"
      />
      <Button onClick={handleUploadClick} variant="outline" className="w-full">
        <Upload className="mr-2 h-4 w-4" />
        Choose Image(s)
      </Button>
      <p className="text-xs text-muted-foreground text-center">Up to 10 images. JPEGs preferred for EXIF.</p>
    </div>
  );
}
