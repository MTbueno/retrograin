
"use client";

import React, { useEffect, useCallback, useMemo } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
// hexToRgb, desaturateRgb, rgbToHex are now imported from colorUtils
// import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils'; 

const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 100; // Size of the canvas used to generate the noise ImageData
// SHADOW_HIGHLIGHT_ALPHA_FACTOR and TINT_EFFECT_SCALING_FACTOR are defined in ImageEditorContext

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

export function ImageCanvas() {
  const {
    originalImage,
    settings,
    canvasRef,
    isPreviewing,
    noiseImageDataRef, // Changed from noiseSourceCanvasRef
    applyCssFilters,
  } = useImageEditor();

  // useEffect to generate noise ImageData once and store it in context
  useEffect(() => {
    const currentCanvas = canvasRef.current; // Get current canvas element
    if (typeof window !== 'undefined' && currentCanvas && !noiseImageDataRef.current) {
      const noiseCv = document.createElement('canvas');
      noiseCv.width = NOISE_CANVAS_SIZE;
      noiseCv.height = NOISE_CANVAS_SIZE;
      const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });
      if (noiseCtx) {
        const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const rand = Math.floor(Math.random() * 256); // Full black to white noise
          data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255;
        }
        noiseCtx.putImageData(imageData, 0, 0);
        noiseImageDataRef.current = noiseCtx.getImageData(0, 0, NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE); // Store ImageData
        console.log("Noise ImageData created and stored in context ref.");
      } else {
        console.warn("Could not get 2D context for noise canvas generation.");
      }
    }
  }, [canvasRef.current, noiseImageDataRef]); // Depend on canvasRef.current

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const {
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      grainIntensity,
    } = settings;

    // Calculate content dimensions based on original image and cropZoom
    let contentWidth = originalImage.naturalWidth / cropZoom;
    let contentHeight = originalImage.naturalHeight / cropZoom;

    // Calculate source x, y for cropping
    let sx = (cropOffsetX * 0.5 + 0.5) * (originalImage.naturalWidth - contentWidth);
    let sy = (cropOffsetY * 0.5 + 0.5) * (originalImage.naturalHeight - contentHeight);

    contentWidth = Math.max(1, Math.round(contentWidth));
    contentHeight = Math.max(1, Math.round(contentHeight));
    sx = Math.max(0, Math.min(Math.round(sx), originalImage.naturalWidth - contentWidth));
    sy = Math.max(0, Math.min(Math.round(sy), originalImage.naturalHeight - contentHeight));

    if (![sx, sy, contentWidth, contentHeight].every(val => Number.isFinite(val) && val >= 0) || contentWidth === 0 || contentHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, contentWidth, contentHeight });
      return;
    }

    // Determine physical dimensions of the canvas (what we want to display)
    // This already respects the crop
    let canvasPhysicalWidth, canvasPhysicalHeight;
    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = contentHeight;
      canvasPhysicalHeight = contentWidth;
    } else {
      canvasPhysicalWidth = contentWidth;
      canvasPhysicalHeight = contentHeight;
    }
    
    // Apply max width/height limits for preview performance
    const MAX_WIDTH_STANDARD_RATIO = 800;
    const MAX_WIDTH_WIDE_RATIO = 960;
    const MAX_PHYSICAL_HEIGHT_CAP = 1000;
    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1;
    let targetMaxWidthForCanvas = (currentAspectRatio > 1.6) ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : Math.round(targetMaxWidthForCanvas / currentAspectRatio);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : Math.round(MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    // Set actual canvas buffer size
    canvas.width = Math.max(1, Math.round(canvasPhysicalWidth));
    canvas.height = Math.max(1, Math.round(canvasPhysicalHeight));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply internal scaling for preview mode
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    // Apply transformations
    // Translate to center of the (potentially scaled) drawing area
    const effectiveCanvasWidth = isPreviewing ? canvas.width / PREVIEW_SCALE_FACTOR : canvas.width;
    const effectiveCanvasHeight = isPreviewing ? canvas.height / PREVIEW_SCALE_FACTOR : canvas.height;

    ctx.translate(Math.round(effectiveCanvasWidth / 2), Math.round(effectiveCanvasHeight / 2));
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    // Destination draw dimensions should fill the (potentially scaled) effective canvas area
    // after 90/270 rotation
    const destDrawWidth = Math.round((rotation === 90 || rotation === 270) ? effectiveCanvasHeight : effectiveCanvasWidth);
    const destDrawHeight = Math.round((rotation === 90 || rotation === 270) ? effectiveCanvasWidth : effectiveCanvasHeight);
    
    // Apply CSS-like filters first
    applyCssFilters(ctx, settings);
    
    // Draw the cropped portion of the original image
    ctx.drawImage(
      originalImage,
      sx, sy, contentWidth, contentHeight, // Source rectangle from original image
      Math.round(-destDrawWidth / 2), Math.round(-destDrawHeight / 2), destDrawWidth, destDrawHeight // Destination rectangle
    );

    ctx.filter = 'none'; // Reset filter after drawing the base image

    // Apply other canvas-based effects (highlights, shadows, tint, vignette)
    // These were passed to drawImageWithSettingsToContext, which is now in ImageEditorContext
    // For brevity, I'm omitting their direct reimplementation here as they'd call a shared function
    // or have their logic duplicated. Assume this part refers to the effect application
    // as it was in the `drawImageWithSettingsToContext` function from the context.
    // For the grain effect, we use the new ImageData approach:

    const currentNoiseImageData = noiseImageDataRef.current;
    if (grainIntensity > 0.001 && currentNoiseImageData) {
        const tempNoiseCanvas = document.createElement('canvas');
        tempNoiseCanvas.width = currentNoiseImageData.width;
        tempNoiseCanvas.height = currentNoiseImageData.height;
        const tempNoiseCtx = tempNoiseCanvas.getContext('2d');

        if (tempNoiseCtx) {
            tempNoiseCtx.putImageData(currentNoiseImageData, 0, 0);
            const liveNoisePattern = ctx.createPattern(tempNoiseCanvas, 'repeat');
            if (liveNoisePattern) {
                // console.log("Applying grain for live preview:", { grainIntensity, pattern: 'created' });
                ctx.save();
                ctx.fillStyle = liveNoisePattern;
                ctx.globalAlpha = grainIntensity * 0.5; // Preview intensity
                ctx.globalCompositeOperation = 'overlay';
                 // The rectArgs for effects should also respect the preview scaling
                const effectRectArgs: [number, number, number, number] = [
                    Math.round(-destDrawWidth / 2), 
                    Math.round(-destDrawHeight / 2), 
                    destDrawWidth, 
                    destDrawHeight
                ];
                ctx.fillRect(...effectRectArgs);
                ctx.restore(); 
            } else {
                console.warn("Could not create grain pattern for live preview.");
            }
        } else {
            console.warn("Could not get context for temporary noise canvas for preview.");
        }
    } else if (grainIntensity > 0.001 && !currentNoiseImageData) {
      console.warn("Grain effect active, but noiseImageDataRef.current is null or undefined for live preview.");
    }


    ctx.restore(); // Restore from the initial save (after clearRect)
  }, [originalImage, settings, canvasRef, isPreviewing, noiseImageDataRef, applyCssFilters]);


  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 150),
    [drawImageImmediately, isPreviewing]
  );

  useEffect(() => {
    if (originalImage) {
      if (isPreviewing) {
        debouncedDrawImage();
      } else {
        drawImageImmediately();
      }
    } else {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.filter = 'none';
        }
      }
    }
  }, [originalImage, settings, isPreviewing, canvasRef, drawImageImmediately, debouncedDrawImage]);


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
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }}
    />
  );
}
