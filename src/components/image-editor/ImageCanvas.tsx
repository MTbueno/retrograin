
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
      highlights, shadows,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity,
    } = settings;

    // Calculate dimensions of the content to be drawn from the original image
    let contentWidth = originalImage.naturalWidth / cropZoom;
    let contentHeight = originalImage.naturalHeight / cropZoom;

    // Calculate the source x, y for cropping
    const maxPanX = originalImage.naturalWidth - contentWidth;
    const maxPanY = originalImage.naturalHeight - contentHeight;
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    // Ensure crop dimensions are valid
    contentWidth = Math.max(1, Math.round(contentWidth));
    contentHeight = Math.max(1, Math.round(contentHeight));
    sx = Math.max(0, Math.min(Math.round(sx), originalImage.naturalWidth - contentWidth));
    sy = Math.max(0, Math.min(Math.round(sy), originalImage.naturalHeight - contentHeight));

    if (![sx, sy, contentWidth, contentHeight].every(val => Number.isFinite(val) && val >= 0) || contentWidth === 0 || contentHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, contentWidth, contentHeight });
      return;
    }
    
    // Determine physical size of the canvas buffer based on content and 90/270deg rotations
    let canvasPhysicalWidth, canvasPhysicalHeight;
    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = contentHeight;
      canvasPhysicalHeight = contentWidth;
    } else {
      canvasPhysicalWidth = contentWidth;
      canvasPhysicalHeight = contentHeight;
    }

    // Apply performance limits to physical canvas size
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

    // Set canvas buffer dimensions
    canvas.width = Math.max(1, Math.round(canvasPhysicalWidth));
    canvas.height = Math.max(1, Math.round(canvasPhysicalHeight));
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Apply preview scaling internally if needed
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }
    
    // Determine effective drawing dimensions for the image on canvas
    // These are relative to the (potentially scaled for preview) context
    const effectiveCanvasWidth = isPreviewing ? canvas.width / PREVIEW_SCALE_FACTOR : canvas.width;
    const effectiveCanvasHeight = isPreviewing ? canvas.height / PREVIEW_SCALE_FACTOR : canvas.height;
    
    // Center transformations
    ctx.translate(effectiveCanvasWidth / 2, effectiveCanvasHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180); // 90/180/270 deg rotations
    ctx.scale(scaleX, scaleY); // Flips
    
    // Apply CSS-like filters (brightness, contrast, saturation, exposure, blacks, hue, presets)
    // This function will handle resetting ctx.filter = 'none' internally as needed.
    applyCssFilters(ctx, settings); 
    
    // Dimensions for drawing the image (sWidth/sHeight from original, dWidth/dHeight for canvas)
    // The destination for drawImage should be the effective canvas size, as transforms handle the centering.
    const destDrawWidth = (rotation === 90 || rotation === 270) ? effectiveCanvasHeight : effectiveCanvasWidth;
    const destDrawHeight = (rotation === 90 || rotation === 270) ? effectiveCanvasWidth : effectiveCanvasHeight;
    
    ctx.drawImage(
      originalImage,
      sx, sy, contentWidth, contentHeight, 
      -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight
    );

    // IMPORTANT: Reset CSS filter after drawing the base image with CSS filters
    // so that subsequent canvas operations are not affected by it.
    ctx.filter = 'none'; 

    // Define a rectangle for applying overlay effects, matching the drawn image area
    const effectRectArgs: [number, number, number, number] = [ -destDrawWidth / 2, -destDrawHeight / 2, destDrawWidth, destDrawHeight ];

    // Helper for blend effects
    const applyBlendEffect = (
        _ctx: CanvasRenderingContext2D,
        _rectArgs: [number, number, number, number],
        _color: string,
        _alpha: number,
        _compositeOperation: GlobalCompositeOperation
      ) => {
      if (_alpha > 0.001) { // Only apply if alpha is significant
        _ctx.globalCompositeOperation = _compositeOperation;
        _ctx.fillStyle = _color;
        _ctx.globalAlpha = _alpha;
        _ctx.fillRect(..._rectArgs);
        _ctx.globalAlpha = 1.0; 
        _ctx.globalCompositeOperation = 'source-over'; 
      }
    };
    
    // Shadow & Highlight Adjustments (Canvas based)
    // Increased intensity factor for highlights and shadows
    const SHADOW_HIGHLIGHT_ALPHA_FACTOR = 0.075; 
    
    if (Math.abs(shadows) > 0.001) {
      const shadowAlpha = Math.abs(shadows) * SHADOW_HIGHLIGHT_ALPHA_FACTOR;
      if (shadows > 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128,128,128)', shadowAlpha, 'screen'); // Lighten shadows
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(50,50,50)', shadowAlpha, 'multiply'); // Darken shadows
    }

    if (Math.abs(highlights) > 0.001) {
      const highlightAlpha = Math.abs(highlights) * SHADOW_HIGHLIGHT_ALPHA_FACTOR;
      if (highlights < 0) applyBlendEffect(ctx, effectRectArgs, 'rgb(128,128,128)', highlightAlpha, 'multiply'); // Darken/recover highlights
      else applyBlendEffect(ctx, effectRectArgs, 'rgb(200,200,200)', highlightAlpha, 'screen'); // Brighten highlights
    }
    
    // Color Temperature (Canvas based)
    if (Math.abs(colorTemperature) > 0.001) {
      const temp = colorTemperature / 100; // Normalize to -1 to 1 range
      const alpha = Math.abs(temp) * 0.1; // Max alpha 10% for temperature
      const color = temp > 0 ? `rgba(255, 185, 70, ${alpha})` : `rgba(100, 150, 255, ${alpha})`; // Orange for warm, Blue for cool
      applyBlendEffect(ctx, effectRectArgs, color, 1, 'overlay'); // Use alpha from color string directly
    }

    // Tint Adjustments (Canvas based)
    const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.5; // Reduced further
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
    applyTintWithSaturation(tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation, 'color-dodge'); // Shadows tint
    applyTintWithSaturation(tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation, 'color-burn'); // Highlights tint
    
    // Vignette (Canvas based)
    if (vignetteIntensity > 0.001) {
      const centerX = 0; // Relative to the translated center of the canvas
      const centerY = 0;
      const radiusX = destDrawWidth / 2;
      const radiusY = destDrawHeight / 2;
      // Make vignette slightly elliptical based on image aspect ratio to appear more circular on the image
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 0.7})`); // Max 70% black vignette
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    // Grain (Canvas based)
    if (grainIntensity > 0.001 && noisePatternRef.current) {
        ctx.save();
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = grainIntensity * 0.3; // Max 30% grain opacity
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...effectRectArgs); 
        ctx.restore(); // Restore from grain's save
    }

    ctx.restore(); // Restore from main save (transformations, preview scaling)
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef, applyCssFilters]); 

  // Effect to generate noise pattern once
  useEffect(() => {
    const canvas = canvasRef.current; // Main canvas, used to create pattern compatible with its context
    if (typeof window !== 'undefined' && canvas && !noisePatternRef.current) {
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });
        if (noiseCtx) {
            const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const rand = Math.floor(Math.random() * 150) + 50; // Mid-gray noise
                data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255; // Fully opaque
            }
            noiseCtx.putImageData(imageData, 0, 0);
            
            const mainCtx = canvas.getContext('2d', { willReadFrequently: true }); // Get context from main canvas
            if (mainCtx) {
                try {
                    noisePatternRef.current = mainCtx.createPattern(noiseCv, 'repeat');
                } catch (e) {
                    console.error("Error creating noise pattern:", e);
                    noisePatternRef.current = null; // Ensure it's null if creation fails
                }
            }
        }
    }
  }, [canvasRef, noisePatternRef]); // Only depends on canvasRef and noisePatternRef itself

  // Debounced drawing for preview
  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 150), // Shorter delay for preview
    [drawImageImmediately, isPreviewing] 
  );

  // Main effect to redraw image when relevant props change
  useEffect(() => {
    if (originalImage) {
      if (isPreviewing) {
        debouncedDrawImage();
      } else {
        drawImageImmediately();
      }
    } else {
        // Clear canvas if no image
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.filter = 'none'; // Ensure filter is cleared
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
      // Apply image-rendering based on preview state for performance vs quality
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }} 
    />
  );
}

    
