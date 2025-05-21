
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';

export interface ImageSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  highlights: number;
  shadows: number;
  blacks: number;
  hueRotate: number; // Restored
  vignetteIntensity: number;
  grainIntensity: number;
  colorTemperature: number;
  tintShadowsColor: string;
  tintShadowsIntensity: number;
  tintShadowsSaturation: number;
  tintHighlightsColor: string;
  tintHighlightsIntensity: number;
  tintHighlightsSaturation: number;
  rotation: number; // 0, 90, 180, 270
  scaleX: number; // 1 or -1
  scaleY: number; // 1 or -1
  cropZoom: number;
  cropOffsetX: number;
  cropOffsetY: number;
  filter: string | null; // Restored
}

export const initialImageSettings: ImageSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  blacks: 0,
  hueRotate: 0, // Restored
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
  filter: null, // Restored
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
  | { type: 'SET_EXPOSURE'; payload: number }
  | { type: 'SET_HIGHLIGHTS'; payload: number }
  | { type: 'SET_SHADOWS'; payload: number }
  | { type: 'SET_BLACKS'; payload: number }
  | { type: 'SET_HUE_ROTATE'; payload: number } // Restored
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
  | { type: 'APPLY_FILTER'; payload: string | null } // Restored
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
    case 'SET_EXPOSURE':
      return { ...state, exposure: action.payload };
    case 'SET_HIGHLIGHTS':
      return { ...state, highlights: action.payload };
    case 'SET_SHADOWS':
      return { ...state, shadows: action.payload };
    case 'SET_BLACKS':
      return { ...state, blacks: action.payload };
    case 'SET_HUE_ROTATE': // Restored
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
    case 'APPLY_FILTER': // Restored
      return { ...state, filter: action.payload };
    case 'RESET_SETTINGS':
      return { ...initialImageSettings }; // Resets all, including hueRotate and filter
    case 'LOAD_SETTINGS':
      return { ...action.payload };
    default:
      return state;
  }
}

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
  getCanvasDataURL: (type?: string, quality?: number) // For active image
    => string | null;
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) 
    => Promise<string | null>; // For specific image and settings (ZIP)
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
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
    setAllImages(prev => prev.filter(img => img.id !== id));
    if (activeImageId === id) {
      const remainingImages = allImages.filter(img => img.id !== id);
      setActiveImageIdInternal(remainingImages.length > 0 ? remainingImages[0].id : null);
    }
  }, [activeImageId, allImages]);

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
    return canvas.toDataURL(type, quality);
  }, [currentActiveImageElement]);

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

  const drawImageWithSettingsToContext = useCallback((
    ctx: CanvasRenderingContext2D,
    imageToDraw: HTMLImageElement,
    imageSettings: ImageSettings,
    targetCanvasWidth: number,
    targetCanvasHeight: number
  ) => {
      ctx.clearRect(0, 0, targetCanvasWidth, targetCanvasHeight);
      ctx.save();
      
      const { rotation, scaleX, scaleY, cropZoom, cropOffsetX, cropOffsetY } = imageSettings;
      
      let sWidth = imageToDraw.naturalWidth / cropZoom;
      let sHeight = imageToDraw.naturalHeight / cropZoom;
      const maxPanX = imageToDraw.naturalWidth - sWidth;
      const maxPanY = imageToDraw.naturalHeight - sHeight;
      let sx = (cropOffsetX * 0.5 + 0.5) * maxPanX;
      let sy = (cropOffsetY * 0.5 + 0.5) * maxPanY;
      sx = Math.max(0, Math.min(sx, imageToDraw.naturalWidth - sWidth));
      sy = Math.max(0, Math.min(sy, imageToDraw.naturalHeight - sHeight));
      sWidth = Math.max(1, sWidth);
      sHeight = Math.max(1, sHeight);

      let drawWidth = sWidth;
      let drawHeight = sHeight;

      if (rotation === 90 || rotation === 270) {
        drawWidth = sHeight;
        drawHeight = sWidth;
      }
      
      ctx.translate(targetCanvasWidth / 2, targetCanvasHeight / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(scaleX, scaleY);

      // --- Apply CSS filters via ctx.filter ---
      const filters: string[] = [];
      if (imageSettings.brightness !== 1) filters.push(`brightness(${imageSettings.brightness * 100}%)`);
      if (imageSettings.contrast !== 1) filters.push(`contrast(${imageSettings.contrast * 100}%)`);
      if (imageSettings.saturation !== 1) filters.push(`saturate(${imageSettings.saturation * 100}%)`);
      if (imageSettings.exposure !== 0) { // Exposure implemented via brightness
        const effectiveBrightness = imageSettings.brightness + imageSettings.exposure;
        filters.push(`brightness(${effectiveBrightness * 100}%)`);
      }
      if (imageSettings.hueRotate !== 0) filters.push(`hue-rotate(${imageSettings.hueRotate}deg)`);
      if (imageSettings.filter) filters.push(imageSettings.filter);
      // Blacks adjustment (modifies brightness/contrast subtly)
      if (imageSettings.blacks !== 0) {
          // This is an approximation. Positive blacks lift, negative blacks crush.
          const contrastAdjustment = 1 - (Math.abs(imageSettings.blacks) * 0.1); // Reduce contrast slightly
          const brightnessAdjustment = imageSettings.blacks * 0.05; // Adjust brightness slightly
          filters.push(`contrast(${imageSettings.contrast * contrastAdjustment * 100}%)`);
          filters.push(`brightness(${ (imageSettings.brightness + imageSettings.exposure + brightnessAdjustment) * 100}%)`);
      }
      
      const filterString = filters.join(' ');
      ctx.filter = filterString.trim() || 'none';
      
      ctx.drawImage(
        imageToDraw, sx, sy, sWidth, sHeight,
        -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight
      );

      ctx.filter = 'none'; // Reset filter before other canvas operations
      
      const rectArgs: [number, number, number, number] = [-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight];

      // Apply direct canvas effects (Highlights, Shadows, Tints, etc.)
      // This section remains largely unchanged from the previous version that used canvas blend modes for these
      // Highlights & Shadows (approximated with blend modes)
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
      
      if (imageSettings.shadows > 0) { 
        applyBlendEffect(ctx, rectArgs, 'rgb(128, 128, 128)', imageSettings.shadows * 0.175 * 0.25, 'screen');
      } else if (imageSettings.shadows < 0) { 
        applyBlendEffect(ctx, rectArgs, 'rgb(50, 50, 50)', Math.abs(imageSettings.shadows) * 0.1 * 0.25, 'multiply');
      }

      if (imageSettings.highlights < 0) { 
        applyBlendEffect(ctx, rectArgs, 'rgb(128, 128, 128)', Math.abs(imageSettings.highlights) * 0.175 * 0.25, 'multiply');
      } else if (imageSettings.highlights > 0) { 
        applyBlendEffect(ctx, rectArgs, 'rgb(200, 200, 200)', imageSettings.highlights * 0.1 * 0.25, 'screen');
      }

      if (imageSettings.colorTemperature !== 0) {
        const temp = imageSettings.colorTemperature / 100;
        const alpha = Math.abs(temp) * 0.2;
        const color = temp > 0 ? `rgba(255, 165, 0, ${alpha})` : `rgba(0, 0, 255, ${alpha})`;
        applyBlendEffect(ctx, rectArgs, color, 1, 'overlay');
      }

      const hexToRgbLocal = (hex: string): { r: number; g: number; b: number } | null => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
      };
      const rgbToHexLocal = (r: number, g: number, b: number): string => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
      const desaturateRgbLocal = (rgb: { r: number; g: number; b: number }, saturation: number): { r: number; g: number; b: number } => {
        const gray = rgb.r * 0.3086 + rgb.g * 0.6094 + rgb.b * 0.0820;
        return {
          r: Math.round(rgb.r * saturation + gray * (1 - saturation)),
          g: Math.round(rgb.g * saturation + gray * (1 - saturation)),
          b: Math.round(rgb.b * saturation + gray * (1 - saturation)),
        };
      };
      const TINT_EFFECT_SCALING_FACTOR_LOCAL = 0.3 * 0.6 * 0.5; // Further reduced max tint intensity
      
      const applyTintWithSaturationLocal = (baseColorHex: string, intensity: number, saturation: number, blendMode: GlobalCompositeOperation) => {
          if (intensity > 0 && baseColorHex && baseColorHex !== '#000000' && baseColorHex !== '') {
              const rgbColor = hexToRgbLocal(baseColorHex);
              if (rgbColor) {
                  const saturatedRgb = desaturateRgbLocal(rgbColor, saturation);
                  const finalColorHex = rgbToHexLocal(saturatedRgb.r, saturatedRgb.g, saturatedRgb.b);
                  applyBlendEffect(ctx, rectArgs, finalColorHex, intensity * TINT_EFFECT_SCALING_FACTOR_LOCAL, blendMode);
              }
          }
      };
      
      applyTintWithSaturationLocal(imageSettings.tintShadowsColor, imageSettings.tintShadowsIntensity, imageSettings.tintShadowsSaturation, 'color-dodge');
      applyTintWithSaturationLocal(imageSettings.tintHighlightsColor, imageSettings.tintHighlightsIntensity, imageSettings.tintHighlightsSaturation, 'color-burn');
      
      if (imageSettings.vignetteIntensity > 0) {
        const centerX = 0; 
        const centerY = 0;
        const vignetteCanvasWidth = drawWidth; 
        const vignetteCanvasHeight = drawHeight;
        const radiusX = vignetteCanvasWidth / 2;
        const radiusY = vignetteCanvasHeight / 2;
        const outerRadius = Math.sqrt(radiusX * radiusX + radiusY * radiusY);
        const gradient = ctx.createRadialGradient(centerX, centerY, outerRadius * 0.2, centerX, centerY, outerRadius * 0.95);
        gradient.addColorStop(0, `rgba(0,0,0,0)`);
        gradient.addColorStop(1, `rgba(0,0,0,${imageSettings.vignetteIntensity})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(...rectArgs);
      }

      if (imageSettings.grainIntensity > 0) {
        // This part needs the noiseCanvasRef and noisePatternRef setup from ImageCanvas.tsx
        // For this generic function, we might need to pass the pattern or simplify grain for offscreen.
        // For now, this specific grain logic is more tied to the ImageCanvas component.
        // For simplicity in this generic function, grain might be omitted or require noisePattern to be passed.
      }

      ctx.restore(); 
  }, []);


  const generateImageDataUrlWithSettings = useCallback(async (
    imageElement: HTMLImageElement,
    settings: ImageSettings,
    type: string = 'image/jpeg',
    quality: number = 0.92
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const offscreenCanvas = document.createElement('canvas');
      
      let sWidth = imageElement.naturalWidth / settings.cropZoom;
      let sHeight = imageElement.naturalHeight / settings.cropZoom;

      let canvasBufferWidth, canvasBufferHeight;
      if (settings.rotation === 90 || settings.rotation === 270) {
          canvasBufferWidth = sHeight * Math.abs(settings.scaleY); 
          canvasBufferHeight = sWidth * Math.abs(settings.scaleX);
      } else {
          canvasBufferWidth = sWidth * Math.abs(settings.scaleX);
          canvasBufferHeight = sHeight * Math.abs(settings.scaleY);
      }
      offscreenCanvas.width = Math.max(1, Math.round(canvasBufferWidth));
      offscreenCanvas.height = Math.max(1, Math.round(canvasBufferHeight));

      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      
      drawImageWithSettingsToContext(ctx, imageElement, settings, offscreenCanvas.width, offscreenCanvas.height);
      resolve(offscreenCanvas.toDataURL(type, quality));
    });
  }, [drawImageWithSettingsToContext]);


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
        getCanvasDataURL,
        generateImageDataUrlWithSettings,
        isPreviewing,
        setIsPreviewing,
        copiedSettings,
        copyActiveSettings,
        pasteSettingsToActiveImage,
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

    