
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';

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
  tiltAngle: number; // New: For free rotation/tilt
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
  tiltAngle: 0, // New: Default tilt angle
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
  | { type: 'SET_TILT_ANGLE'; payload: number } // New: Action for tilt
  | { type: 'RESET_CROP_AND_ANGLE' }
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
    case 'SET_WHITES':
      return { ...state, whites: action.payload };
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
    case 'SET_TILT_ANGLE': // New: Reducer for tilt
      return { ...state, tiltAngle: action.payload };
    case 'RESET_CROP_AND_ANGLE':
      return { ...state, cropZoom: 1, cropOffsetX: 0, cropOffsetY: 0, tiltAngle: 0 }; // Reset tilt too
    case 'RESET_SETTINGS':
      return {
        ...initialImageSettings,
        rotation: state.rotation,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        cropZoom: state.cropZoom,
        cropOffsetX: state.cropOffsetX,
        cropOffsetY: state.cropOffsetY,
        tiltAngle: state.tiltAngle, // Preserve tilt on general reset
      };
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
  getCanvasDataURL: (type?: string, quality?: number) => string | null;
  generateImageDataUrlWithSettings: (imageObject: ImageObject, type?: string, quality?: number) => Promise<string | null>;
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

  const getCanvasDataURL = useCallback((type: string = 'image/jpeg', quality: number = 0.92): string | null => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || !currentActiveImageElement) {
      console.warn("getCanvasDataURL: Canvas or original image not available for WebGL export.");
      return null;
    }
    try {
        // For WebGL, toDataURL might need preserveDrawingBuffer: true on context creation.
        // This is set in ImageCanvas.tsx during getContext.
      return currentCanvas.toDataURL(type, quality);
    } catch (e) {
      console.error("Error getting data URL from WebGL canvas:", e);
      return null;
    }
  }, [canvasRef, currentActiveImageElement]);

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
          // Preserve transform settings of the target image when pasting adjustments
          rotation: targetImg.settings.rotation,
          scaleX: targetImg.settings.scaleX,
          scaleY: targetImg.settings.scaleY,
          cropZoom: targetImg.settings.cropZoom,
          cropOffsetX: targetImg.settings.cropOffsetX,
          cropOffsetY: targetImg.settings.cropOffsetY,
          tiltAngle: targetImg.settings.tiltAngle,
        };
        dispatchSettings({ type: 'LOAD_SETTINGS', payload: newSettings });
      }
    }
  }, [activeImageId, copiedSettings, allImages]);


  const generateImageDataUrlWithSettings = useCallback(async (
    imageObject: ImageObject, // Now takes the full ImageObject
    type: string = 'image/jpeg',
    quality: number = 0.92
  ): Promise<string | null> => {
    const { imageElement, settings } = imageObject;
    // This function needs a proper WebGL offscreen rendering implementation.
    // For now, it will simulate by using the main canvas if it matches the active image,
    // or log a warning. This is a placeholder for a true offscreen WebGL render.

    if (activeImageId === imageObject.id && canvasRef.current) {
        // If it's the active image, we can try to get data from the main canvas.
        // This assumes the main canvas is already up-to-date with 'settings'.
        // For a true isolated generation, we'd need to re-render to an offscreen WebGL canvas.
        console.warn("generateImageDataUrlWithSettings: Using main canvas for active image. For non-active images or robust export, full offscreen WebGL rendering is needed.");
        return canvasRef.current.toDataURL(type, quality);
    }

    console.warn("generateImageDataUrlWithSettings for WebGL (ZIP export for non-active images) needs a full offscreen WebGL rendering implementation and is currently not functional for them.");
    return null;
  }, [activeImageId, canvasRef]);


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
