
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

export interface ImageSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number; // Added vibrance
  exposure: number;
  highlights: number;
  shadows: number;
  blacks: number;
  hueRotate: number;
  vignetteIntensity: number;
  grainIntensity: number;
  colorTemperature: number;
  tintShadowsColor: string;
  tintShadowsIntensity: number;
  tintShadowsSaturation: number;
  tintHighlightsColor: string;
  tintHighlightsIntensity: number;
  tintHighlightsSaturation: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  cropZoom: number;
  cropOffsetX: number;
  cropOffsetY: number;
  filter: string | null;
}

export const initialImageSettings: ImageSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  vibrance: 0, // Initial vibrance
  exposure: 0,
  highlights: 0,
  shadows: 0,
  blacks: 0,
  hueRotate: 0,
  vignetteIntensity: 0,
  grainIntensity: 0,
  colorTemperature: 0,
  tintShadowsColor: '#808080',
  tintShadowsIntensity: 0,
  tintShadowsSaturation: 1,
  tintHighlightsColor: '#808080',
  tintHighlightsIntensity: 0,
  tintHighlightsSaturation: 1,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  cropZoom: 1,
  cropOffsetX: 0,
  cropOffsetY: 0,
  filter: null,
};

export interface ImageObject {
  id: string;
  imageElement: HTMLImageElement;
  baseFileName: string;
  settings: ImageSettings;
  thumbnailDataUrl: string;
}

export type SettingsAction =
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_CONTRAST'; payload: number }
  | { type: 'SET_SATURATION'; payload: number }
  | { type: 'SET_VIBRANCE'; payload: number } // Added vibrance action
  | { type: 'SET_EXPOSURE'; payload: number }
  | { type: 'SET_HIGHLIGHTS'; payload: number }
  | { type: 'SET_SHADOWS'; payload: number }
  | { type: 'SET_BLACKS'; payload: number }
  | { type: 'SET_HUE_ROTATE'; payload: number }
  | { type: 'SET_VIGNETTE_INTENSITY'; payload: number }
  | { type: 'SET_GRAIN_INTENSITY'; payload: number }
  | { type: 'SET_COLOR_TEMPERATURE'; payload: number }
  | { type: 'SET_TINT_SHADOWS_COLOR'; payload: string }
  | { type: 'SET_TINT_SHADOWS_INTENSITY'; payload: number }
  | { type: 'SET_TINT_SHADOWS_SATURATION'; payload: number }
  | { type: 'SET_TINT_HIGHLIGHTS_COLOR'; payload: string }
  | { type: 'SET_TINT_HIGHLIGHTS_INTENSITY'; payload: number }
  | { type: 'SET_TINT_HIGHLIGHTS_SATURATION'; payload: number }
  | { type: 'ROTATE_CW' }
  | { type: 'ROTATE_CCW' }
  | { type: 'FLIP_HORIZONTAL' }
  | { type: 'FLIP_VERTICAL' }
  | { type: 'SET_CROP_ZOOM'; payload: number }
  | { type: 'SET_CROP_OFFSET_X'; payload: number }
  | { type: 'SET_CROP_OFFSET_Y'; payload: number }
  | { type: 'RESET_CROP_AND_ANGLE' }
  | { type: 'APPLY_FILTER'; payload: string | null }
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: ImageSettings };

