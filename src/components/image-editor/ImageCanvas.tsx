
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 100;
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6 * 0.5;

// Helper function to apply a canvas blend effect
const applyBlendEffect = (
  ctx: CanvasRenderingContext2D,
  rectArgs: [number, number, number, number],
  color: string,
  alpha: number,
  compositeOperation: GlobalCompositeOperation
) => {
  if (alpha > 0.001) {
    ctx.globalCompositeOperation = compositeOperation;
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.fillRect(...rectArgs);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
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

    const {
      brightness, contrast, saturation, exposure, highlights, shadows, blacks,
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

    // 2. Determine canvas buffer dimensions based on source rect and 90/270 rotation
    let canvasPhysicalWidth = sWidth;
    let canvasPhysicalHeight = sHeight;

    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = sHeight; // Swapped
      canvasPhysicalHeight = sWidth;  // Swapped
    }

    // 3. Apply preview scaling factor to canvas buffer dimensions
    const currentScaleFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1;
    canvas.width = Math.max(1, Math.round(canvasPhysicalWidth * currentScaleFactor));
    canvas.height = Math.max(1, Math.round(canvasPhysicalHeight * currentScaleFactor));

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // 4. Translate to center of canvas, then apply 90-deg rotation and flips
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY); // Flips are applied to the context

    // 5. Define the destination drawing dimensions (these are relative to the *unrotated* source content)
    //    These are the dimensions of the content (sWidth, sHeight) scaled by the preview factor.
    const destContentWidth = sWidth * currentScaleFactor;
    const destContentHeight = sHeight * currentScaleFactor;

    // --- Rectangle arguments for all canvas effects based on destination content size ---
    const effectRectArgs: [number, number, number, number] = [
      -destContentWidth / 2,
      -destContentHeight / 2,
      destContentWidth,
      destContentHeight
    ];

    // --- Apply Canvas-based Adjustments (Brightness, Contrast, Saturation, Exposure, Blacks) ---
    // BRIGHTNESS
    if (brightness !== 1) {
      const brightValue = brightness -1; // -0.5 to 0.5
      if (brightValue > 0) applyBlendEffect(ctx, effectRectArgs, `rgba(255, 255, 255, ${brightValue * 0.5})`, 1, 'screen');
      else applyBlendEffect(ctx, effectRectArgs, `rgba(0, 0, 0, ${Math.abs(brightValue) * 0.5})`, 1, 'multiply');
    }
    // EXPOSURE
    if (exposure !== 0) {
      if (exposure > 0) applyBlendEffect(ctx, effectRectArgs, `rgba(220, 220, 220, ${exposure * 0.3})`, 1, 'screen');
      else applyBlendEffect(ctx, effectRectArgs, `rgba(30, 30, 30, ${Math.abs(exposure) * 0.3})`, 1, 'multiply');
    }
    // CONTRAST
    if (contrast !== 1) {
        const contrastValue = contrast - 1; // -0.5 to 0.5
        applyBlendEffect(ctx, effectRectArgs, `rgba(128, 128, 128, ${Math.abs(contrastValue)})`, 1, contrastValue > 0 ? 'overlay' : 'soft-light');
    }
    // SATURATION (only desaturation is approximated here)
    if (saturation < 0.99) { // if saturation is less than 1 (default)
        const grayValue = (1 - saturation) * 0.7; // max 70% gray overlay
        applyBlendEffect(ctx, effectRectArgs, `rgba(128, 128, 128, ${grayValue})`, 1, 'color');
    }
    // BLACKS
    if (blacks !== 0) { // -1 to 1
        const blackAdjustAlpha = Math.abs(blacks) * 0.15; // Max 15% effect
        if (blacks > 0) { // Lift blacks (make them grayer)
            applyBlendEffect(ctx, effectRectArgs, `rgba(50, 50, 50, ${blackAdjustAlpha})`, 1, 'screen');
        } else { // Crush blacks (make them darker)
            applyBlendEffect(ctx, effectRectArgs, `rgba(20, 20, 20, ${blackAdjustAlpha})`, 1, 'multiply');
        }
    }

    // --- Draw base image ---
    // The source is (sx, sy, sWidth, sHeight) from originalImage.
    // The destination is centered in the transformed context, with dimensions destContentWidth, destContentHeight.
    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight,
      -destContentWidth / 2,
      -destContentHeight / 2,
      destContentWidth,
      destContentHeight
    );

    // --- Apply other Canvas-based Adjustments (Highlights, Shadows, Tints, etc.) ---
    // SHADOWS
    if (shadows > 0) {
      applyBlendEffect(ctx, effectRectArgs, 'rgb(128, 128, 128)', shadows * 0.175 * 0.25 * 0.5, 'screen');
    } else if (shadows < 0) {
      applyBlendEffect(ctx, effectRectArgs, 'rgb(50, 50, 50)', Math.abs(shadows) * 0.1 * 0.25 * 0.5, 'multiply');
    }
    // HIGHLIGHTS
    if (highlights < 0) {
      applyBlendEffect(ctx, effectRectArgs, 'rgb(128, 128, 128)', Math.abs(highlights) * 0.175 * 0.25 * 0.5, 'multiply');
    } else if (highlights > 0) {
      applyBlendEffect(ctx, effectRectArgs, 'rgb(200, 200, 200)', highlights * 0.1 * 0.25 * 0.5, 'screen');
    }
    // COLOR TEMPERATURE
    if (colorTemperature !== 0) {
      const temp = colorTemperature / 100; // -1 to 1
      const alpha = Math.abs(temp) * 0.2; // Max 20% opacity
      const color = temp > 0 ? `rgba(255, 165, 0, ${alpha})` : `rgba(0, 0, 255, ${alpha})`; // Orange for warm, Blue for cool
      applyBlendEffect(ctx, effectRectArgs, color, 1, 'overlay');
    }
    // TINTS
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturationFactor: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
        const rgbColor = hexToRgb(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgb(rgbColor, saturationFactor);
          const finalColorHex = rgbToHex(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          applyBlendEffect(ctx, effectRectArgs, finalColorHex, intensity * TINT_EFFECT_SCALING_FACTOR, blendMode);
        }
      }
    };
    applyTintWithSaturation(tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation, 'color-burn');

    // VIGNETTE
    if (vignetteIntensity > 0) {
      const centerX = 0; // Center of the transformed context
      const centerY = 0;
      // Use destContentWidth/Height for vignette radius calculation
      const radiusX = destContentWidth / 2;
      const radiusY = destContentHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY); // Ensure vignette covers the content area
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    // GRAIN
    if (grainIntensity > 0 && noisePatternRef.current) {
        ctx.save();
        // Translate to the top-left of the content area before applying pattern
        ctx.translate(-destContentWidth / 2, -destContentHeight / 2);
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = grainIntensity * 0.5; // Max 50% grain opacity
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(0, 0, destContentWidth, destContentHeight);
        ctx.restore(); // Restore from grain's own save state
    }

    ctx.restore(); // Restore from the initial save state
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
                const rand = Math.floor(Math.random() * 150) + 50; // Range 50-200 for noise color
                data[i] = rand;
                data[i + 1] = rand;
                data[i + 2] = rand;
                data[i + 3] = 255; // Alpha
            }
            noiseCtx.putImageData(imageData, 0, 0);
            noiseCanvasRef.current = noiseCv;

            // Ensure noise pattern is created if main canvas context is available
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
