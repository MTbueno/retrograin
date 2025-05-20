
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

const applyCssFilters = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';
  let baseBrightness = settings.brightness;
  let baseContrast = settings.contrast;

  if (settings.blacks !== 0) {
    baseContrast *= (1 - settings.blacks * 0.5); 
    baseBrightness *= (1 + settings.blacks * 0.2);
    baseContrast = Math.max(0.1, Math.min(3, baseContrast));
    baseBrightness = Math.max(0.1, Math.min(3, baseBrightness));
  }

  if (baseBrightness !== 1) filterString += `brightness(${baseBrightness * 100}%) `;
  if (baseContrast !== 1) filterString += `contrast(${baseContrast * 100}%) `;
  if (settings.saturation !== 1) filterString += `saturate(${settings.saturation * 100}%) `;
  
  if (settings.exposure !== 0) {
    const exposureEffect = 1 + settings.exposure * 0.5; 
    filterString += `brightness(${exposureEffect * 100}%) `;
  }

  if (settings.hueRotate !== 0) filterString += `hue-rotate(${settings.hueRotate}deg) `;

  if (settings.filter) {
    if (settings.filter === 'grayscale') filterString += `grayscale(100%) `;
    if (settings.filter === 'sepia') filterString += `sepia(100%) `;
    if (settings.filter === 'invert') filterString += `invert(100%) `;
  }
  ctx.filter = filterString.trim();
};

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

const desaturateRgb = (rgb: { r: number; g: number; b: number }, saturation: number): { r: number; g: number; b: number } => {
  const gray = rgb.r * 0.3086 + rgb.g * 0.6094 + rgb.b * 0.0820; // Standard luminance calculation
  return {
    r: Math.round(rgb.r * saturation + gray * (1 - saturation)),
    g: Math.round(rgb.g * saturation + gray * (1 - saturation)),
    b: Math.round(rgb.b * saturation + gray * (1 - saturation)),
  };
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
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6; // Reduced original scaling factor

export function ImageCanvas() { 
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') { 
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d');
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

            // Ensure pattern is created after main canvas is available
            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
                const mainCtx = mainCanvas.getContext('2d');
                if (mainCtx) {
                    noisePatternRef.current = mainCtx.createPattern(noiseCv, 'repeat');
                }
            }
        }
    }
  }, [canvasRef]); // Re-run if canvasRef changes (though it shouldn't often)

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Re-create noise pattern if canvas context was recreated or pattern not set
    if (noiseCanvasRef.current && (!noisePatternRef.current || noisePatternRef.current.canvas?.getContext('2d') !== ctx)) {
        noisePatternRef.current = ctx.createPattern(noiseCanvasRef.current, 'repeat');
    }

    const { rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY } = settings;

    // Calculate source dimensions based on zoom, maintaining aspect ratio
    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;

    const maxPanX = originalImage.naturalWidth - sWidth;
    const maxPanY = originalImage.naturalHeight - sHeight;
    
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    sx = Math.max(0, Math.min(sx, originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(sy, originalImage.naturalHeight - sHeight));
    sWidth = Math.max(1, sWidth); 
    sHeight = Math.max(1, sHeight);
    
    // These are the dimensions of the content *after* cropping and before 90-degree rotation/flip
    let contentWidth = sWidth;
    let contentHeight = sHeight;
    
    // Calculate canvas buffer size based on content dimensions and 90-degree rotation/flip
    let canvasBufferWidth, canvasBufferHeight;
    if (rotation === 90 || rotation === 270) {
      canvasBufferWidth = contentHeight * Math.abs(scaleY);
      canvasBufferHeight = contentWidth * Math.abs(scaleX);
    } else {
      canvasBufferWidth = contentWidth * Math.abs(scaleX);
      canvasBufferHeight = contentHeight * Math.abs(scaleY);
    }

    // Apply preview scaling factor to the canvas buffer itself
    const currentScaleFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1;
    canvas.width = canvasBufferWidth * currentScaleFactor;
    canvas.height = canvasBufferHeight * currentScaleFactor;
    
    ctx.save(); // Save the clean context state
    
    // Move origin to canvas center for rotations/scaling
    ctx.translate(canvas.width / 2, canvas.height / 2);

    // Apply 90-degree rotations
    ctx.rotate((rotation * Math.PI) / 180);
    
    // Apply flips
    ctx.scale(scaleX, scaleY);

    // Apply preview scaling factor to drawing operations if in preview mode
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    // Apply CSS-like filters (brightness, contrast, saturation, etc.)
    applyCssFilters(ctx, settings);
    
    // Draw the cropped portion of the original image centered in the transformed context
    ctx.drawImage(
      originalImage, 
      sx, sy, sWidth, sHeight, // Source rect from original image
      -contentWidth / 2, -contentHeight / 2, // Draw centered in the transformed space
      contentWidth, contentHeight             // Draw at the content's natural (pre-90-deg-rotation) size
    );
    
    // Reset CSS filters for subsequent direct canvas manipulations
    ctx.filter = 'none';
    const rectArgs: [number, number, number, number] = [-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight];

    // Apply Shadows (Canvas specific)
    if (settings.shadows > 0) { // Brighten shadows
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.shadows * 0.175 * 0.5; // Adjusted factor further
      ctx.fillStyle = 'rgb(128, 128, 128)'; 
      ctx.fillRect(...rectArgs);
    } else if (settings.shadows < 0) { // Darken shadows
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.shadows) * 0.1 * 0.5; // Adjusted factor further
      ctx.fillStyle = 'rgb(50, 50, 50)'; 
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over'; 

    // Apply Highlights (Canvas specific)
    if (settings.highlights < 0) { // Darken highlights
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.highlights) * 0.175 * 0.5; // Adjusted factor further
      ctx.fillStyle = 'rgb(128, 128, 128)'; 
      ctx.fillRect(...rectArgs);
    } else if (settings.highlights > 0) { // Brighten highlights
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.highlights * 0.1 * 0.5; // Adjusted factor further
      ctx.fillStyle = 'rgb(200, 200, 200)'; 
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over';

    // Apply Color Temperature
    if (settings.colorTemperature !== 0) {
      const temp = settings.colorTemperature / 100; 
      const alpha = Math.abs(temp) * 0.2; 
      if (temp > 0) { 
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; 
      } else { 
        ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`; 
      }
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillRect(...rectArgs);
      ctx.globalCompositeOperation = 'source-over'; 
    }

    // Apply Tint
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturation: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
        const rgbColor = hexToRgb(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgb(rgbColor, saturation);
          const finalColorHex = rgbToHex(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          
          ctx.globalCompositeOperation = blendMode;
          ctx.fillStyle = finalColorHex;
          ctx.globalAlpha = intensity * TINT_EFFECT_SCALING_FACTOR; 
          ctx.fillRect(...rectArgs);
        }
      }
    };
    
    // Corrected tint application based on user feedback (swapped dodge and burn)
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
        
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over'; 
    
    // Apply Vignette
    if (settings.vignetteIntensity > 0) {
      const centerX = 0; 
      const centerY = 0;
      // Vignette radius should be based on the content dimensions before preview scaling
      const radiusX = contentWidth / 2;
      const radiusY = contentHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);

      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...rectArgs);
    }

    // Apply Grain
    if (settings.grainIntensity > 0 && noisePatternRef.current) {
        ctx.save(); 
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = settings.grainIntensity * 0.5; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...rectArgs);
        ctx.restore(); 
    }

    ctx.restore(); // Restore to the clean state saved at the beginning
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]); // Added noisePatternRef

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
      // Canvas width and height are set dynamically in drawImageImmediately
    />
  );
}
