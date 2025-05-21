
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';


const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 100;

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
  } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);


  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const {
      brightness, contrast, saturation, exposure, highlights, shadows, blacks, 
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity,
      hueRotate, filter,
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
    let canvasPhysicalWidth = sWidth;
    let canvasPhysicalHeight = sHeight;

    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = sHeight; 
      canvasPhysicalHeight = sWidth;
    }

    const MAX_WIDTH_STANDARD_RATIO = 800; 
    const MAX_WIDTH_WIDE_RATIO = 960;     
    const MAX_PHYSICAL_HEIGHT_CAP = 1000; 

    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1; // Avoid division by zero
    let targetMaxWidthForCanvas;

    if (currentAspectRatio > 1.6) { 
        targetMaxWidthForCanvas = MAX_WIDTH_WIDE_RATIO;
    } else { 
        targetMaxWidthForCanvas = MAX_WIDTH_STANDARD_RATIO;
    }

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : targetMaxWidthForCanvas / currentAspectRatio;
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio;
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }

    canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
    canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));

    // 3. Set canvas buffer dimensions to the (capped) physical size.
    // The preview scaling will now happen via ctx.scale()
    canvas.width = canvasPhysicalWidth;
    canvas.height = canvasPhysicalHeight;


    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply internal scaling for preview mode
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    // Translate to center of the canvas's logical drawing surface.
    // If previewing, this surface is effectively canvas.width * PREVIEW_SCALE_FACTOR wide.
    const effectiveCanvasWidth = isPreviewing ? canvas.width / PREVIEW_SCALE_FACTOR : canvas.width;
    const effectiveCanvasHeight = isPreviewing ? canvas.height / PREVIEW_SCALE_FACTOR : canvas.height;
    
    ctx.translate(effectiveCanvasWidth / 2, effectiveCanvasHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    
    ctx.filter = 'none'; // Explicitly reset filter before applying new one
    const filters: string[] = [];
    let finalBrightness = brightness;
    finalBrightness += exposure; 
    
    let finalContrast = contrast;
    if (blacks !== 0) { 
      finalBrightness += blacks * 0.05;
      finalContrast *= (1 - Math.abs(blacks) * 0.1);
    }
    finalContrast = Math.max(0, finalContrast);

    if (Math.abs(finalBrightness - 1) > 0.001) filters.push(`brightness(${finalBrightness * 100}%)`);
    if (Math.abs(finalContrast - 1) > 0.001) filters.push(`contrast(${finalContrast * 100}%)`);
    if (Math.abs(saturation - 1) > 0.001) filters.push(`saturate(${saturation * 100}%)`);
    if (Math.abs(hueRotate) > 0.001) filters.push(`hue-rotate(${hueRotate}deg)`);
    if (filter) filters.push(filter);
    
    const trimmedFilterString = filters.join(' ').trim();
    if (trimmedFilterString) {
      ctx.filter = trimmedFilterString;
    }
    
    // These are the content dimensions on the (potentially scaled by ctx.scale if previewing) canvas coordinate system
    const destDrawWidth = (rotation === 90 || rotation === 270) ? effectiveCanvasHeight : effectiveCanvasWidth;
    const destDrawHeight = (rotation === 90 || rotation === 270) ? effectiveCanvasWidth : effectiveCanvasHeight;
    
    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight, 
      -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight
    );
    ctx.filter = 'none'; 

    const effectRectArgs: [number, number, number, number] = [ -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight ];

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
    
    const SHADOW_HIGHLIGHT_ALPHA_FACTOR = 0.175 * 0.25 * 0.5 * 0.5; 
    if (Math.abs(shadows) > 0.001) {
      const shadowAlpha = Math.abs(shadows) * SHADOW_HIGHLIGHT_ALPHA_FACTOR;
      if (shadows > 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128,128,128)', shadowAlpha, 'screen');
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(50,50,50)', shadowAlpha, 'multiply');
    }

    if (Math.abs(highlights) > 0.001) {
      const highlightAlpha = Math.abs(highlights) * SHADOW_HIGHLIGHT_ALPHA_FACTOR;
      if (highlights < 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128,128,128)', highlightAlpha, 'multiply');
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(200,200,200)', highlightAlpha, 'screen');
    }
    
    if (Math.abs(colorTemperature) > 0.001) {
      const temp = colorTemperature / 100;
      const alpha = Math.abs(temp) * 0.1; 
      const color = temp > 0 ? `rgba(255, 185, 70, ${alpha})` : `rgba(100, 150, 255, ${alpha})`;
      applyBlendEffect(ctx, effectRectArgs, color, 1, 'overlay');
    }

    const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6 * 0.5; 
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturationFactor: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0.001 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
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
    
    if (vignetteIntensity > 0.001) {
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

    if (grainIntensity > 0.001 && noisePatternRef.current) {
        ctx.save();
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = grainIntensity * 0.3; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...effectRectArgs); 
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
  }, [originalImage, settings, isPreviewing, drawImageImmediately, debouncedDrawImage]);


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

