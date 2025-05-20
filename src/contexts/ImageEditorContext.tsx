
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
  processedImageURI: string | null;
  setProcessedImageURI: (uri: string | null) => void;
  settings: ImageSettings;
  dispatchSettings: Dispatch<SettingsAction>;
  isLoadingAi: boolean;
  setIsLoadingAi: (loading: boolean) => void;
  fileName: string;
  setFileName: (name: string) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: () => string | null;
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [originalImage, setOriginalImage] = useState<HTMLImageElement | null>(null);
  const [processedImageURI, setProcessedImageURI] = useState<string | null>(null);
  const [settings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [fileName, setFileName] = useState<string>('retrograin_image.png');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const getCanvasDataURL = useCallback(() => {
    if (canvasRef.current) {
      // Ensure final render quality before getting data URL if in preview mode
      if (isPreviewing) {
        // This is a bit of a hack. Ideally, getCanvasDataURL would trigger a synchronous high-quality render.
        // For now, we assume that critical actions (download, AI) will set isPreviewing to false before calling this.
        // Or, the component calling this should ensure isPreviewing is false.
        console.warn("getCanvasDataURL called while isPreviewing is true. Ensure high quality render.");
      }
      return canvasRef.current.toDataURL('image/png');
    }
    return null;
  }, [isPreviewing]); // Added isPreviewing to dependencies, though its direct effect here is mostly a warning.

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
        fileName,
        setFileName,
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
