
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';


const applyCssFilters = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';

  // Ensure all setting values are numbers and have defaults
  const brightnessSetting = typeof settings.brightness === 'number' ? settings.brightness : 1;
  const contrastSetting = typeof settings.contrast === 'number' ? settings.contrast : 1;
  const saturationVal = typeof settings.saturation === 'number' ? settings.saturation : 1;
  const exposureVal = typeof settings.exposure === 'number' ? settings.exposure : 0;
  const blacksVal = typeof settings.blacks === 'number' ? settings.blacks : 0;
  const hueRotateVal = typeof settings.hueRotate === 'number' ? settings.hueRotate : 0;

  let finalBrightness = brightnessSetting;
  let finalContrast = contrastSetting;

  // Adjust brightness and contrast based on 'blacks'
  if (blacksVal !== 0) {
    finalContrast *= (1 - blacksVal * 0.5); 
    finalBrightness *= (1 + blacksVal * 0.2); 
  }

  // Adjust brightness based on 'exposure'
  finalBrightness *= (1 + exposureVal);


  // Clamp final brightness and contrast to avoid extreme values
  finalBrightness = Math.max(0.1, Math.min(3, finalBrightness)); // Ensure brightness doesn't go to 0
  finalContrast = Math.max(0.1, Math.min(3, finalContrast));   


  if (finalBrightness !== 1) filterString += `brightness(${finalBrightness * 100}%) `;
  if (finalContrast !== 1) filterString += `contrast(${finalContrast * 100}%) `;
  if (saturationVal !== 1) filterString += `saturate(${saturationVal * 100}%) `;
  if (hueRotateVal !== 0) filterString += `hue-rotate(${hueRotateVal}deg) `;


  if (settings.filter) {
    if (settings.filter === 'grayscale') filterString += `grayscale(100%) `;
    if (settings.filter === 'sepia') filterString += `sepia(100%) `;
    if (settings.filter === 'invert') filterString += `invert(100%) `;
  }

  const trimmedFilterString = filterString.trim();
  
  if (typeof navigator !== 'undefined') {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      console.log('[Safari Debug] CSS Filter String:', trimmedFilterString);
    }
  }
  
  ctx.filter = 'none'; // Explicitly reset before applying new filter
  if (trimmedFilterString) { 
    ctx.filter = trimmedFilterString;
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

    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;

    const maxPanX = originalImage.naturalWidth - sWidth;
    const maxPanY = originalImage.naturalHeight - sHeight;

    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;
    
    sWidth = Math.max(1, sWidth);
    sHeight = Math.max(1, sHeight);
    sx = Math.max(0, Math.min(sx, originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(sy, originalImage.naturalHeight - sHeight));

    if (![sx, sy, sWidth, sHeight].every(val => Number.isFinite(val) && val >= 0) || sWidth === 0 || sHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, sWidth, sHeight });
      return;
    }
    
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
    
    const finalDestWidth = canvas.width / Math.abs(scaleX);
    const finalDestHeight = canvas.height / Math.abs(scaleY);

    ctx.save();
    
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    applyCssFilters(ctx, settings);

    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight,            
      -finalDestWidth / 2, 
      -finalDestHeight / 2,
      finalDestWidth,        
      finalDestHeight
    );

    ctx.filter = 'none'; 
    
    const rectArgs: [number, number, number, number] = [
      -finalDestWidth / 2, 
      -finalDestHeight / 2, 
      finalDestWidth, 
      finalDestHeight
    ];

    // Shadows (Canvas specific)
    if (settings.shadows > 0) { 
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.shadows * 0.175 * 0.5; 
      ctx.fillStyle = 'rgb(128, 128, 128)';
      ctx.fillRect(...rectArgs);
    } else if (settings.shadows < 0) { 
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.shadows) * 0.1 * 0.5; 
      ctx.fillStyle = 'rgb(50, 50, 50)';
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Highlights (Canvas specific)
    if (settings.highlights < 0) { 
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.highlights) * 0.175 * 0.5; 
      ctx.fillStyle = 'rgb(128, 128, 128)';
      ctx.fillRect(...rectArgs);
    } else if (settings.highlights > 0) { 
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.highlights * 0.1 * 0.5; 
      ctx.fillStyle = 'rgb(200, 200, 200)';
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

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
    
    // Order: Shadows first, then Highlights
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge'); // Shadows tint uses color-dodge
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn'); // Highlights tint uses color-burn
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

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
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]); // noisePatternRef added

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
                ctx.filter = 'none'; // Ensure filter is reset when clearing
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

    