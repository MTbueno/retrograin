
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback } from 'react';

export interface ImageSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  hueRotate: number;
  vignetteIntensity: number; // 0 to 1
  grainIntensity: number;    // 0 to 1
  colorTemperature: number;  // -100 (cool) to 100 (warm)
  tintColor: string; // hex color string, e.g., '#FF0000'
  tintIntensity: number; // 0 to 1
  rotation: number;
  scaleX: number;
  scaleY: number;
  crop: { x: number; y: number; width: number; height: number; unit: '%' | 'px' } | null;
  filter: string | null;
}

export const initialImageSettings: ImageSettings = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  exposure: 0,
  hueRotate: 0,
  vignetteIntensity: 0,
  grainIntensity: 0,
  colorTemperature: 0,
  tintColor: '', // Default to no tint
  tintIntensity: 0, // Default to no tint intensity
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  crop: null,
  filter: null,
};

export type SettingsAction =
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_CONTRAST'; payload: number }
  | { type: 'SET_SATURATION'; payload: number }
  | { type: 'SET_EXPOSURE'; payload: number }
  | { type: 'SET_HUE_ROTATE'; payload: number }
  | { type: 'SET_VIGNETTE_INTENSITY'; payload: number }
  | { type: 'SET_GRAIN_INTENSITY'; payload: number }
  | { type: 'SET_COLOR_TEMPERATURE'; payload: number }
  | { type: 'SET_TINT_COLOR'; payload: string }
  | { type: 'SET_TINT_INTENSITY'; payload: number }
  | { type: 'ROTATE_CW' }
  | { type: 'ROTATE_CCW' }
  | { type: 'FLIP_HORIZONTAL' }
  | { type: 'FLIP_VERTICAL' }
  | { type: 'SET_CROP'; payload: ImageSettings['crop'] }
  | { type: 'APPLY_FILTER'; payload: string | null }
  | { type: 'RESET_SETTINGS' };

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
    case 'SET_HUE_ROTATE':
      return { ...state, hueRotate: action.payload };
    case 'SET_VIGNETTE_INTENSITY':
      return { ...state, vignetteIntensity: action.payload };
    case 'SET_GRAIN_INTENSITY':
      return { ...state, grainIntensity: action.payload };
    case 'SET_COLOR_TEMPERATURE':
      return { ...state, colorTemperature: action.payload };
    case 'SET_TINT_COLOR':
      return { ...state, tintColor: action.payload };
    case 'SET_TINT_INTENSITY':
      return { ...state, tintIntensity: action.payload };
    case 'ROTATE_CW':
      return { ...state, rotation: (state.rotation + 90) % 360 };
    case 'ROTATE_CCW':
      return { ...state, rotation: (state.rotation - 90 + 360) % 360 };
    case 'FLIP_HORIZONTAL':
      return { ...state, scaleX: state.scaleX * -1 };
    case 'FLIP_VERTICAL':
      return { ...state, scaleY: state.scaleY * -1 };
    case 'SET_CROP':
      return { ...state, crop: action.payload };
    case 'APPLY_FILTER':
      if (action.payload === 'grayscale') {
        return { ...state, filter: action.payload, saturation: 0, hueRotate: 0 };
      }
      return { ...state, filter: action.payload };
    case 'RESET_SETTINGS':
      return initialImageSettings;
    default:
      return state;
  }
}

interface ImageEditorContextType {
  originalImage: HTMLImageElement | null;
  setOriginalImage: (image: HTMLImageElement | null) => void;
  settings: ImageSettings;
  dispatchSettings: Dispatch<SettingsAction>;
  baseFileName: string;
  setBaseFileName: (name: string) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: (type?: string, quality?: number) => string | null;
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [settings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);
  const [baseFileName, setBaseFileName] = useState<string>('retrograin_image');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const getCanvasDataURL = useCallback((type: string = 'image/jpeg', quality?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    if (isPreviewing) {
      console.warn("getCanvasDataURL called while isPreviewing is true. Consider calling setIsPreviewing(false) before this for intended quality.");
    }
    return canvas.toDataURL(type, quality);
  }, [isPreviewing, canvasRef]);


  return (
    <ImageEditorContext.Provider
      value={{
        originalImage,
        setOriginalImage,
        settings,
        dispatchSettings,
        baseFileName,
        setBaseFileName,
        canvasRef,
        getCanvasDataURL,
        isPreviewing,
        setIsPreviewing,
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
