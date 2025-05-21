
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
// hexToRgb, desaturateRgb, rgbToHex are now imported from colorUtils in ImageEditorContext
// and used within drawImageWithSettingsToContext, so not needed here directly if ImageCanvas
// only calls that function. However, drawImageImmediately is local.

const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 100;
// TINT_EFFECT_SCALING_FACTOR is now handled inside drawImageWithSettingsToContext

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
    // Assuming drawImageWithSettingsToContext is exposed or this component uses its own drawing logic
    // For simplicity, I'll assume drawImageImmediately will be the core logic here,
    // and ImageEditorContext.drawImageWithSettingsToContext is for offscreen rendering.
  } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);


  // This function is now the primary drawing logic for the visible canvas
  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const {
      brightness, contrast, saturation, exposure, highlights, shadows, blacks, hueRotate, filter,
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity
    } = settings;

    // 1. Calculate source rectangle from original image based on crop settings
    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;
    const maxPanX = originalImage.naturalWidth - sWidth;
    const maxPanY = originalImage.naturalHeight - sHeight;
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    sWidth = Math.max(1, Math.round(sWidth));
    sHeight = Math.max(1, Math.round(sHeight));
    sx = Math.max(0, Math.min(Math.round(sx), originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(Math.round(sy), originalImage.naturalHeight - sHeight));

    if (![sx, sy, sWidth, sHeight].every(val => Number.isFinite(val) && val >= 0) || sWidth === 0 || sHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, sWidth, sHeight });
      return;
    }

    // 2. Determine canvas buffer dimensions based on source rect and 90/270 rotation (content dimensions)
    // These are the dimensions of the content *after* 90/270 rotation but *before* capping and preview scaling
    let canvasPhysicalWidth = sWidth;
    let canvasPhysicalHeight = sHeight;

    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = sHeight; // Swapped
      canvasPhysicalHeight = sWidth;  // Swapped
    }

    // --- START: New Preview Capping Logic ---
    const MAX_WIDTH_STANDARD_RATIO = 800; // For ~4:3 and portrait
    const MAX_WIDTH_WIDE_RATIO = 960;     // For ~16:9 and wider
    const MAX_PHYSICAL_HEIGHT_CAP = 1000; // Absolute cap for very tall portraits

    const currentAspectRatio = canvasPhysicalWidth / canvasPhysicalHeight;
    let targetMaxWidthForCanvas;

    if (currentAspectRatio > 1.6) { // Wider than ~16:10, treat as wide
        targetMaxWidthForCanvas = MAX_WIDTH_WIDE_RATIO;
    } else { // Standard or portrait
        targetMaxWidthForCanvas = MAX_WIDTH_STANDARD_RATIO;
    }

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    
    // Cap height for very tall portrait images after width capping
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }

    canvasPhysicalWidth = Math.max(1, canvasPhysicalWidth);
    canvasPhysicalHeight = Math.max(1, canvasPhysicalHeight);
    // --- END: New Preview Capping Logic ---

    // 3. Apply preview scaling factor to canvas buffer dimensions
    const currentScaleFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1;
    canvas.width = Math.max(1, Math.round(canvasPhysicalWidth * currentScaleFactor));
    canvas.height = Math.max(1, Math.round(canvasPhysicalHeight * currentScaleFactor));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // 4. Translate to center of canvas, then apply 90-deg rotation and flips
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    // --- Apply CSS Filters (Brightness, Contrast, Saturation, etc.) ---
    ctx.filter = 'none'; // Explicitly reset before applying
    const filters: string[] = [];
    let finalBrightness = brightness;
    finalBrightness += exposure; // Incorporate exposure into brightness
    
    let finalContrast = contrast;
    if (blacks !== 0) { // Incorporate blacks into brightness & contrast
      finalBrightness += blacks * 0.05;
      finalContrast *= (1 - Math.abs(blacks) * 0.1);
    }
    finalContrast = Math.max(0, finalContrast);

    if (finalBrightness !== 1) filters.push(`brightness(${finalBrightness * 100}%)`);
    if (finalContrast !== 1) filters.push(`contrast(${finalContrast * 100}%)`);
    if (saturation !== 1) filters.push(`saturate(${saturation * 100}%)`);
    if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate}deg)`);
    if (filter) filters.push(filter);
    
    const trimmedFilterString = filters.join(' ').trim();
    ctx.filter = trimmedFilterString || 'none';
    if (navigator.userAgent.includes("Safari") && !navigator.userAgent.includes("Chrome")) {
         // console.log("[Safari Debug] CSS Filter String:", trimmedFilterString || 'none');
    }
    
    // The destination for drawImage should fill the (transformed) canvas space
    // If rotation is 0/180, canvas width/height are used directly
    // If rotation is 90/270, they are swapped because the context is rotated
    const destDrawWidth = (rotation === 90 || rotation === 270) ? canvas.height : canvas.width;
    const destDrawHeight = (rotation === 90 || rotation === 270) ? canvas.width : canvas.height;
    
    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight, // Source rect from original image, respecting cropZoom & offsets
      -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight // Draw to fill the transformed canvas
    );
    ctx.filter = 'none'; // Reset filter immediately after drawing the base image

    // Rectangle arguments for all canvas effects based on destination content size
    const effectRectArgs: [number, number, number, number] = [ -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight ];

    // Helper for blend effects (moved from context to be self-contained for ImageCanvas)
    const applyBlendEffect = (
        _ctx: CanvasRenderingContext2D,
        _rectArgs: [number, number, number, number],
        _color: string,
        _alpha: number,
        _compositeOperation: GlobalCompositeOperation
      ) => {
      if (_alpha > 0.001) {
        _ctx.globalCompositeOperation = _compositeOperation;
        _ctx.fillStyle = _color;
        _ctx.globalAlpha = _alpha;
        _ctx.fillRect(..._rectArgs);
        _ctx.globalAlpha = 1.0; 
        _ctx.globalCompositeOperation = 'source-over'; 
      }
    };
    
    // SHADOWS (Canvas Op)
    if (shadows !== 0) {
      const shadowAlpha = Math.abs(shadows) * 0.175 * 0.25 * 0.5;
      if (shadows > 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128, 128, 128)', shadowAlpha, 'screen');
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(50, 50, 50)', shadowAlpha, 'multiply');
    }
    // HIGHLIGHTS (Canvas Op)
    if (highlights !== 0) {
      const highlightAlpha = Math.abs(highlights) * 0.175 * 0.25 * 0.5;
      if (highlights < 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128, 128, 128)', highlightAlpha, 'multiply');
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(200, 200, 200)', highlightAlpha, 'screen');
    }
    
    // COLOR TEMPERATURE (Canvas Op)
    if (colorTemperature !== 0) {
      const temp = colorTemperature / 100;
      const alpha = Math.abs(temp) * 0.1; 
      const color = temp > 0 ? `rgba(255, 185, 70, ${alpha})` : `rgba(100, 150, 255, ${alpha})`;
      applyBlendEffect(ctx, effectRectArgs, color, 1, 'overlay');
    }

    // TINTS (Canvas Op)
    // Local color utils for tints, as they are specific to this rendering path
    const hexToRgbLocal = (hex: string): { r: number; g: number; b: number } | null => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    };
    const rgbToHexLocal = (r: number, g: number, b: number): string => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
    const desaturateRgbLocal = (rgb: { r: number; g: number; b: number }, saturationV: number): { r: number; g: number; b: number } => {
      const gray = rgb.r * 0.3086 + rgb.g * 0.6094 + rgb.b * 0.0820;
      return {
        r: Math.round(rgb.r * saturationV + gray * (1 - saturationV)),
        g: Math.round(rgb.g * saturationV + gray * (1 - saturationV)),
        b: Math.round(rgb.b * saturationV + gray * (1 - saturationV)),
      };
    };
    const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6 * 0.5; 
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturationFactor: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
        const rgbColor = hexToRgbLocal(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgbLocal(rgbColor, saturationFactor);
          const finalColorHex = rgbToHexLocal(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          applyBlendEffect(ctx, effectRectArgs, finalColorHex, intensity * TINT_EFFECT_SCALING_FACTOR, blendMode);
        }
      }
    };
    applyTintWithSaturation(tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation, 'color-burn');
    
    // VIGNETTE (Canvas Op)
    if (vignetteIntensity > 0) {
      const centerX = 0; 
      const centerY = 0;
      const radiusX = destDrawWidth / 2;
      const radiusY = destDrawHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 0.7})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    // GRAIN (Canvas Op)
    if (grainIntensity > 0 && noisePatternRef.current) {
        ctx.save();
        // Translate to the top-left of the content area before applying pattern
        // The effectRectArgs are already centered, so fillRect should work directly
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = grainIntensity * 0.3; // Max 30% grain opacity
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...effectRectArgs); // Fill the same rect as other effects
        ctx.restore();
    }

    ctx.restore(); // Restore from the initial save state
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]); // Added noisePatternRef dependency

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
                data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255;
            }
            noiseCtx.putImageData(imageData, 0, 0);
            noiseCanvasRef.current = noiseCv;

            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
                const mainCtx = mainCanvas.getContext('2d', { willReadFrequently: true });
                if (mainCtx && noiseCanvasRef.current) {
                    try {
                        noisePatternRef.current = mainCtx.createPattern(noiseCanvasRef.current, 'repeat');
                    } catch (e) {
                        console.error("Error creating noise pattern:", e);
                        noisePatternRef.current = null;
                    }
                }
            }
        }
    }
  }, [canvasRef]);


  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 150), // Slightly adjusted debounce times
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
                ctx.filter = 'none'; // Ensure filter is cleared if no image
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
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }} // Hint for preview quality
    />
  );
}
