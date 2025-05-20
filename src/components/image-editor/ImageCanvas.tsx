
"use client";

import type { RefObject } from 'react';
import React, { useEffect, useCallback, useMemo } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Helper function to apply filters on canvas
// Note: Exposure is simplified here. True exposure is more complex.
const applyCanvasAdjustments = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';
  if (settings.brightness !== 1) filterString += `brightness(${settings.brightness * 100}%) `;
  if (settings.contrast !== 1) filterString += `contrast(${settings.contrast * 100}%) `;
  if (settings.saturation !== 1) filterString += `saturate(${settings.saturation * 100}%) `;
  
  // Simplified exposure: treat as an additional brightness adjustment
  // A value of 0 means no change. Positive values brighten, negative darken.
  // Mapping exposure range (-1 to 1) to a brightness multiplier (e.g., 0.5 to 1.5, or more impactful)
  if (settings.exposure !== 0) {
    const exposureEffect = 1 + settings.exposure * 0.5; // e.g. exposure 1 -> 150% bright, -1 -> 50% bright
    filterString += `brightness(${exposureEffect * 100}%) `;
  }

  if (settings.filter) {
    if (settings.filter === 'grayscale') filterString += `grayscale(100%) `;
    if (settings.filter === 'sepia') filterString += `sepia(100%) `;
    if (settings.filter === 'invert') filterString += `invert(100%) `;
  }
  ctx.filter = filterString.trim();
};

// Debounce helper function
function debounce<F extends (...args: any[]) => void>(func: F, waitFor: number): (...args: Parameters<F>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<F>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
    }, waitFor);
  };
}


export function ImageCanvas({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement> }) {
  const { originalImage, settings, setProcessedImageURI } = useImageEditor();

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rotation, scaleX, scaleY, crop } = settings;

    // Determine crop parameters
    let sx = 0, sy = 0, sWidth = originalImage.naturalWidth, sHeight = originalImage.naturalHeight;
    if (crop) {
      sx = crop.unit === '%' ? (crop.x / 100) * originalImage.naturalWidth : crop.x;
      sy = crop.unit === '%' ? (crop.y / 100) * originalImage.naturalHeight : crop.y;
      sWidth = crop.unit === '%' ? (crop.width / 100) * originalImage.naturalWidth : crop.width;
      sHeight = crop.unit === '%' ? (crop.height / 100) * originalImage.naturalHeight : crop.height;
    }
    
    const canvasWidth = sWidth;
    const canvasHeight = sHeight;

    // Adjust canvas dimensions for rotation
    if (rotation === 90 || rotation === 270) {
      canvas.width = canvasHeight * Math.abs(scaleY);
      canvas.height = canvasWidth * Math.abs(scaleX);
    } else {
      canvas.width = canvasWidth * Math.abs(scaleX);
      canvas.height = canvasHeight * Math.abs(scaleY);
    }
    
    ctx.save();
    // Translate and rotate context
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    // Apply filters and adjustments
    applyCanvasAdjustments(ctx, settings);
    
    // Draw the (cropped part of the) image
    ctx.drawImage(
      originalImage,
      sx,
      sy,
      sWidth,
      sHeight,
      -canvasWidth / 2, // Draw relative to new center
      -canvasHeight / 2,
      canvasWidth,
      canvasHeight
    );

    ctx.restore();
    
    // Update processed image URI
    setProcessedImageURI(canvas.toDataURL('image/png'));

  }, [originalImage, settings, canvasRef, setProcessedImageURI]);

  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, 200), // Debounce by 200ms
    [drawImageImmediately]
  );

  useEffect(() => {
    if (originalImage) {
      // Initial draw without debounce, or if you prefer, always debounce
      // For settings changes, debouncedDrawImage will be called.
      // If it's the first load of an image, perhaps draw immediately.
      // However, `settings` changes will trigger debouncedDraw.
      // A simple approach is to always use the debounced version.
      debouncedDrawImage();
    }
  }, [originalImage, settings, debouncedDrawImage]);


  if (!originalImage) {
    return (
      <Card className="w-full h-full flex items-center justify-center bg-muted/50 border-dashed">
        <p className="text-muted-foreground">Upload an image to start editing</p>
      </Card>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
    />
  );
}
