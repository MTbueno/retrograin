
"use client";

import type { RefObject } from 'react';
import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Helper function to apply CSS-like filters on canvas
const applyCssFilters = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';
  if (settings.brightness !== 1) filterString += `brightness(${settings.brightness * 100}%) `;
  if (settings.contrast !== 1) filterString += `contrast(${settings.contrast * 100}%) `;
  if (settings.saturation !== 1) filterString += `saturate(${settings.saturation * 100}%) `;
  
  if (settings.exposure !== 0) {
    const exposureEffect = 1 + settings.exposure * 0.5; 
    filterString += `brightness(${exposureEffect * 100}%) `; // Approximating exposure with brightness
  }

  if (settings.hueRotate !== 0) filterString += `hue-rotate(${settings.hueRotate}deg) `;

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

const PREVIEW_SCALE_FACTOR = 0.5; 
const NOISE_CANVAS_SIZE = 100; // Size of the noise texture

export function ImageCanvas() { 
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  // Generate noise pattern
  useEffect(() => {
    if (typeof window !== 'undefined') { // Ensure this runs only on client
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d');
        if (noiseCtx) {
            const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const rand = Math.floor(Math.random() * 150) + 50; // Grayscale noise, not too dark or light
                data[i] = rand;     // red
                data[i + 1] = rand; // green
                data[i + 2] = rand; // blue
                data[i + 3] = 255;  // alpha
            }
            noiseCtx.putImageData(imageData, 0, 0);
            noiseCanvasRef.current = noiseCv;

            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
                const mainCtx = mainCanvas.getContext('2d');
                if (mainCtx) {
                    noisePatternRef.current = mainCtx.createPattern(noiseCv, 'repeat');
                }
            }
        }
    }
  }, [canvasRef]);

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (noiseCanvasRef.current && !noisePatternRef.current) {
        noisePatternRef.current = ctx.createPattern(noiseCanvasRef.current, 'repeat');
    }

    const { rotation, scaleX, scaleY, crop } = settings;

    let sx = 0, sy = 0;
    let sWidth = originalImage.naturalWidth;
    let sHeight = originalImage.naturalHeight;

    if (crop) {
      sx = crop.unit === '%' ? (crop.x / 100) * originalImage.naturalWidth : crop.x;
      sy = crop.unit === '%' ? (crop.y / 100) * originalImage.naturalHeight : crop.y;
      sWidth = crop.unit === '%' ? (crop.width / 100) * originalImage.naturalWidth : crop.width;
      sHeight = crop.unit === '%' ? (crop.height / 100) * originalImage.naturalHeight : crop.height;
      sWidth = Math.max(1, sWidth);
      sHeight = Math.max(1, sHeight);
    }
    
    let contentWidth = sWidth;
    let contentHeight = sHeight;
    
    let canvasBufferWidth, canvasBufferHeight;
    if (rotation === 90 || rotation === 270) {
      canvasBufferWidth = contentHeight * Math.abs(scaleY);
      canvasBufferHeight = contentWidth * Math.abs(scaleX);
    } else {
      canvasBufferWidth = contentWidth * Math.abs(scaleX);
      canvasBufferHeight = contentHeight * Math.abs(scaleY);
    }

    const currentScaleFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1;
    canvas.width = canvasBufferWidth * currentScaleFactor;
    canvas.height = canvasBufferHeight * currentScaleFactor;
    
    ctx.save();
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    // 1. Apply CSS-like filters
    applyCssFilters(ctx, settings);
    
    // 2. Draw the image (filters are applied here)
    ctx.drawImage(
      originalImage, sx, sy, sWidth, sHeight,
      -contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight
    );

    // 3. Reset CSS filters for manual drawing effects
    ctx.filter = 'none';

    // 4. Apply Color Temperature
    if (settings.colorTemperature !== 0) {
      const temp = settings.colorTemperature / 100; // Normalize to -1 to 1
      const alpha = Math.abs(temp) * 0.2; // Max 20% opacity for overlay
      if (temp > 0) { // Warm
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // Orange
      } else { // Cool
        ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`; // Blue
      }
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillRect(-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight);
      ctx.globalCompositeOperation = 'source-over'; // Reset
    }

    // 5. Apply Tint (Shadows, Midtones, Highlights)
    const rectArgs: [number, number, number, number] = [-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight];

    // Shadows Tint (Applied first in new order)
    if (settings.tintShadowsIntensity > 0 && settings.tintShadowsColor) {
      ctx.globalCompositeOperation = 'color-burn';
      ctx.fillStyle = settings.tintShadowsColor;
      ctx.globalAlpha = settings.tintShadowsIntensity;
      ctx.fillRect(...rectArgs);
    }
    
    // Midtones Tint (Applied second in new order)
    if (settings.tintMidtonesIntensity > 0 && settings.tintMidtonesColor) {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = settings.tintMidtonesColor;
      ctx.globalAlpha = settings.tintMidtonesIntensity;
      ctx.fillRect(...rectArgs);
    }
    
    // Highlights Tint (Applied third in new order)
    if (settings.tintHighlightsIntensity > 0 && settings.tintHighlightsColor) {
      ctx.globalCompositeOperation = 'color-dodge';
      ctx.fillStyle = settings.tintHighlightsColor;
      ctx.globalAlpha = settings.tintHighlightsIntensity;
      ctx.fillRect(...rectArgs);
    }

    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
    
    // 6. Apply Vignette
    if (settings.vignetteIntensity > 0) {
      const centerX = 0; 
      const centerY = 0;
      const radiusX = contentWidth / 2;
      const radiusY = contentHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);

      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight);
    }

    // 7. Apply Grain
    if (settings.grainIntensity > 0 && noisePatternRef.current) {
        ctx.save(); 
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = settings.grainIntensity * 0.5; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight);
        ctx.restore(); 
    }

    ctx.restore(); 
  }, [originalImage, settings, canvasRef, isPreviewing]);

  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 200),
    [drawImageImmediately, isPreviewing]
  );

  useEffect(() => {
    if (originalImage) {
      debouncedDrawImage();
    } else { 
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
  }, [originalImage, settings, debouncedDrawImage, isPreviewing]);


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

