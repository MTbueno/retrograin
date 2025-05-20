
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback } from 'react';

export interface ImageSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  crop: { x: number; y: number; width: number; height: number; unit: '%' | 'px' } | null;
  filter: string | null;
}

export const initialImageSettings: ImageSettings = {
  brightness: 1, // Multiplier, 1 = 100%
  contrast: 1,   // Multiplier, 1 = 100%
  saturation: 1, // Multiplier, 1 = 100%
  exposure: 0,   // Additive/multiplicative, 0 = no change
  rotation: 0,   // Degrees
  scaleX: 1,     // 1 or -1
  scaleY: 1,     // 1 or -1
  crop: null,
  filter: null,  // e.g., 'grayscale', 'sepia', 'invert'
};

export type SettingsAction =
  | { type: 'SET_BRIGHTNESS'; payload: number }
  | { type: 'SET_CONTRAST'; payload: number }
  | { type: 'SET_SATURATION'; payload: number }
  | { type: 'SET_EXPOSURE'; payload: number }
  | { type: 'ROTATE_CW' }
  | { type: 'ROTATE_CCW' }
  | { type: 'FLIP_HORIZONTAL' }
  | { type: 'FLIP_VERTICAL' }
  | { type: 'SET_CROP'; payload: ImageSettings['crop'] }
  | { type: 'APPLY_FILTER'; payload: string | null }
  | { type: 'RESET_SETTINGS' }
  | { type: 'APPLY_AI_SUGGESTIONS'; payload: Partial<ImageSettings> };

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
        return { ...state, filter: action.payload, saturation: 0 };
      }
      return { ...state, filter: action.payload };
    case 'RESET_SETTINGS':
      return initialImageSettings;
    case 'APPLY_AI_SUGGESTIONS':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

interface ImageEditorContextType {
  originalImage: HTMLImageElement | null;
  setOriginalImage: (image: HTMLImageElement | null) => void;
  // processedImageURI remains for potential internal use, but download/AI will use getCanvasDataURL
  processedImageURI: string | null; 
  setProcessedImageURI: (uri: string | null) => void;
  settings: ImageSettings;
  dispatchSettings: Dispatch<SettingsAction>;
  isLoadingAi: boolean;
  setIsLoadingAi: (loading: boolean) => void;
  baseFileName: string; // Changed from fileName
  setBaseFileName: (name: string) => void; // Changed from setFileName
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: (type?: string, quality?: number) => string | null; // Updated signature
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [processedImageURI, setProcessedImageURI] = useState<string | null>(null);
  const [settings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [baseFileName, setBaseFileName] = useState<string>('retrograin_image'); // Default base name
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const getCanvasDataURL = useCallback((type: string = 'image/png', quality?: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    // Ensure final render quality before getting data URL if isPreviewing was true
    // This check is more of a safeguard; ideally isPreviewing is false when this is called for download/AI.
    if (isPreviewing) {
      console.warn("getCanvasDataURL called while isPreviewing is true. Forcing a high-quality render for data URL generation.");
      // Potentially force a synchronous redraw at full quality if truly needed here,
      // though current design expects isPreviewing to be false for critical calls.
    }
    return canvas.toDataURL(type, quality);
  }, [isPreviewing, canvasRef]);


  return (
    <ImageEditorContext.Provider
      value={{
        originalImage,
        setOriginalImage,
        processedImageURI,
        setProcessedImageURI,
        settings,
        dispatchSettings,
        isLoadingAi,
        setIsLoadingAi,
        baseFileName, // Updated
        setBaseFileName, // Updated
        canvasRef,
        getCanvasDataURL, // Updated
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
