
"use client";

import type { RefObject } from 'react';
import React, { useEffect, useCallback, useMemo } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Helper function to apply filters on canvas
const applyCanvasAdjustments = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';
  if (settings.brightness !== 1) filterString += `brightness(${settings.brightness * 100}%) `;
  if (settings.contrast !== 1) filterString += `contrast(${settings.contrast * 100}%) `;
  if (settings.saturation !== 1) filterString += `saturate(${settings.saturation * 100}%) `;
  
  if (settings.exposure !== 0) {
    const exposureEffect = 1 + settings.exposure * 0.5; 
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

// ImageCanvas no longer takes canvasRef as a prop
export function ImageCanvas() { 
  const { originalImage, settings, canvasRef } = useImageEditor(); // Get canvasRef from context

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current; // Use canvasRef from context
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rotation, scaleX, scaleY, crop } = settings;

    let sx = 0, sy = 0, sWidth = originalImage.naturalWidth, sHeight = originalImage.naturalHeight;
    if (crop) {
      sx = crop.unit === '%' ? (crop.x / 100) * originalImage.naturalWidth : crop.x;
      sy = crop.unit === '%' ? (crop.y / 100) * originalImage.naturalHeight : crop.y;
      sWidth = crop.unit === '%' ? (crop.width / 100) * originalImage.naturalWidth : crop.width;
      sHeight = crop.unit === '%' ? (crop.height / 100) * originalImage.naturalHeight : crop.height;
    }
    
    const canvasWidth = sWidth;
    const canvasHeight = sHeight;

    if (rotation === 90 || rotation === 270) {
      canvas.width = canvasHeight * Math.abs(scaleY);
      canvas.height = canvasWidth * Math.abs(scaleX);
    } else {
      canvas.width = canvasWidth * Math.abs(scaleX);
      canvas.height = canvasHeight * Math.abs(scaleY);
    }
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    applyCanvasAdjustments(ctx, settings);
    
    ctx.drawImage(
      originalImage,
      sx,
      sy,
      sWidth,
      sHeight,
      -canvasWidth / 2, 
      -canvasHeight / 2,
      canvasWidth,
      canvasHeight
    );

    ctx.restore();
    
    // DO NOT call toDataURL here for performance reasons.
    // setProcessedImageURI(canvas.toDataURL('image/png')); 
    // This will be handled on-demand by actions (download, AI enhance)

  }, [originalImage, settings, canvasRef]); // Removed setProcessedImageURI from dependencies

  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, 200), 
    [drawImageImmediately]
  );

  useEffect(() => {
    if (originalImage) {
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
      ref={canvasRef} // Assign canvasRef from context
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
    />
  );
}
