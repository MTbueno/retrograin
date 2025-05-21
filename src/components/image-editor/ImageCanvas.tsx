
"use client";

import React, { useEffect, useCallback, useMemo } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

const PREVIEW_SCALE_FACTOR = 0.5;
const NOISE_CANVAS_SIZE = 250; // Aumentado para reduzir tiling
const SHADOW_HIGHLIGHT_ALPHA_FACTOR = 0.075;
const TINT_EFFECT_SCALING_FACTOR = 0.6;

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
    noiseImageDataRef, // Agora espera ImageData
    applyCssFilters,
  } = useImageEditor();

  useEffect(() => {
    // Cria o ImageData do ruído uma vez e armazena no contexto
    if (typeof window !== 'undefined' && canvasRef.current && !noiseImageDataRef.current) {
      const noiseCv = document.createElement('canvas');
      noiseCv.width = NOISE_CANVAS_SIZE;
      noiseCv.height = NOISE_CANVAS_SIZE;
      const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });
      if (noiseCtx) {
        const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const rand = Math.floor(Math.random() * 256);
          data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255;
        }
        noiseCtx.putImageData(imageData, 0, 0);
        noiseImageDataRef.current = noiseCtx.getImageData(0, 0, NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
        console.log("Noise ImageData (", NOISE_CANVAS_SIZE, "x", NOISE_CANVAS_SIZE, ") created and stored in context ref.");
      } else {
        console.warn("Could not get 2D context for noise canvas generation.");
      }
    }
  }, [canvasRef, noiseImageDataRef]);


  const drawImageImmediately = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !originalImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const {
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity
    } = settings;

    let contentWidth = originalImage.naturalWidth / cropZoom;
    let contentHeight = originalImage.naturalHeight / cropZoom;
    
    let sx = (cropOffsetX * 0.5 + 0.5) * (originalImage.naturalWidth - contentWidth);
    let sy = (cropOffsetY * 0.5 + 0.5) * (originalImage.naturalHeight - contentHeight);

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
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : Math.round(targetMaxWidthForCanvas / currentAspectRatio);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : Math.round(MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    // Definir as dimensões do buffer do canvas. Estas NÃO mudam com isPreviewing.
    canvas.width = Math.round(canvasPhysicalWidth);
    canvas.height = Math.round(canvasPhysicalHeight);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Aplicar escala de PREVIEW INTERNAMENTE no contexto, se necessário
    if (isPreviewing) {
      ctx.scale(PREVIEW_SCALE_FACTOR, PREVIEW_SCALE_FACTOR);
    }
    
    // Calcular o centro e as dimensões de desenho EFETIVAS após a escala de preview.
    // O "espaço de desenho" é o tamanho do buffer do canvas (canvas.width/height)
    // dividido pelo fator de escala do preview, se aplicável.
    const effectiveDrawAreaWidth = canvas.width / (isPreviewing ? PREVIEW_SCALE_FACTOR : 1);
    const effectiveDrawAreaHeight = canvas.height / (isPreviewing ? PREVIEW_SCALE_FACTOR : 1);
    const effectiveCenterX = effectiveDrawAreaWidth / 2;
    const effectiveCenterY = effectiveDrawAreaHeight / 2;

    ctx.translate(Math.round(effectiveCenterX), Math.round(effectiveCenterY));
    
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    
    // Dimensões de desenho da imagem para preencher a área efetiva.
    const destDrawWidthForEffects = Math.round(
      (rotation === 90 || rotation === 270) ? effectiveDrawAreaHeight : effectiveDrawAreaWidth
    );
    const destDrawHeightForEffects = Math.round(
      (rotation === 90 || rotation === 270) ? effectiveDrawAreaWidth : effectiveDrawAreaHeight
    );
    
    ctx.filter = 'none'; 
    applyCssFilters(ctx, settings); 
    
    ctx.drawImage(
      originalImage,
      sx, sy, contentWidth, contentHeight,
      Math.round(-destDrawWidthForEffects / 2), Math.round(-destDrawHeightForEffects / 2), 
      destDrawWidthForEffects, destDrawHeightForEffects
    );

    ctx.filter = 'none'; 

    const effectRectArgs: [number, number, number, number] = [ 
      Math.round(-destDrawWidthForEffects / 2), 
      Math.round(-destDrawHeightForEffects / 2), 
      destDrawWidthForEffects, 
      destDrawHeightForEffects 
    ];
    
    const { highlights, shadows } = settings;
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
    
    if (vignetteIntensity > 0.001) {
      const centerX = 0; 
      const centerY = 0;
      const radiusX = destDrawWidthForEffects / 2;
      const radiusY = destDrawHeightForEffects / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 0.7})`); 
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    const currentNoiseImageData = noiseImageDataRef.current;
    if (grainIntensity > 0.001 && currentNoiseImageData) {
        const tempNoiseCanvas = document.createElement('canvas');
        // O canvas temporário para o padrão sempre usa as dimensões do ImageData
        tempNoiseCanvas.width = currentNoiseImageData.width; 
        tempNoiseCanvas.height = currentNoiseImageData.height;
        const tempNoiseCtx = tempNoiseCanvas.getContext('2d');

        if (tempNoiseCtx) {
            tempNoiseCtx.putImageData(currentNoiseImageData, 0, 0);
            // O createPattern usa o contexto do canvas principal (ctx),
            // que já está escalado se isPreviewing for true.
            // Isso fará com que o padrão pareça mais fino no preview.
            const liveNoisePattern = ctx.createPattern(tempNoiseCanvas, 'repeat'); 
            if (liveNoisePattern) {
                ctx.save();
                ctx.fillStyle = liveNoisePattern;
                ctx.globalAlpha = grainIntensity * (isPreviewing ? 0.2 : 1.0); 
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillRect(...effectRectArgs);
                ctx.restore(); 
            } else {
                console.warn("Could not create grain pattern for live preview.");
            }
        } else {
            console.warn("Could not get context for temporary noise canvas for preview.");
        }
    } else if (grainIntensity > 0.001 && !currentNoiseImageData) {
      console.warn("Grain effect active, but noiseImageDataRef.current is null or undefined for live preview.");
    }

    ctx.restore(); // Restaura o save() do início que pode ter a escala de preview
  }, [originalImage, settings, canvasRef, isPreviewing, noiseImageDataRef, applyCssFilters]);

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
    
    