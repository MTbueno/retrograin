
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';


const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 100;
const SHADOW_HIGHLIGHT_ALPHA_FACTOR = 0.075; 
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6; 

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
    noisePatternRef, 
    applyCssFilters,
  } = useImageEditor();

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    
    const {
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      highlights, 
      shadows,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity,
    } = settings;

    let contentWidth = originalImage.naturalWidth / cropZoom;
    let contentHeight = originalImage.naturalHeight / cropZoom;

    const maxPanX = originalImage.naturalWidth - contentWidth;
    const maxPanY = originalImage.naturalHeight - contentHeight;
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    contentWidth = Math.max(1, Math.round(contentWidth));
    contentHeight = Math.max(1, Math.round(contentHeight));
    sx = Math.max(0, Math.min(Math.round(sx), originalImage.naturalWidth - contentWidth));
    sy = Math.max(0, Math.min(Math.round(sy), originalImage.naturalHeight - contentHeight));
    
    if (![sx, sy, contentWidth, contentHeight].every(val => Number.isFinite(val) && val >= 0) || contentWidth === 0 || contentHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, contentWidth, contentHeight });
      return;
    }

    let canvasPhysicalWidth, canvasPhysicalHeight;
    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = contentHeight;
      canvasPhysicalHeight = contentWidth;
    } else {
      canvasPhysicalWidth = contentWidth;
      canvasPhysicalHeight = contentHeight;
    }

    const MAX_WIDTH_STANDARD_RATIO = 800; 
    const MAX_WIDTH_WIDE_RATIO = 960;     
    const MAX_PHYSICAL_HEIGHT_CAP = 1000; 
    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1;
    let targetMaxWidthForCanvas = (currentAspectRatio > 1.6) ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : targetMaxWidthForCanvas / currentAspectRatio;
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio;
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    canvas.width = Math.max(1, Math.round(canvasPhysicalWidth));
    canvas.height = Math.max(1, Math.round(canvasPhysicalHeight));
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    let effectiveCanvasWidth = canvas.width;
    let effectiveCanvasHeight = canvas.height;

    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
      effectiveCanvasWidth = Math.round(canvas.width / PREVIEW_SCALE_FACTOR);
      effectiveCanvasHeight = Math.round(canvas.height / PREVIEW_SCALE_FACTOR);
    } else {
      effectiveCanvasWidth = canvas.width;
      effectiveCanvasHeight = canvas.height;
    }
    
    ctx.translate(Math.round(effectiveCanvasWidth / 2), Math.round(effectiveCanvasHeight / 2));
    ctx.rotate((rotation * Math.PI) / 180); 
    ctx.scale(scaleX, scaleY); 
    
    ctx.filter = 'none'; 
    applyCssFilters(ctx, settings); 
    
    const destDrawWidth = Math.round((rotation === 90 || rotation === 270) ? effectiveCanvasHeight : effectiveCanvasWidth);
    const destDrawHeight = Math.round((rotation === 90 || rotation === 270) ? effectiveCanvasWidth : effectiveCanvasHeight);
    
    ctx.drawImage(
      originalImage,
      sx, sy, contentWidth, contentHeight, 
      Math.round(-destDrawWidth / 2), Math.round(-destDrawHeight / 2), destDrawWidth, destDrawHeight
    );

    ctx.filter = 'none'; 

    const effectRectArgs: [number, number, number, number] = [ Math.round(-destDrawWidth / 2), Math.round(-destDrawHeight / 2), destDrawWidth, destDrawHeight ];

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

    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturationFactor: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0.001 && baseColorHex && baseColorHex !== '' && baseColorHex !== '#000000') {
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
        console.log("Applying grain:", { grainIntensity, pattern: noisePatternRef.current });
        ctx.save();
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = grainIntensity * 0.5; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...effectRectArgs); 
        ctx.restore(); 
    }

    ctx.restore(); 
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef, applyCssFilters]); 

  useEffect(() => {
    const canvas = canvasRef.current; 
    if (typeof window !== 'undefined' && canvas && !noisePatternRef.current) {
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });
        if (noiseCtx) {
            const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const rand = Math.floor(Math.random() * 256); // Full range noise
                data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255; 
            }
            noiseCtx.putImageData(imageData, 0, 0);
            
            const mainCtx = canvas.getContext('2d', { willReadFrequently: true }); 
            if (mainCtx) {
                try {
                    noisePatternRef.current = mainCtx.createPattern(noiseCv, 'repeat');
                    console.log("Noise pattern created:", noisePatternRef.current);
                } catch (e) {
                    console.error("Error creating noise pattern:", e);
                    noisePatternRef.current = null; 
                }
            } else {
              console.warn("Main canvas context not available when trying to create noise pattern.");
            }
        }
    }
  }, [canvasRef]); // Dependency on canvasRef to re-create if canvas changes

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

