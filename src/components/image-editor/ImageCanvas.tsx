
"use client";

import React, { useEffect, useCallback, useMemo, useRef } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 250; 
const SHADOW_HIGHLIGHT_ALPHA_FACTOR = 0.075; 
const TINT_EFFECT_SCALING_FACTOR = 0.6; 


export function ImageCanvas() {
  const context = useImageEditor();
  const {
    originalImage,
    settings,
    canvasRef,
    isPreviewing,
    noiseImageDataRef, // Changed from noiseSourceCanvasRef to noiseImageDataRef
    applyCssFilters,
  } = context;

  useEffect(() => {
    // This effect creates the noise ImageData once and stores it in the context's ref.
    if (typeof window !== 'undefined' && !noiseImageDataRef.current) {
      try {
        // Attempt to create ImageData directly (preferred)
        const imageData = new ImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const rand = Math.floor(Math.random() * 256);
          data[i] = rand;
          data[i + 1] = rand;
          data[i + 2] = rand;
          data[i + 3] = 255; // Alpha
        }
        noiseImageDataRef.current = imageData;
        console.log(`SUCCESS: Noise ImageData (${NOISE_CANVAS_SIZE}x${NOISE_CANVAS_SIZE}) created and stored in context ref.`);
      } catch (e) {
        // Fallback for environments where ImageData constructor might fail (e.g., older browsers, some test runners)
        console.warn("ImageData constructor failed, trying with temporary canvas for noise.", e);
        const tempCanvasForNoise = document.createElement('canvas');
        tempCanvasForNoise.width = NOISE_CANVAS_SIZE;
        tempCanvasForNoise.height = NOISE_CANVAS_SIZE;
        const noiseCtx = tempCanvasForNoise.getContext('2d', { willReadFrequently: true });
        if (noiseCtx) {
          const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const rand = Math.floor(Math.random() * 256);
            data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255;
          }
          // Put the generated data onto the temp canvas, then get it back as ImageData
          // This step might seem redundant but ensures the ImageData object is properly formed
          // if the direct constructor failed or behaved unexpectedly.
          noiseCtx.putImageData(imageData,0,0);
          noiseImageDataRef.current = noiseCtx.getImageData(0,0,NOISE_CANVAS_SIZE,NOISE_CANVAS_SIZE);
          console.log(`SUCCESS (fallback): Noise ImageData (${NOISE_CANVAS_SIZE}x${NOISE_CANVAS_SIZE}) created via temp canvas and stored.`);
        } else {
            console.error("FAILURE: Could not get 2D context for noise ImageData generation via fallback.");
        }
      }
    }
  }, [noiseImageDataRef]); // Depends only on the ref object itself


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
      vignetteIntensity, grainIntensity
    } = settings;

    // Calculate the source region from the original image based on crop settings
    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;
    const maxPanX = Math.max(0, originalImage.naturalWidth - sWidth); // Ensure maxPan is not negative
    const maxPanY = Math.max(0, originalImage.naturalHeight - sHeight);
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    // Ensure source dimensions are valid
    sWidth = Math.max(1, Math.round(sWidth));
    sHeight = Math.max(1, Math.round(sHeight));
    sx = Math.max(0, Math.min(Math.round(sx), originalImage.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(Math.round(sy), originalImage.naturalHeight - sHeight));

    if (![sx, sy, sWidth, sHeight].every(val => Number.isFinite(val) && val >= 0) || sWidth === 0 || sHeight === 0) {
      console.error("Invalid source dimensions for drawImage:", { sx, sy, sWidth, sHeight });
      return;
    }
    
    // Determine physical dimensions of the canvas buffer based on the cropped content
    // and 90/270 degree rotations. Flips (scaleX/Y) don't change physical buffer dimensions.
    let canvasPhysicalWidth, canvasPhysicalHeight;
    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = sHeight;
      canvasPhysicalHeight = sWidth;
    } else {
      canvasPhysicalWidth = sWidth;
      canvasPhysicalHeight = sHeight;
    }
    
    // Limit the maximum size of the canvas buffer for performance
    const MAX_WIDTH_STANDARD_RATIO = 800;
    const MAX_WIDTH_WIDE_RATIO = 960;
    const MAX_PHYSICAL_HEIGHT_CAP = 1000; 
    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1;
    let targetMaxWidthForCanvas = (currentAspectRatio > 1.6) ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : Math.round(targetMaxWidthForCanvas / currentAspectRatio);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : Math.round(MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    // Set canvas buffer size (these are the "high-res" preview dimensions)
    canvas.width = Math.round(canvasPhysicalWidth);
    canvas.height = Math.round(canvasPhysicalHeight);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); // Save the clean state
    
    // Apply preview scaling internally if isPreviewing
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }

    // Calculate effective canvas dimensions for drawing operations
    // These are the dimensions of the space we're drawing into, after internal scaling
    const effectiveCanvasWidth = Math.round(canvas.width / (isPreviewing ? PREVIEW_SCALE_FACTOR : 1));
    const effectiveCanvasHeight = Math.round(canvas.height / (isPreviewing ? PREVIEW_SCALE_FACTOR : 1));
    
    // Translate to the center of the (potentially scaled) drawing space
    ctx.translate(Math.round(effectiveCanvasWidth / 2), Math.round(effectiveCanvasHeight / 2));
    
    // Apply 90-degree rotations
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    // Apply flips
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    
    // Determine the destination drawing dimensions for the image content itself
    // This should match the canvas buffer's orientation if rotated by 90/270
    const destDrawWidthForImage = Math.round(
      (rotation === 90 || rotation === 270) ? effectiveCanvasHeight : effectiveCanvasWidth
    );
    const destDrawHeightForImage = Math.round(
      (rotation === 90 || rotation === 270) ? effectiveCanvasWidth : effectiveCanvasHeight
    );
    
    // --- Apply CSS Filters ---
    ctx.filter = 'none'; 
    if (applyCssFilters) applyCssFilters(ctx, settings); 
    
    // Draw the source image (sX, sY, sWidth, sHeight) into the transformed context
    // The destination is centered at (-w/2, -h/2) and fills destDrawWidth/HeightForImage
    ctx.drawImage(
      originalImage,
      sx, sy, sWidth, sHeight,
      Math.round(-destDrawWidthForImage / 2), Math.round(-destDrawHeightForImage / 2), 
      destDrawWidthForImage, destDrawHeightForImage
    );

    // Reset CSS filter before applying manual canvas effects
    ctx.filter = 'none'; 

    // Define the rectangle for applying subsequent overlay effects.
    // This rectangle should cover the area where the image was just drawn.
    const effectRectArgs: [number, number, number, number] = [ 
      Math.round(-destDrawWidthForImage / 2), 
      Math.round(-destDrawHeightForImage / 2), 
      destDrawWidthForImage, 
      destDrawHeightForImage 
    ];
    
    // Helper for blend effects
    const applyBlendEffect = (
        ctxForBlend: CanvasRenderingContext2D,
        rectArgs: [number, number, number, number],
        color: string,
        alpha: number,
        compositeOperation: GlobalCompositeOperation
      ) => {
      if (alpha > 0.001) { 
        ctxForBlend.globalCompositeOperation = compositeOperation;
        ctxForBlend.fillStyle = color;
        ctxForBlend.globalAlpha = alpha;
        ctxForBlend.fillRect(...rectArgs);
        ctxForBlend.globalAlpha = 1.0; 
        ctxForBlend.globalCompositeOperation = 'source-over'; 
      }
    };
    
    // Apply Shadows & Highlights (direct canvas operations)
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
    
    // Apply Color Temperature (direct canvas operation)
    if (Math.abs(colorTemperature) > 0.001) {
      const temp = colorTemperature / 100; 
      const alpha = Math.abs(temp) * 0.1; 
      const color = temp > 0 ? `rgba(255, 185, 70, ${alpha})` : `rgba(100, 150, 255, ${alpha})`; 
      applyBlendEffect(ctx, effectRectArgs, color, 1, 'overlay'); 
    }

    // Apply Tint (direct canvas operations)
    const applyTintWithSaturation = (baseColorHex: string, intensity: number, saturationFactor: number, blendMode: GlobalCompositeOperation) => {
      if (intensity > 0.001 && baseColorHex && baseColorHex !== '') {
        const rgbColor = hexToRgb(baseColorHex);
        if (rgbColor) {
          const saturatedRgb = desaturateRgb(rgbColor, saturationFactor);
          const finalColorHex = rgbToHex(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
          applyBlendEffect(ctx, effectRectArgs, finalColorHex, intensity * TINT_EFFECT_SCALING_FACTOR, blendMode);
        }
      }
    };
    applyTintWithSaturation(settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation, 'color-dodge'); 
    applyTintWithSaturation(settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation, 'color-burn');
    
    // Apply Vignette (direct canvas operation)
    if (vignetteIntensity > 0.001) {
      const centerX = 0; // Center of the transformed context
      const centerY = 0;
      const radiusX = destDrawWidthForImage / 2;
      const radiusY = destDrawHeightForImage / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 0.7})`); 
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    // Apply Grain (direct canvas operation)
    const currentNoiseImageData = noiseImageDataRef.current; // Get the ImageData from context
    if (grainIntensity > 0.001 && currentNoiseImageData) {
        // Create a temporary canvas to put the noise ImageData
        const tempNoiseCanvas = document.createElement('canvas');
        tempNoiseCanvas.width = currentNoiseImageData.width > 0 ? currentNoiseImageData.width : NOISE_CANVAS_SIZE;
        tempNoiseCanvas.height = currentNoiseImageData.height > 0 ? currentNoiseImageData.height : NOISE_CANVAS_SIZE;
        
        const tempNoiseCtx = tempNoiseCanvas.getContext('2d');
        if (tempNoiseCtx) {
            tempNoiseCtx.putImageData(currentNoiseImageData, 0, 0);
            const liveNoisePattern = ctx.createPattern(tempNoiseCanvas, 'repeat'); 
            if (liveNoisePattern) {
                // ctx.save() and ctx.restore() for grain are not strictly needed here
                // if we reset globalAlpha and globalCompositeOperation after,
                // but it's good practice if more complex state changes were involved.
                ctx.fillStyle = liveNoisePattern;
                ctx.globalAlpha = grainIntensity * (isPreviewing ? 0.1 : 0.7); // Adjusted preview intensity
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillRect(...effectRectArgs);
                ctx.globalAlpha = 1.0; // Reset globalAlpha
                ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
            } else {
                console.warn("Could not create grain pattern for live preview from tempNoiseCanvas:", tempNoiseCanvas);
            }
        } else {
            console.warn("Could not get context for temporary noise canvas for preview.");
        }
    } else if (grainIntensity > 0.001 && !currentNoiseImageData) {
       console.warn("Grain effect active, but noiseImageDataRef.current is null or undefined for live preview.");
    }

    ctx.restore(); // Restore to the clean state saved at the beginning
  }, [originalImage, settings, canvasRef, isPreviewing, noiseImageDataRef, applyCssFilters]);

  const debouncedDrawImage = useMemo(
    () => {
      const DEBOUNCE_TIME_PREVIEW = 30;
      const DEBOUNCE_TIME_FINAL = 150;
      
      let timeoutId: NodeJS.Timeout | null = null;
      
      const debouncedFunction = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          drawImageImmediately();
        }, isPreviewing ? DEBOUNCE_TIME_PREVIEW : DEBOUNCE_TIME_FINAL);
      };
      
      return debouncedFunction;
    },
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
  // Key dependencies for re-rendering the canvas
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
      // imageRendering 'auto' for final, 'pixelated' (or 'crisp-edges') for fast preview
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }}
    />
  );
}
    
    

    

    

