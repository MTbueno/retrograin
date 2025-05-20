
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
  let baseBrightness = settings.brightness;
  let baseContrast = settings.contrast;

  // Apply Blacks adjustment by modulating brightness and contrast
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

// Helper functions for color manipulation (used for Tint Saturation)
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
  const gray = rgb.r * 0.3086 + rgb.g * 0.6094 + rgb.b * 0.0820; // BT.709 luminance
  return {
    r: Math.round(rgb.r * saturation + gray * (1 - saturation)),
    g: Math.round(rgb.g * saturation + gray * (1 - saturation)),
    b: Math.round(rgb.b * saturation + gray * (1 - saturation)),
  };
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
const NOISE_CANVAS_SIZE = 100; 
const TINT_EFFECT_SCALING_FACTOR = 0.3; // Reduced from 0.6 for more subtlety

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

    applyCssFilters(ctx, settings);
    
    ctx.drawImage(
      originalImage, sx, sy, sWidth, sHeight,
      -contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight
    );

    // Draw visual crop rectangle if crop is active
    if (settings.crop) { 
        const currentFilter = ctx.filter;
        ctx.filter = 'none'; // Ensure border is not affected by image filters

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.lineWidth = 2 / (isPreviewing ? PREVIEW_SCALE_FACTOR : 1) ; 
        ctx.strokeRect(
            -contentWidth / 2,
            -contentHeight / 2,
            contentWidth,
            contentHeight
        );
        ctx.filter = currentFilter; // Restore filter
    }


    ctx.filter = 'none';
    const rectArgs: [number, number, number, number] = [-contentWidth / 2, -contentHeight / 2, contentWidth, contentHeight];

    // Shadows adjustment (canvas based)
    if (settings.shadows > 0) { // Lighten shadows
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.shadows * 0.35 * 0.5; // Reduced factor
      ctx.fillStyle = 'rgb(128, 128, 128)'; 
      ctx.fillRect(...rectArgs);
    } else if (settings.shadows < 0) { // Darken shadows
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.shadows) * 0.2 * 0.5; // Reduced factor
      ctx.fillStyle = 'rgb(50, 50, 50)'; 
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over'; 

    // Highlights adjustment (canvas based)
    if (settings.highlights < 0) { // Darken highlights (recover)
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.highlights) * 0.35 * 0.5; // Reduced factor
      ctx.fillStyle = 'rgb(128, 128, 128)'; 
      ctx.fillRect(...rectArgs);
    } else if (settings.highlights > 0) { // Brighten highlights
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.highlights * 0.2 * 0.5; // Reduced factor
      ctx.fillStyle = 'rgb(200, 200, 200)'; 
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over';

    // Color Temperature
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

    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturation: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') { // Added check for empty/black hex
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
    
    // Apply Tints (Shadows and Highlights, Midtones removed)
    // Note: The "inversion" of color-dodge and color-burn is based on user feedback for desired effect.
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
        
    ctx.globalAlpha = 1.0; 
    ctx.globalCompositeOperation = 'source-over'; 
    
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
      ctx.fillRect(...rectArgs);
    }

    if (settings.grainIntensity > 0 && noisePatternRef.current) {
        ctx.save(); 
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = settings.grainIntensity * 0.5; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...rectArgs);
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
