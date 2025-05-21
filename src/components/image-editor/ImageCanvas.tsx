
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

// Helper function to apply a canvas blend effect
const applyBlendEffect = (
  ctx: CanvasRenderingContext2D,
  rectArgs: [number, number, number, number],
  color: string,
  alpha: number,
  compositeOperation: GlobalCompositeOperation
) => {
  if (alpha > 0.001) { // Only apply if alpha is significant
    ctx.globalCompositeOperation = compositeOperation;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(...rectArgs);
    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
  }
};


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
const NOISE_CANVAS_SIZE = 100;
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6;

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (noiseCanvasRef.current && (!noisePatternRef.current || ctx.createPattern(noiseCanvasRef.current, 'repeat') === null)) {
        noisePatternRef.current = ctx.createPattern(noiseCanvasRef.current, 'repeat');
    }

    const { rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY } = settings;

    // Calculate source dimensions from original image based on cropZoom
    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;

    // Calculate source X, Y based on cropOffset
    const maxPanX = originalImage.naturalWidth - sWidth;
    const maxPanY = originalImage.naturalHeight - sHeight;
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;
    
    // Clamp source dimensions and offsets
    sWidth = Math.max(1, sWidth);
    sHeight = Math.max(1, sHeight);
    sx = Math.max(0, Math.min(sx, originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(sy, originalImage.naturalHeight - sHeight));

    if (![sx, sy, sWidth, sHeight].every(val => Number.isFinite(val) && val >= 0) || sWidth === 0 || sHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, sWidth, sHeight });
      return;
    }
    
    // Determine canvas buffer dimensions based on the (potentially rotated 90/270 deg) source selection
    let canvasBufferWidth, canvasBufferHeight;
    if (rotation === 90 || rotation === 270) {
      canvasBufferWidth = sHeight; 
      canvasBufferHeight = sWidth;
    } else {
      canvasBufferWidth = sWidth;
      canvasBufferHeight = sHeight;
    }

    const currentScaleFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1;
    canvas.width = Math.round(canvasBufferWidth * currentScaleFactor * Math.abs(scaleX));
    canvas.height = Math.round(canvasBufferHeight * currentScaleFactor * Math.abs(scaleY));
    
    // These are the dimensions the image portion will be drawn at *within the transformed context*
    const finalDestWidth = canvas.width / Math.abs(scaleX);
    const finalDestHeight = canvas.height / Math.abs(scaleY);
    
    ctx.clearRect(0,0, canvas.width, canvas.height); // Clear canvas before drawing
    ctx.save();
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    // --- Draw base image ---
    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight,            
      -finalDestWidth / 2, 
      -finalDestHeight / 2,
      finalDestWidth,        
      finalDestHeight
    );
    
    const rectArgs: [number, number, number, number] = [
      -finalDestWidth / 2, 
      -finalDestHeight / 2, 
      finalDestWidth, 
      finalDestHeight
    ];

    // --- Apply Canvas-based Adjustments ---
    // Exposure
    if (settings.exposure !== 0) {
      const exposureAlpha = Math.abs(settings.exposure);
      if (settings.exposure > 0) {
        applyBlendEffect(ctx, rectArgs, `rgba(255, 255, 255, ${exposureAlpha * 0.7})`, 1, 'screen');
      } else {
        applyBlendEffect(ctx, rectArgs, `rgba(128, 128, 128, ${exposureAlpha * 0.7})`, 1, 'multiply');
      }
    }

    // Brightness
    if (settings.brightness !== 1) {
      if (settings.brightness > 1) {
        applyBlendEffect(ctx, rectArgs, `rgba(255, 255, 255, ${(settings.brightness - 1) * 0.4})`, 1, 'screen');
      } else { // brightness < 1
        applyBlendEffect(ctx, rectArgs, `rgba(0, 0, 0, ${(1 - settings.brightness) * 0.4})`, 1, 'multiply');
      }
    }

    // Contrast (Approximation)
    if (settings.contrast !== 1) {
      const contrastFactor = (settings.contrast - 1) * 0.25; // Max +/- ~12.5% effect for contrast
      applyBlendEffect(ctx, rectArgs, `rgba(128, 128, 128, ${Math.abs(contrastFactor)})`, 1, 'overlay');
    }
    
    // Saturation (Desaturation only for now)
    if (settings.saturation < 1) {
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = 'gray';
      ctx.globalAlpha = (1 - settings.saturation) * 0.8; // Apply 80% of the desaturation effect
      ctx.fillRect(...rectArgs);
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Blacks
    if (settings.blacks !== 0) {
      const blacksAlpha = Math.abs(settings.blacks) * 0.25;
      if (settings.blacks > 0) { // Lift blacks
        applyBlendEffect(ctx, rectArgs, `rgba(80, 80, 80, ${blacksAlpha})`, 1, 'screen');
      } else { // Crush blacks
        applyBlendEffect(ctx, rectArgs, `rgba(40, 40, 40, ${blacksAlpha})`, 1, 'multiply');
      }
    }
    
    // Shadows (Canvas specific)
    if (settings.shadows > 0) { 
      applyBlendEffect(ctx, rectArgs, 'rgb(128, 128, 128)', settings.shadows * 0.175 * 0.5, 'screen');
    } else if (settings.shadows < 0) { 
      applyBlendEffect(ctx, rectArgs, 'rgb(50, 50, 50)', Math.abs(settings.shadows) * 0.1 * 0.5, 'multiply');
    }

    // Highlights (Canvas specific)
    if (settings.highlights < 0) { 
      applyBlendEffect(ctx, rectArgs, 'rgb(128, 128, 128)', Math.abs(settings.highlights) * 0.175 * 0.5, 'multiply');
    } else if (settings.highlights > 0) { 
      applyBlendEffect(ctx, rectArgs, 'rgb(200, 200, 200)', settings.highlights * 0.1 * 0.5, 'screen');
    }

    // Color Temperature
    if (settings.colorTemperature !== 0) {
      const temp = settings.colorTemperature / 100;
      const alpha = Math.abs(temp) * 0.2;
      const color = temp > 0 ? `rgba(255, 165, 0, ${alpha})` : `rgba(0, 0, 255, ${alpha})`;
      applyBlendEffect(ctx, rectArgs, color, 1, 'overlay');
    }

    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturation: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
        const rgbColor = hexToRgb(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgb(rgbColor, saturation);
          const finalColorHex = rgbToHex(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          applyBlendEffect(ctx, rectArgs, finalColorHex, intensity * TINT_EFFECT_SCALING_FACTOR, blendMode);
        }
      }
    };
    
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
    
    // Vignette
    if (settings.vignetteIntensity > 0) {
      const centerX = 0; 
      const centerY = 0;
      const vignetteCanvasWidth = finalDestWidth;
      const vignetteCanvasHeight = finalDestHeight;
      const radiusX = vignetteCanvasWidth / 2;
      const radiusY = vignetteCanvasHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...rectArgs);
    }

    // Grain
    if (settings.grainIntensity > 0 && noisePatternRef.current) {
        ctx.save(); 
        ctx.translate(-finalDestWidth/2, -finalDestHeight/2);
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = settings.grainIntensity * 0.5;
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(0, 0, finalDestWidth, finalDestHeight); 
        ctx.restore(); 
    }

    ctx.restore();
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });
        if (noiseCtx) {
            const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const rand = Math.floor(Math.random() * 150) + 50;
                data[i] = rand;
                data[i + 1] = rand;
                data[i + 2] = rand;
                data[i + 3] = 255;
            }
            noiseCtx.putImageData(imageData, 0, 0);
            noiseCanvasRef.current = noiseCv;

            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
                const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
                if (mainCtx && noiseCanvasRef.current) {
                    noisePatternRef.current = mainCtx.createPattern(noiseCanvasRef.current, 'repeat');
                }
            }
        }
    }
  }, [canvasRef]); 


  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 200),
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
    />
  );
}

    