function settingsReducer(state: ImageSettings, action: SettingsAction): ImageSettings {
  switch (action.type) {
    case 'SET_BRIGHTNESS':
      return { ...state, brightness: action.payload };
    case 'SET_CONTRAST':
      return { ...state, contrast: action.payload };
    case 'SET_SATURATION':
      return { ...state, saturation: action.payload };
    case 'SET_VIBRANCE':
      return { ...state, vibrance: action.payload };
    case 'SET_EXPOSURE':
      return { ...state, exposure: action.payload };
    case 'SET_HIGHLIGHTS':
      return { ...state, highlights: action.payload };
    case 'SET_SHADOWS':
      return { ...state, shadows: action.payload };
    case 'SET_BLACKS':
      return { ...state, blacks: action.payload };
    case 'SET_HUE_ROTATE':
      return { ...state, hueRotate: action.payload };
    case 'SET_VIGNETTE_INTENSITY':
      return { ...state, vignetteIntensity: action.payload };
    case 'SET_GRAIN_INTENSITY':
      return { ...state, grainIntensity: action.payload };
    case 'SET_COLOR_TEMPERATURE':
      return { ...state, colorTemperature: action.payload };
    case 'SET_TINT_SHADOWS_COLOR':
      return { ...state, tintShadowsColor: action.payload };
    case 'SET_TINT_SHADOWS_INTENSITY':
      return { ...state, tintShadowsIntensity: action.payload };
    case 'SET_TINT_SHADOWS_SATURATION':
      return { ...state, tintShadowsSaturation: action.payload };
    case 'SET_TINT_HIGHLIGHTS_COLOR':
      return { ...state, tintHighlightsColor: action.payload };
    case 'SET_TINT_HIGHLIGHTS_INTENSITY':
      return { ...state, tintHighlightsIntensity: action.payload };
    case 'SET_TINT_HIGHLIGHTS_SATURATION':
      return { ...state, tintHighlightsSaturation: action.payload };
    case 'ROTATE_CW':
      return { ...state, rotation: (state.rotation + 90) % 360 };
    case 'ROTATE_CCW':
      return { ...state, rotation: (state.rotation - 90 + 360) % 360 };
    case 'FLIP_HORIZONTAL':
      return { ...state, scaleX: state.scaleX * -1 };
    case 'FLIP_VERTICAL':
      return { ...state, scaleY: state.scaleY * -1 };
    case 'SET_CROP_ZOOM':
      return { ...state, cropZoom: Math.max(1, action.payload) };
    case 'SET_CROP_OFFSET_X':
      return { ...state, cropOffsetX: Math.max(-1, Math.min(1, action.payload)) };
    case 'SET_CROP_OFFSET_Y':
      return { ...state, cropOffsetY: Math.max(-1, Math.min(1, action.payload)) };
    case 'RESET_CROP_AND_ANGLE':
      return { ...state, cropZoom: 1, cropOffsetX: 0, cropOffsetY: 0 };
    case 'APPLY_FILTER':
      return { ...state, filter: action.payload };
    case 'RESET_SETTINGS':
      return { ...initialImageSettings };
    case 'LOAD_SETTINGS':
      return { ...action.payload };
    default:
      return state;
  }
}

// Moved here for use in both context and ImageCanvas (though ImageCanvas will get it from context now)
const applyCssFiltersToContextInternal = (ctx: CanvasRenderingContext2D, settings: ImageSettings) => {
  ctx.filter = 'none'; 
  const filters: string[] = [];

  let finalBrightness = settings.brightness + settings.exposure;
  let finalContrastValue = settings.contrast; // Renamed to avoid conflict
  
  if (settings.blacks !== 0) {
    finalBrightness += settings.blacks * 0.05; 
    finalContrastValue *= (1 - Math.abs(settings.blacks) * 0.1);
  }
  finalContrastValue = Math.max(0, finalContrastValue);

  let calculatedSaturation = settings.saturation;
  if (settings.vibrance > 0) {
    calculatedSaturation = settings.saturation * (1 + settings.vibrance * 0.5);
    finalContrastValue = finalContrastValue * (1 + settings.vibrance * 0.2); 
  } else if (settings.vibrance < 0) {
    calculatedSaturation = settings.saturation * (1 + settings.vibrance * 0.8); 
  }
  calculatedSaturation = Math.max(0, Math.min(3, calculatedSaturation)); 
  finalContrastValue = Math.max(0, Math.min(3, finalContrastValue));


  if (Math.abs(finalBrightness - 1) > 0.001 || settings.exposure !==0 || settings.blacks !==0 ) filters.push(`brightness(${finalBrightness * 100}%)`);
  if (Math.abs(finalContrastValue - 1) > 0.001 || settings.blacks !==0 || settings.vibrance > 0) filters.push(`contrast(${finalContrastValue * 100}%)`);
  if (Math.abs(calculatedSaturation - 1) > 0.001 || settings.vibrance !== 0) filters.push(`saturate(${calculatedSaturation * 100}%)`);
  if (settings.hueRotate !== 0) filters.push(`hue-rotate(${settings.hueRotate}deg)`);
  if (settings.filter) filters.push(settings.filter);
  
  const trimmedFilterString = filters.join(' ').trim();
  if (trimmedFilterString) {
    ctx.filter = trimmedFilterString;
  }
};


