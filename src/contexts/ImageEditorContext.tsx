
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';

// Define color targets for selective color adjustments
export const SELECTIVE_COLOR_TARGETS = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'] as const;
export type SelectiveColorTarget = typeof SELECTIVE_COLOR_TARGETS[number];

export interface SelectiveColorAdjustment {
  hue: number;        // -0.5 to 0.5 (maps to -180 to 180 degrees for shader)
  saturation: number; // -1.0 to 1.0 (maps to -100% to 100% change for shader)
  luminance: number;  // -1.0 to 1.0 (maps to -100% to 100% change for shader)
}

export type SelectiveColors = {
  [K in SelectiveColorTarget]: SelectiveColorAdjustment;
};

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
  filter: string | null;
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
  cropZoom: number; // 1 (no zoom) to N
  cropOffsetX: number; // -1 to 1
  cropOffsetY: number; // -1 to 1
  // Selective Color
  selectiveColors: SelectiveColors;
  activeSelectiveColorTarget: SelectiveColorTarget;
}

const initialSelectiveColors: SelectiveColors = SELECTIVE_COLOR_TARGETS.reduce((acc, color) => {
  acc[color] = { hue: 0, saturation: 0, luminance: 0 };
  return acc;
}, {} as SelectiveColors);

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
  filter: null,
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
  selectiveColors: initialSelectiveColors,
  activeSelectiveColorTarget: 'reds',
};

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
  | { type: 'APPLY_FILTER'; payload: string | null }
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
  | { type: 'RESET_CROP_AND_TRANSFORMS' }
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: ImageSettings }
  | { type: 'SET_ACTIVE_SELECTIVE_COLOR_TARGET'; payload: SelectiveColorTarget }
  | { type: 'SET_SELECTIVE_COLOR_ADJUSTMENT'; payload: { target: SelectiveColorTarget; adjustment: Partial<SelectiveColorAdjustment> } };

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
    case 'APPLY_FILTER':
      return { ...state, filter: action.payload };
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
    case 'RESET_CROP_AND_TRANSFORMS':
      return {
        ...state,
        cropZoom: 1,
        cropOffsetX: 0,
        cropOffsetY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    case 'RESET_SETTINGS':
      return {
        ...initialImageSettings,
        // Preserve transforms
        rotation: state.rotation,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        cropZoom: state.cropZoom,
        cropOffsetX: state.cropOffsetX,
        cropOffsetY: state.cropOffsetY,
      };
    case 'LOAD_SETTINGS':
      return { ...action.payload };
    case 'SET_ACTIVE_SELECTIVE_COLOR_TARGET':
      return { ...state, activeSelectiveColorTarget: action.payload };
    case 'SET_SELECTIVE_COLOR_ADJUSTMENT':
      return {
        ...state,
        selectiveColors: {
          ...state.selectiveColors,
          [action.payload.target]: {
            ...state.selectiveColors[action.payload.target],
            ...action.payload.adjustment,
          },
        },
      };
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
  getCanvasDataURL: () => string | null;
  generateImageDataUrlWithSettings: (imageObject: ImageObject) => Promise<string | null>;
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

  const getCanvasDataURL = useCallback((): string | null => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || !currentActiveImageElement) {
      console.warn("getCanvasDataURL: Canvas or original image not available for WebGL export.");
      return null;
    }
    try {
      // For WebGL, ensure preserveDrawingBuffer: true is set on context creation if needed
      return currentCanvas.toDataURL('image/jpeg', 0.92);
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
    imageObject: ImageObject,
  ): Promise<string | null> => {
     if (!canvasRef.current) {
      console.error("generateImageDataUrlWithSettings: Main canvasRef is not available.");
      return null;
    }
    // Temporarily set the main canvas to render the target imageObject
    // This is a simplification; a dedicated offscreen canvas for export would be better
    // but requires passing GL context and recreating shaders/buffers or a shared GL resource manager.
    const previousActiveId = activeImageId;
    const previousSettings = { ...currentSettings };

    // Simulate activating the target imageObject
    setCurrentActiveImageElement(imageObject.imageElement);
    dispatchSettings({ type: 'LOAD_SETTINGS', payload: imageObject.settings });

    // Wait for a render cycle to ensure the canvas updates
    // This is a hacky way to wait for re-render; a more robust solution would use a callback
    // or a promise that resolves after the WebGL draw call for these settings.
    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for re-render

    let dataURL: string | null = null;
    try {
        dataURL = canvasRef.current.toDataURL('image/jpeg', 0.92);
    } catch (e) {
        console.error("Error generating data URL during generateImageDataUrlWithSettings:", e);
    }

    // Restore previous active image and settings
    if (previousActiveId) {
        const prevActiveImageObj = allImages.find(img => img.id === previousActiveId);
        if (prevActiveImageObj) {
            setCurrentActiveImageElement(prevActiveImageObj.imageElement);
        }
        dispatchSettings({ type: 'LOAD_SETTINGS', payload: previousSettings });
         await new Promise(resolve => setTimeout(resolve, 50)); // Re-render back
    }


    return dataURL;
  }, [activeImageId, currentSettings, allImages, canvasRef]);


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
