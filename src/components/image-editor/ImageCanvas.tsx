
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

const PREVIEW_SCALE_FACTOR = 0.5; // Lower for more performance, higher for better preview quality

export function ImageCanvas() { 
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { rotation, scaleX, scaleY, crop } = settings;

    let sx = 0, sy = 0;
    let sWidth = originalImage.naturalWidth;
    let sHeight = originalImage.naturalHeight;

    if (crop) {
      sx = crop.unit === '%' ? (crop.x / 100) * originalImage.naturalWidth : crop.x;
      sy = crop.unit === '%' ? (crop.y / 100) * originalImage.naturalHeight : crop.y;
      sWidth = crop.unit === '%' ? (crop.width / 100) * originalImage.naturalWidth : crop.width;
      sHeight = crop.unit === '%' ? (crop.height / 100) * originalImage.naturalHeight : crop.height;
      sWidth = Math.max(1, sWidth); // Ensure positive dimensions
      sHeight = Math.max(1, sHeight);
    }
    
    // contentWidth/Height are the dimensions of the (cropped) image part at full scale
    let contentWidth = sWidth;
    let contentHeight = sHeight;
    
    // Determine canvas buffer size based on content and transformations (flips)
    let canvasBufferWidth, canvasBufferHeight;
    if (rotation === 90 || rotation === 270) {
      canvasBufferWidth = contentHeight * Math.abs(scaleY);
      canvasBufferHeight = contentWidth * Math.abs(scaleX);
    } else {
      canvasBufferWidth = contentWidth * Math.abs(scaleX);
      canvasBufferHeight = contentHeight * Math.abs(scaleY);
    }

    // Apply preview scaling to the canvas buffer itself
    if (isPreviewing) {
      canvas.width = canvasBufferWidth * PREVIEW_SCALE_FACTOR;
      canvas.height = canvasBufferHeight * PREVIEW_SCALE_FACTOR;
    } else {
      canvas.width = canvasBufferWidth;
      canvas.height = canvasBufferHeight;
    }
    
    ctx.save();
    
    // Translate to center of the current canvas buffer
    ctx.translate(canvas.width / 2, canvas.height / 2);
    
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY); // For flip

    // If previewing, apply scaling to the drawing context.
    // This ensures filters are applied "as if" on full res, then scaled.
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    applyCanvasAdjustments(ctx, settings);
    
    // Draw the image content (e.g. cropped part) centered.
    // The coordinates/dimensions for drawImage are based on the full-scale content.
    // The context's transformations (including preview scale) handle the rest.
    ctx.drawImage(
      originalImage,
      sx,
      sy,
      sWidth, // source width from original image
      sHeight, // source height from original image
      -contentWidth / 2, // destination x, centered
      -contentHeight / 2, // destination y, centered
      contentWidth, // destination width (full scale)
      contentHeight // destination height (full scale)
    );

    ctx.restore();
  }, [originalImage, settings, canvasRef, isPreviewing]);

  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 200), // Shorter debounce for preview
    [drawImageImmediately, isPreviewing]
  );

  useEffect(() => {
    if (originalImage) {
      debouncedDrawImage();
    }
  }, [originalImage, settings, debouncedDrawImage, isPreviewing]); // isPreviewing dependency ensures redraw on mode change


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
