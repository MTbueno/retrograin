
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

  // Initialize base values, ensuring they are numbers
  const baseBrightness = typeof settings.brightness === 'number' ? settings.brightness : 1;
  const baseContrast = typeof settings.contrast === 'number' ? settings.contrast : 1;
  const saturationVal = typeof settings.saturation === 'number' ? settings.saturation : 1;
  const exposureVal = typeof settings.exposure === 'number' ? settings.exposure : 0;
  const blacksVal = typeof settings.blacks === 'number' ? settings.blacks : 0;
  const hueRotateVal = typeof settings.hueRotate === 'number' ? settings.hueRotate : 0;

  let finalBrightness = baseBrightness;
  let finalContrast = baseContrast;

  // Apply Blacks effect by modifying brightness and contrast
  if (blacksVal !== 0) {
    finalContrast *= (1 - blacksVal * 0.5); // More negative blacks = more contrast
    finalBrightness *= (1 + blacksVal * 0.2); // More positive blacks = brighter overall
  }

  // Apply Exposure effect to finalBrightness
  if (exposureVal !== 0) {
    const exposureEffect = 1 + exposureVal * 0.5; // exposureVal is -0.5 to 0.5 -> effect 0.75 to 1.25
    finalBrightness *= exposureEffect;
  }

  // Clamp final values to avoid extreme or inverted effects
  finalBrightness = Math.max(0.1, Math.min(3, finalBrightness));
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
  ctx.filter = filterString.trim();
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
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6; // Combined previous factors

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
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

    const finalDrawWidth = contentWidth; // This is the size of the content before currentScaleFactor
    const finalDrawHeight = contentHeight;

    applyCssFilters(ctx, settings);

    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight,
      -finalDrawWidth / 2, -finalDrawHeight / 2,
      finalDrawWidth, finalDrawHeight
    );

    ctx.filter = 'none'; 
    const rectArgs: [number, number, number, number] = [-finalDrawWidth / 2, -finalDrawHeight / 2, finalDrawWidth, finalDrawHeight];

    // Shadows (Canvas specific)
    if (settings.shadows > 0) { // Brighten shadows
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.shadows * 0.175 * 0.5; // Reduced effect
      ctx.fillStyle = 'rgb(128, 128, 128)';
      ctx.fillRect(...rectArgs);
    } else if (settings.shadows < 0) { // Darken shadows
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.shadows) * 0.1 * 0.5; // Reduced effect
      ctx.fillStyle = 'rgb(50, 50, 50)';
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    // Highlights (Canvas specific)
    if (settings.highlights < 0) { // Darken highlights
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.highlights) * 0.175 * 0.5; // Reduced effect
      ctx.fillStyle = 'rgb(128, 128, 128)';
      ctx.fillRect(...rectArgs);
    } else if (settings.highlights > 0) { // Brighten highlights
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.highlights * 0.1 * 0.5; // Reduced effect
      ctx.fillStyle = 'rgb(200, 200, 200)';
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    if (settings.colorTemperature !== 0) {
      const temp = settings.colorTemperature / 100;
      const alpha = Math.abs(temp) * 0.2;
      if (temp > 0) {
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // Warmer
      } else {
        ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`; // Cooler
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
          ctx.globalAlpha = intensity * TINT_EFFECT_SCALING_FACTOR; // Use scaled intensity
          ctx.fillRect(...rectArgs);
        }
      }
    };

    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
    
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';

    if (settings.vignetteIntensity > 0) {
      const centerX = 0;
      const centerY = 0;
      const radiusX = finalDrawWidth / 2;
      const radiusY = finalDrawHeight / 2;
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
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]);

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
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    />
  );
}
