
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

export interface ImageSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  exposure: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  // sharpness: number; // Removed
  // hueRotate: number; // Temporarily disabled for WebGL transition
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
  scaleX: number; // 1 or -1 (flip horizontal)
  scaleY: number; // 1 or -1 (flip vertical)
  cropZoom: number; // 1 = no zoom, >1 = zoom in
  cropOffsetX: number; // -1 to 1
  cropOffsetY: number; // -1 to 1
  filter: string | null; // For preset CSS filters, temporarily disabled for WebGL
}

export const initialImageSettings: ImageSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  vibrance: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  // hueRotate: 0, // Temporarily disabled
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
  filter: null, // Temporarily disabled
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
  | { type: 'SET_VIBRANCE'; payload: number }
  | { type: 'SET_EXPOSURE'; payload: number }
  | { type: 'SET_HIGHLIGHTS'; payload: number }
  | { type: 'SET_SHADOWS'; payload: number }
  | { type: 'SET_WHITES'; payload: number }
  | { type: 'SET_BLACKS'; payload: number }
  // | { type: 'SET_HUE_ROTATE'; payload: number } // Temporarily disabled
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
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: ImageSettings }
  | { type: 'APPLY_FILTER'; payload: string | null }; // Temporarily disabled

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
    case 'SET_WHITES':
      return { ...state, whites: action.payload };
    case 'SET_BLACKS':
      return { ...state, blacks: action.payload };
    // case 'SET_HUE_ROTATE': // Temporarily disabled
    //   return { ...state, hueRotate: action.payload };
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
    case 'APPLY_FILTER': // Temporarily disabled
      return { ...state, filter: action.payload };
    case 'RESET_SETTINGS':
      return { ...initialImageSettings, 
        rotation: state.rotation, 
        scaleX: state.scaleX, 
        scaleY: state.scaleY, 
        cropZoom: state.cropZoom, 
        cropOffsetX: state.cropOffsetX, 
        cropOffsetY: state.cropOffsetY 
      };
    case 'LOAD_SETTINGS':
      return { ...action.payload };
    default:
      return state;
  }
}

/*
// applyCssFiltersToContext is temporarily disabled for WebGL transition
export const applyCssFiltersToContext = (ctx: CanvasRenderingContext2D, settings: ImageSettings) => {
  // ... existing logic ...
  // This function will need to be replaced with WebGL shader logic
  console.warn("applyCssFiltersToContext is a 2D Canvas function and will not work with WebGL.");
};
*/

const NOISE_CANVAS_SIZE = 250;

// drawImageWithSettingsToContext is temporarily disabled/modified for WebGL transition
export const drawImageWithSettingsToContext = (
  _ctx: CanvasRenderingContext2D, // This will be unused in WebGL context for export
  imageToDraw: HTMLImageElement,
  imageSettings: ImageSettings,
  targetCanvasWidth: number, 
  targetCanvasHeight: number, 
  noiseImageData: ImageData | null 
) => {
    console.warn("drawImageWithSettingsToContext needs to be reimplemented for WebGL export.");
    // For now, this function will not produce an image from WebGL
    // Placeholder for future WebGL offscreen rendering
    return;
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
  canvasRef: RefObject<HTMLCanvasElement>; // Will be used for WebGL
  noiseImageDataRef: RefObject<ImageData | null>; 
  getCanvasDataURL: (type?: string, quality?: number)
    => string | null; // Temporarily disabled
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number)
    => Promise<string | null>; // Temporarily disabled
  isPreviewing: boolean; // Might be less relevant with WebGL immediate mode
  setIsPreviewing: (isPreviewing: boolean) => void;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
  // applyCssFilters: (ctx: CanvasRenderingContext2D, settings: ImageSettings) => void; // Temporarily disabled
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

  const [isPreviewing, setIsPreviewing] = useState(false); // May be less used with WebGL
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const noiseImageDataRef = useRef<ImageData | null>(null); 
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
      imageElement: imageData.imageElement,
      baseFileName: imageData.baseFileName,
      settings: { ...initialImageSettings, ...(imageData.settings || {}) }, 
      id: newId,
      thumbnailDataUrl,
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

  const getCanvasDataURL = useCallback(() => { // Temporarily disabled for WebGL
    console.warn("getCanvasDataURL is temporarily disabled during WebGL upgrade. Export will not work.");
    return null;
  }, []); 

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
      const targetImg = allImages.find(img => img.id === activeImageId);
      if (targetImg) {
        const newSettings = {
          ...copiedSettings,
          rotation: targetImg.settings.rotation,
          scaleX: targetImg.settings.scaleX,
          scaleY: targetImg.settings.scaleY,
          cropZoom: targetImg.settings.cropZoom,
          cropOffsetX: targetImg.settings.cropOffsetX,
          cropOffsetY: targetImg.settings.cropOffsetY,
        };
        dispatchSettings({ type: 'LOAD_SETTINGS', payload: newSettings });
      }
    }
  }, [activeImageId, copiedSettings, allImages]);

  const generateImageDataUrlWithSettings = useCallback(async (
    // imageElement: HTMLImageElement, // Temporarily disabled for WebGL
    // settingsToApply: ImageSettings,
    // type: string = 'image/jpeg',
    // quality: number = 0.92
  ): Promise<string | null> => { // Temporarily disabled for WebGL
    console.warn("generateImageDataUrlWithSettings is temporarily disabled during WebGL upgrade. ZIP export will not work.");
    return Promise.resolve(null);
  }, []); 


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
        noiseImageDataRef, 
        getCanvasDataURL,
        generateImageDataUrlWithSettings,
        isPreviewing,
        setIsPreviewing,
        copiedSettings,
        copyActiveSettings,
        pasteSettingsToActiveImage,
        // applyCssFilters: applyCssFiltersToContext, // Temporarily disabled
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
