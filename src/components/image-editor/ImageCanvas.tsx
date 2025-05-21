
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils'; // Assuming you move these here or to utils


const applyCssFilters = (
  ctx: CanvasRenderingContext2D,
  settings: ImageSettings
) => {
  let filterString = '';
  let baseBrightness = settings.brightness;
  let baseContrast = settings.contrast;

  // Apply Blacks effect by modifying base brightness and contrast
  if (settings.blacks !== 0) {
    // Lifting blacks (positive value) reduces contrast and slightly brightens
    // Crushing blacks (negative value) increases contrast and slightly darkens
    // The exact factors might need tuning for desired visual effect
    baseContrast *= (1 - settings.blacks * 0.5); // e.g., blacks = 0.2 -> contrast * 0.9; blacks = -0.2 -> contrast * 1.1
    baseBrightness *= (1 + settings.blacks * 0.2); // e.g., blacks = 0.2 -> brightness * 1.04; blacks = -0.2 -> brightness * 0.96
    
    // Clamp values to avoid extreme or inverted effects
    baseContrast = Math.max(0.1, Math.min(3, baseContrast)); // Keep contrast within a reasonable range
    baseBrightness = Math.max(0.1, Math.min(3, baseBrightness)); // Keep brightness within a reasonable range
  }


  if (baseBrightness !== 1) filterString += `brightness(${baseBrightness * 100}%) `;
  if (baseContrast !== 1) filterString += `contrast(${baseContrast * 100}%) `;
  if (settings.saturation !== 1) filterString += `saturate(${settings.saturation * 100}%) `;
  
  // Exposure is additive to brightness in terms of effect
  if (settings.exposure !== 0) {
    // A simple way to model exposure is another brightness filter.
    // Positive exposure brightens, negative darkens.
    const exposureEffect = 1 + settings.exposure * 0.5; // Adjust multiplier as needed
    filterString += `brightness(${exposureEffect * 100}%) `;
  }

  if (settings.hueRotate !== 0) filterString += `hue-rotate(${settings.hueRotate}deg) `;

  // Apply preset filters if any
  if (settings.filter) {
    if (settings.filter === 'grayscale') filterString += `grayscale(100%) `;
    if (settings.filter === 'sepia') filterString += `sepia(100%) `;
    if (settings.filter === 'invert') filterString += `invert(100%) `;
    // Add more preset filter translations here
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
const TINT_EFFECT_SCALING_FACTOR = 0.3 * 0.6; 

export function ImageCanvas() { 
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const noiseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);

  // Function to draw image with all settings
  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (noiseCanvasRef.current && (!noisePatternRef.current || ctx.createPattern(noiseCanvasRef.current, 'repeat') === null)) {
        noisePatternRef.current = ctx.createPattern(noiseCanvasRef.current, 'repeat');
    }
    

    const { rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY } = settings;
    const radAngle = 0; // Angle removed, kept for potential future re-add, not used now

    // Calculate source dimensions based on zoom, maintaining aspect ratio
    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;

    // Calculate panning offsets
    const maxPanX = originalImage.naturalWidth - sWidth;
    const maxPanY = originalImage.naturalHeight - sHeight;
    
    // Convert normalized offset (-1 to 1) to pixel offset
    // 0.5 * (offset + 1) maps -1..1 to 0..1 range
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    // Clamp sx and sy to ensure the source rectangle is within image bounds
    sx = Math.max(0, Math.min(sx, originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(sy, originalImage.naturalHeight - sHeight));
    sWidth = Math.max(1, sWidth); // Ensure width is at least 1px
    sHeight = Math.max(1, sHeight); // Ensure height is at least 1px
    
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
    // This now includes the 'blacks' adjustment via baseBrightness/baseContrast
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
      ctx.globalAlpha = settings.shadows * 0.175 * 0.5; // Adjusted factor
      ctx.fillStyle = 'rgb(128, 128, 128)'; // Use a mid-gray for screen to lighten
      ctx.fillRect(...rectArgs);
    } else if (settings.shadows < 0) { // Darken shadows
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.shadows) * 0.1 * 0.5; // Adjusted factor
      ctx.fillStyle = 'rgb(50, 50, 50)'; // Use a dark gray for multiply to darken
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation

    // Apply Highlights (Canvas specific)
    if (settings.highlights < 0) { // Darken highlights (recover)
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = Math.abs(settings.highlights) * 0.175 * 0.5; // Adjusted factor
      ctx.fillStyle = 'rgb(128, 128, 128)'; // Use a mid-gray for multiply to darken
      ctx.fillRect(...rectArgs);
    } else if (settings.highlights > 0) { // Brighten highlights (less common, but for symmetry)
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = settings.highlights * 0.1 * 0.5; // Adjusted factor
      ctx.fillStyle = 'rgb(200, 200, 200)'; // Use a light gray for screen to brighten
      ctx.fillRect(...rectArgs);
    }
    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation


    // Apply Color Temperature
    if (settings.colorTemperature !== 0) {
      const temp = settings.colorTemperature / 100; // Normalize to -1 to 1 range
      const alpha = Math.abs(temp) * 0.2; // Max 20% opacity for temperature effect
      if (temp > 0) { // Warmer
        ctx.fillStyle = `rgba(255, 165, 0, ${alpha})`; // Orange
      } else { // Cooler
        ctx.fillStyle = `rgba(0, 0, 255, ${alpha})`; // Blue
      }
      ctx.globalCompositeOperation = 'overlay'; // Or 'soft-light' for a subtler effect
      ctx.fillRect(...rectArgs);
      ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
    }

    // Apply Tint (Shadows and Highlights)
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturation: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
        const rgbColor = hexToRgb(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgb(rgbColor, saturation);
          const finalColorHex = rgbToHex(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          
          ctx.globalCompositeOperation = blendMode;
          ctx.fillStyle = finalColorHex;
          ctx.globalAlpha = intensity * TINT_EFFECT_SCALING_FACTOR; // Max 50% intensity * scaling factor
          ctx.fillRect(...rectArgs);
        }
      }
    };
    
    // Swapped blend modes based on user feedback for "Shadows Tint" and "Highlights Tint"
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge');
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
        
    ctx.globalAlpha = 1.0; // Reset alpha
    ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
    
    // Apply Vignette
    if (settings.vignetteIntensity > 0) {
      const centerX = 0; // Since we translated to canvas center
      const centerY = 0;
      // Vignette radius should be based on the content dimensions before preview scaling
      const radiusX = contentWidth / 2;
      const radiusY = contentHeight / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);

      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95); // Adjust inner/outer radius for desired effect
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity})`); // Black vignette
      ctx.fillStyle = gradient;
      ctx.fillRect(...rectArgs);
    }

    // Apply Grain
    if (settings.grainIntensity > 0 && noisePatternRef.current) {
        ctx.save(); // Save context before applying grain
        // Translate and scale the pattern if necessary, or apply it directly
        ctx.fillStyle = noisePatternRef.current;
        ctx.globalAlpha = settings.grainIntensity * 0.5; // Adjust opacity for grain effect
        ctx.globalCompositeOperation = 'overlay'; // 'overlay' or 'soft-light' can work well for grain
        // Fill the entire canvas. Since origin is at center of canvas, rect needs to cover it.
        ctx.fillRect(...rectArgs);
        ctx.restore(); // Restore context after applying grain
    }

    ctx.restore(); // Restore to the clean state saved at the beginning
  }, [originalImage, settings, canvasRef, isPreviewing, noisePatternRef]); // Added noisePatternRef

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

            // Create pattern immediately if canvas is already available
            const mainCanvas = canvasRef.current;
            if (mainCanvas) {
                const mainCtx = mainCanvas.getContext('2d');
                if (mainCtx && noiseCanvasRef.current) { // Ensure noiseCanvasRef.current is not null
                    noisePatternRef.current = mainCtx.createPattern(noiseCanvasRef.current, 'repeat');
                }
            }
        }
    }
  }, [canvasRef]); // Re-run if canvasRef changes


  const debouncedDrawImage = useMemo(
    () => debounce(drawImageImmediately, isPreviewing ? 30 : 200),
    [drawImageImmediately, isPreviewing] // drawImageImmediately will change if settings/originalImage changes
  );

  useEffect(() => {
    if (originalImage) {
      debouncedDrawImage();
    } else { 
        // Clear canvas if no image
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImage, settings, isPreviewing, drawImageImmediately]); // Added drawImageImmediately


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