const drawImageWithSettingsToContext = (
  ctx: CanvasRenderingContext2D,
  imageToDraw: HTMLImageElement,
  imageSettings: ImageSettings,
  targetCanvasWidth: number,
  targetCanvasHeight: number,
  noisePattern: CanvasPattern | null
) => {
    ctx.clearRect(0, 0, targetCanvasWidth, targetCanvasHeight);
    ctx.save();
    
    const {
      rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY,
      highlights, shadows,
      colorTemperature,
      tintShadowsColor, tintShadowsIntensity, tintShadowsSaturation,
      tintHighlightsColor, tintHighlightsIntensity, tintHighlightsSaturation,
      vignetteIntensity, grainIntensity
    } = imageSettings;
    
    let sWidth = imageToDraw.naturalWidth / cropZoom;
    let sHeight = imageToDraw.naturalHeight / cropZoom;
    const maxPanX = imageToDraw.naturalWidth - sWidth;
    const maxPanY = imageToDraw.naturalHeight - sHeight;
    let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
    let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;

    sWidth = Math.max(1, Math.round(sWidth));
    sHeight = Math.max(1, Math.round(sHeight));
    sx = Math.max(0, Math.min(Math.round(sx), imageToDraw.naturalWidth - sWidth));
    sy = Math.max(0, Math.min(Math.round(sy), imageToDraw.naturalHeight - sHeight));

    if (![sx, sy, sWidth, sHeight].every(val => Number.isFinite(val) && val >= 0) || sWidth === 0 || sHeight === 0) {
      console.error("Invalid source dimensions for drawImage in context:", { sx, sy, sWidth, sHeight });
      ctx.restore();
      return;
    }
    
    ctx.translate(targetCanvasWidth / 2, targetCanvasHeight / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);

    applyCssFiltersToContextInternal(ctx, imageSettings); 
    
    const drawW = (rotation === 90 || rotation === 270) ? targetCanvasHeight : targetCanvasWidth;
    const drawH = (rotation === 90 || rotation === 270) ? targetCanvasWidth : targetCanvasHeight;

    ctx.drawImage(
      imageToDraw,
      sx, sy, sWidth, sHeight,
      -drawW / 2, -drawH / 2, drawW, drawH
    );
    ctx.filter = 'none';

    const effectRectArgs: [number, number, number, number] = [ -drawW / 2, -drawH / 2, drawW, drawH ];

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
      const radiusX = drawW / 2;
      const radiusY = drawH / 2;
      const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
      const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
      gradient.addColorStop(0, `rgba(0,0,0,0)`);
      gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 0.7})`);
      ctx.fillStyle = gradient;
      ctx.fillRect(...effectRectArgs);
    }

    if (grainIntensity > 0.001 && noisePattern) {
        ctx.save();
        ctx.fillStyle = noisePattern;
        ctx.globalAlpha = grainIntensity * 0.3; 
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(...effectRectArgs); 
        ctx.restore();
    }

    ctx.restore(); 
};


interface ImageEditorContextType {
  originalImage: HTMLImageElement | null;
  settings: ImageSettings;
  dispatchSettings: Dispatch<SettingsAction>;
  baseFileName: string;
  allImages: ImageObject[];
  activeImageId: string | null;
  addImageObject: (imageObject: Omit<ImageObject, 'id' | 'thumbnailDataUrl'>) => void;
  removeImage: (id: string) => void;
  setActiveImageId: (id: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  noisePatternRef: RefObject<CanvasPattern | null>;
  getCanvasDataURL: (type?: string, quality?: number) 
    => string | null;
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) 
    => Promise<string | null>;
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
  applyCssFilters: (ctx: CanvasRenderingContext2D, settings: ImageSettings) => void; // Expose applyCssFilters
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

const generateThumbnail = (imageElement: HTMLImageElement): string => {
  const thumbCanvas = document.createElement('canvas');
  const thumbCtx = thumbCanvas.getContext('2d');
  const MAX_THUMB_WIDTH = 80;
  const MAX_THUMB_HEIGHT = 80;
  let { naturalWidth: width, naturalHeight: height } = imageElement;

  if (!thumbCtx) return '';

  if (width > height) {
    if (width > MAX_THUMB_WIDTH) {
      height = Math.round((height * MAX_THUMB_WIDTH) / width);
      width = MAX_THUMB_WIDTH;
    }
  } else {
    if (height > MAX_THUMB_HEIGHT) {
      width = Math.round((width * MAX_THUMB_HEIGHT) / height);
      height = MAX_THUMB_HEIGHT;
    }
  }
  thumbCanvas.width = width;
  thumbCanvas.height = height;
  thumbCtx.drawImage(imageElement, 0, 0, width, height);
  return thumbCanvas.toDataURL('image/jpeg', 0.8);
};


export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [allImages, setAllImages] = useState<ImageObject[]>([]);
  const [activeImageId, setActiveImageIdInternal] = useState<string | null>(null);
  const [currentActiveImageElement, setCurrentActiveImageElement] = useState<HTMLImageElement | null>(null);
  const [currentBaseFileName, setCurrentBaseFileName] = useState<string>('retrograin_image');
  const [currentSettings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noisePatternRef = useRef<CanvasPattern | null>(null);
  const [copiedSettings, setCopiedSettings] = useState<ImageSettings | null>(null);

  useEffect(() => {
    if (activeImageId && currentSettings) {
      setAllImages(prevImages =>
        prevImages.map(img =>
          img.id === activeImageId ? { ...img, settings: { ...currentSettings } } : img
        )
      );
    }
  }, [currentSettings, activeImageId]);

  const addImageObject = useCallback((imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl'>) => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
    const thumbnailDataUrl = generateThumbnail(imageData.imageElement);
    const newImageObject: ImageObject = {
      ...imageData,
      id: newId,
      thumbnailDataUrl,
      settings: { ...initialImageSettings } 
    };
    setAllImages(prev => [...prev, newImageObject]);
    setActiveImageIdInternal(newId); 
  }, []);

  const removeImage = useCallback((id: string) => {
    setAllImages(prev => {
      const remainingImages = prev.filter(img => img.id !== id);
      if (activeImageId === id) {
        setActiveImageIdInternal(remainingImages.length > 0 ? remainingImages[0].id : null);
      }
      return remainingImages;
    });
  }, [activeImageId]);

  const setActiveImageId = useCallback((id: string | null) => {
    setActiveImageIdInternal(id);
    if (id) {
      const imageObj = allImages.find(img => img.id === id);
      if (imageObj) {
        setCurrentActiveImageElement(imageObj.imageElement);
        setCurrentBaseFileName(imageObj.baseFileName);
        dispatchSettings({ type: 'LOAD_SETTINGS', payload: imageObj.settings });
      }
    } else {
      setCurrentActiveImageElement(null);
      setCurrentBaseFileName('retrograin_image');
      dispatchSettings({ type: 'RESET_SETTINGS' });
    }
  }, [allImages]);

  useEffect(() => {
    if (allImages.length > 0 && !activeImageId) {
      setActiveImageId(allImages[0].id);
    }
  }, [allImages, activeImageId, setActiveImageId]);

  const getCanvasDataURL = useCallback((type: string = 'image/jpeg', quality?: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !currentActiveImageElement) return null;
    
    const offscreenCanvas = document.createElement('canvas');
    const imageToDraw = currentActiveImageElement;
    const settingsToApply = currentSettings;

    let sWidthFull = imageToDraw.naturalWidth / settingsToApply.cropZoom;
    let sHeightFull = imageToDraw.naturalHeight / settingsToApply.cropZoom;

    let canvasBufferWidthFull, canvasBufferHeightFull;
    if (settingsToApply.rotation === 90 || settingsToApply.rotation === 270) {
        canvasBufferWidthFull = sHeightFull;
        canvasBufferHeightFull = sWidthFull;
    } else {
        canvasBufferWidthFull = sWidthFull;
        canvasBufferHeightFull = sHeightFull;
    }
    offscreenCanvas.width = Math.max(1, Math.round(canvasBufferWidthFull));
    offscreenCanvas.height = Math.max(1, Math.round(canvasBufferHeightFull));
    
    const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    drawImageWithSettingsToContext(ctx, imageToDraw, settingsToApply, offscreenCanvas.width, offscreenCanvas.height, noisePatternRef.current);
    return offscreenCanvas.toDataURL(type, quality);

  }, [currentActiveImageElement, currentSettings, noisePatternRef]);

  const copyActiveSettings = useCallback(() => {
    if (activeImageId) {
      const activeImgObject = allImages.find(img => img.id === activeImageId);
      if (activeImgObject) {
        setCopiedSettings({ ...activeImgObject.settings });
      }
    }
  }, [activeImageId, allImages]);

  const pasteSettingsToActiveImage = useCallback(() => {
    if (activeImageId && copiedSettings) {
      dispatchSettings({ type: 'LOAD_SETTINGS', payload: { ...copiedSettings } });
    }
  }, [activeImageId, copiedSettings]);

  const generateImageDataUrlWithSettings = useCallback(async (
    imageElement: HTMLImageElement,
    settingsToApply: ImageSettings,
    type: string = 'image/jpeg',
    quality: number = 0.92
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const offscreenCanvas = document.createElement('canvas');
      
      let sWidthFull = imageElement.naturalWidth / settingsToApply.cropZoom;
      let sHeightFull = imageElement.naturalHeight / settingsToApply.cropZoom;

      let canvasBufferWidthFull, canvasBufferHeightFull;
      if (settingsToApply.rotation === 90 || settingsToApply.rotation === 270) {
          canvasBufferWidthFull = sHeightFull;
          canvasBufferHeightFull = sWidthFull;
      } else {
          canvasBufferWidthFull = sWidthFull;
          canvasBufferHeightFull = sHeightFull;
      }
      offscreenCanvas.width = Math.max(1, Math.round(canvasBufferWidthFull));
      offscreenCanvas.height = Math.max(1, Math.round(canvasBufferHeightFull));

      const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }
      
      drawImageWithSettingsToContext(ctx, imageElement, settingsToApply, offscreenCanvas.width, offscreenCanvas.height, noisePatternRef.current);
      resolve(offscreenCanvas.toDataURL(type, quality));
    });
  }, [noisePatternRef]);

  return (
    <ImageEditorContext.Provider
      value={{
        originalImage: currentActiveImageElement,
        settings: currentSettings,
        dispatchSettings,
        baseFileName: currentBaseFileName,
        allImages,
        activeImageId,
        addImageObject,
        removeImage,
        setActiveImageId,
        canvasRef,
        noisePatternRef,
        getCanvasDataURL,
        generateImageDataUrlWithSettings,
        isPreviewing,
        setIsPreviewing,
        copiedSettings,
        copyActiveSettings,
        pasteSettingsToActiveImage,
        applyCssFilters: applyCssFiltersToContextInternal, // Expose the renamed internal function
      }}
    >
      {children}
    </ImageEditorContext.Provider>
  );
}

export function useImageEditor() {
  const context = useContext(ImageEditorContext);
  if (context === undefined) {
    throw new Error('useImageEditor must be used within an ImageEditorProvider');
  }
  return context;
}

    