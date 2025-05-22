
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
  cropOffsetX: number; // -1 to 1 (percentage of pannable area)
  cropOffsetY: number; // -1 to 1 (percentage of pannable area)
  selectiveColors: SelectiveColors;
  activeSelectiveColorTarget: SelectiveColorTarget;
  hueRotate: number; 
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
  selectiveColors: JSON.parse(JSON.stringify(initialSelectiveColors)), // Deep copy
  activeSelectiveColorTarget: 'reds',
  hueRotate: 0, 
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
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: ImageSettings }
  | { type: 'RESET_CROP_AND_TRANSFORMS' }
  | { type: 'SET_ACTIVE_SELECTIVE_COLOR_TARGET'; payload: SelectiveColorTarget }
  | { type: 'SET_SELECTIVE_COLOR_ADJUSTMENT'; payload: { target: SelectiveColorTarget; adjustment: Partial<SelectiveColorAdjustment> } }
  | { type: 'SET_HUE_ROTATE'; payload: number };


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
    case 'SET_CROP_ZOOM': {
      const newZoom = Math.max(1, action.payload);
      // If zoom is reset to 1, also reset offsets
      if (newZoom === 1) {
        return { ...state, cropZoom: newZoom, cropOffsetX: 0, cropOffsetY: 0 };
      }
      return { ...state, cropZoom: newZoom };
    }
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
        selectiveColors: JSON.parse(JSON.stringify(initialSelectiveColors)), // Ensure selective colors are also reset
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
    case 'SET_HUE_ROTATE': 
      return { ...state, hueRotate: action.payload };
    default:
      return state;
  }
}

export interface ImageObject {
  id: string;
  imageElement: HTMLImageElement;
  baseFileName: string;
  settings: ImageSettings;
  thumbnailDataUrl: string;
}

interface ImageEditorContextType {
  originalImage: HTMLImageElement | null; 
  settings: ImageSettings; 
  dispatchSettings: Dispatch<SettingsAction>;
  baseFileName: string; 
  allImages: ImageObject[];
  activeImageId: string | null;
  addImageObject: (imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl'>) => void;
  removeImage: (id: string) => void;
  setActiveImageId: (id: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: (type?: string, quality?: number) => string | null;
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) => Promise<string | null>;
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
  noiseImageDataRef: RefObject<ImageData | null>;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

const THUMBNAIL_MAX_WIDTH = 80;
const THUMBNAIL_MAX_HEIGHT = 80;
const THUMBNAIL_JPEG_QUALITY = 0.8;

const generateThumbnail = (imageElement: HTMLImageElement): string => {
  const thumbCanvas = document.createElement('canvas');
  const thumbCtx = thumbCanvas.getContext('2d');
  let { naturalWidth: width, naturalHeight: height } = imageElement;

  if (!thumbCtx) return '';

  const aspectRatio = width / height;

  if (width > height) {
    if (width > THUMBNAIL_MAX_WIDTH) {
      width = THUMBNAIL_MAX_WIDTH;
      height = Math.round(width / aspectRatio);
    }
  } else {
    if (height > THUMBNAIL_MAX_HEIGHT) {
      height = THUMBNAIL_MAX_HEIGHT;
      width = Math.round(height * aspectRatio);
    }
  }
  // Ensure height is also within bounds after width adjustment (for very wide images)
  if (height > THUMBNAIL_MAX_HEIGHT) {
      height = THUMBNAIL_MAX_HEIGHT;
      width = Math.round(height * aspectRatio);
  }
  // Ensure width is also within bounds after height adjustment (for very tall images)
   if (width > THUMBNAIL_MAX_WIDTH) {
      width = THUMBNAIL_MAX_WIDTH;
      height = Math.round(width / aspectRatio);
  }


  thumbCanvas.width = Math.max(1, width);
  thumbCanvas.height = Math.max(1, height);
  thumbCtx.drawImage(imageElement, 0, 0, thumbCanvas.width, thumbCanvas.height);
  return thumbCanvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY);
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
  const noiseImageDataRef = useRef<ImageData | null>(null);


  useEffect(() => {
    if (activeImageId) {
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
    } else if (allImages.length === 0 && activeImageId) {
      setActiveImageId(null);
    }
  }, [allImages, activeImageId, setActiveImageId]);


  const getCanvasDataURL = useCallback((type: string = 'image/jpeg', quality: number = 0.92): string | null => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || !currentActiveImageElement) {
      console.warn("getCanvasDataURL: Main canvas or original image not available for WebGL export.");
      return null;
    }
    try {
      // Ensure the canvas is drawn at full resolution before exporting
      // This might involve temporarily setting isPreviewing to false if it affects drawScene's resolution
      // For simplicity, assume drawScene called by export will handle full res
      return currentCanvas.toDataURL(type, quality);
    } catch (e) {
      console.error("Error getting data URL from WebGL canvas:", e);
      return null;
    }
  }, [canvasRef, currentActiveImageElement]);

  const drawImageWithSettingsToContext = useCallback(
    (
      _ctx: WebGLRenderingContext,
      _image: HTMLImageElement,
      _settings: ImageSettings,
      _programInfo: any, 
      _buffers: any, 
      currentNoiseImageData: ImageData | null,
      targetWidth: number,
      targetHeight: number
    ): void => {
        if (!_ctx || !_image || !_programInfo || !_buffers) {
          console.error("drawImageWithSettingsToContext: Missing GL context, image, programInfo, or buffers.");
          return;
        }

        const gl = _ctx;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0.188, 0.188, 0.188, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        gl.useProgram(_programInfo.program);

        gl.bindBuffer(gl.ARRAY_BUFFER, _buffers.position);
        gl.vertexAttribPointer(_programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(_programInfo.attribLocations.vertexPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, _buffers.textureCoord);
        gl.vertexAttribPointer(_programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(_programInfo.attribLocations.textureCoord);
        
        const texture = gl.createTexture();
        if (!texture) {
            console.error("Failed to create texture for export.");
            return;
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, _image);
        } catch (e) {
            console.error("Error during texImage2D for export:", e);
            gl.deleteTexture(texture);
            return;
        }

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        if (_programInfo.uniformLocations.sampler) gl.uniform1i(_programInfo.uniformLocations.sampler, 0);
        
        // Basic Adjustments
        if (_programInfo.uniformLocations.brightness) gl.uniform1f(_programInfo.uniformLocations.brightness, _settings.brightness);
        if (_programInfo.uniformLocations.contrast) gl.uniform1f(_programInfo.uniformLocations.contrast, _settings.contrast);
        if (_programInfo.uniformLocations.saturation) gl.uniform1f(_programInfo.uniformLocations.saturation, _settings.saturation);
        if (_programInfo.uniformLocations.vibrance) gl.uniform1f(_programInfo.uniformLocations.vibrance, _settings.vibrance);
        if (_programInfo.uniformLocations.exposure) gl.uniform1f(_programInfo.uniformLocations.exposure, _settings.exposure);
        if (_programInfo.uniformLocations.highlights) gl.uniform1f(_programInfo.uniformLocations.highlights, _settings.highlights);
        if (_programInfo.uniformLocations.shadows) gl.uniform1f(_programInfo.uniformLocations.shadows, _settings.shadows);
        if (_programInfo.uniformLocations.whites) gl.uniform1f(_programInfo.uniformLocations.whites, _settings.whites);
        if (_programInfo.uniformLocations.blacks) gl.uniform1f(_programInfo.uniformLocations.blacks, _settings.blacks);

        // Color Settings
        if (_programInfo.uniformLocations.hueValue) gl.uniform1f(_programInfo.uniformLocations.hueValue, (_settings.hueRotate ?? 0) / 360.0);
        if (_programInfo.uniformLocations.temperatureShift) gl.uniform1f(_programInfo.uniformLocations.temperatureShift, (_settings.colorTemperature ?? 0) / 200.0);
        
        const { hexToRgbNormalizedArray: hexToRgbNorm } = require('@/lib/colorUtils'); // Ensure this path is correct

        const shadowRgb = hexToRgbNorm(_settings.tintShadowsColor);
        if (_programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
        if (_programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(_programInfo.uniformLocations.tintShadowsIntensityFactor, _settings.tintShadowsIntensity);
        if (_programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(_programInfo.uniformLocations.tintShadowsSaturationValue, _settings.tintShadowsSaturation);

        const highlightRgb = hexToRgbNorm(_settings.tintHighlightsColor);
        if (_programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(_programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
        if (_programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(_programInfo.uniformLocations.tintHighlightsIntensityFactor, _settings.tintHighlightsIntensity);
        if (_programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(_programInfo.uniformLocations.tintHighlightsSaturationValue, _settings.tintHighlightsSaturation);
        
        // Effects
        if (_programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(_programInfo.uniformLocations.vignetteIntensity, _settings.vignetteIntensity);
        if (_programInfo.uniformLocations.grainIntensity) gl.uniform1f(_programInfo.uniformLocations.grainIntensity, _settings.grainIntensity);
        if (_programInfo.uniformLocations.time) gl.uniform1f(_programInfo.uniformLocations.time, performance.now() / 5000.0); 
        if (_programInfo.uniformLocations.resolution) gl.uniform2f(_programInfo.uniformLocations.resolution, targetWidth, targetHeight);

        // Transforms
        let rotationInRadians = 0;
        switch (_settings.rotation) {
            case 90: rotationInRadians = Math.PI / 2; break;
            case 180: rotationInRadians = Math.PI; break;
            case 270: rotationInRadians = (3 * Math.PI) / 2; break;
        }
        if (_programInfo.uniformLocations.rotationAngle) gl.uniform1f(_programInfo.uniformLocations.rotationAngle, rotationInRadians);
        if (_programInfo.uniformLocations.scale) gl.uniform2f(_programInfo.uniformLocations.scale, _settings.scaleX, _settings.scaleY);
        
        const totalEffectiveZoom = _settings.cropZoom; 
        if (_programInfo.uniformLocations.cropTexScale) gl.uniform2f(_programInfo.uniformLocations.cropTexScale, 1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom);
        
        const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0);
        const texOffsetX = _settings.cropOffsetX * maxTexOffset;
        const texOffsetY = _settings.cropOffsetY * maxTexOffset * -1.0; 
        if (_programInfo.uniformLocations.cropTexOffset) gl.uniform2f(_programInfo.uniformLocations.cropTexOffset, texOffsetX, texOffsetY);

        // Selective Color
        const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
        const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(_settings.activeSelectiveColorTarget);
        
        if (_programInfo.uniformLocations.selectedColorTargetIndex) {
          gl.uniform1i(_programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
        }
        const currentSelective = _settings.selectiveColors[_settings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
        if (_programInfo.uniformLocations.hueAdjustment) gl.uniform1f(_programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
        if (_programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(_programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
        if (_programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(_programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);
        
        // Grain for export using ImageData
        if (_settings.grainIntensity > 0.001 && currentNoiseImageData && _programInfo.uniformLocations.grainSampler && _programInfo.uniformLocations.noiseTextureResolution) {
            const noiseTexture = gl.createTexture();
            if (noiseTexture) {
                gl.activeTexture(gl.TEXTURE1); 
                gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Noise doesn't need flipping
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, currentNoiseImageData.width, currentNoiseImageData.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(currentNoiseImageData.data));
                
                if (_programInfo.uniformLocations.grainSampler) gl.uniform1i(_programInfo.uniformLocations.grainSampler, 1); 
                if (_programInfo.uniformLocations.noiseTextureResolution) gl.uniform2f(_programInfo.uniformLocations.noiseTextureResolution, currentNoiseImageData.width, currentNoiseImageData.height);

                gl.activeTexture(gl.TEXTURE0); 
            } else {
                 if (_programInfo.uniformLocations.grainSampler) gl.uniform1i(_programInfo.uniformLocations.grainSampler, 0); // Use main texture if noise fails
            }
        } else {
            // Ensure grain sampler is pointed to something valid even if grain is off
             if (_programInfo.uniformLocations.grainSampler) gl.uniform1i(_programInfo.uniformLocations.grainSampler, 0); // Default to main texture
        }
         gl.bindTexture(gl.TEXTURE_2D, texture); // Re-bind main image texture before drawing


        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.deleteTexture(texture); 
        const noiseTextureBound = gl.getParameter(gl.TEXTURE_BINDING_2D);
        if(noiseTextureBound && gl.getTextureParameter(noiseTextureBound, gl.TEXTURE_BINDING_2D) === gl.TEXTURE1){
            // This is a bit of a guess, assuming it might be the noise texture.
            // Ideally, keep a ref to noiseTexture and delete it if it was created.
            // For now, this is a placeholder.
        }

    }, []
  );


  const generateImageDataUrlWithSettings = useCallback(async (
    imageElement: HTMLImageElement,
    settingsToApply: ImageSettings,
    type: string = 'image/jpeg',
    quality: number = 0.92
  ): Promise<string | null> => {
    if (!imageElement.complete || imageElement.naturalWidth === 0) {
      console.error("generateImageDataUrlWithSettings: Image not loaded or invalid.");
      return null;
    }

    const offscreenCanvas = document.createElement('canvas');
    
    let exportWidth = imageElement.naturalWidth / settingsToApply.cropZoom;
    let exportHeight = imageElement.naturalHeight / settingsToApply.cropZoom;

    if (settingsToApply.rotation === 90 || settingsToApply.rotation === 270) {
        [exportWidth, exportHeight] = [exportHeight, exportWidth];
    }
    
    offscreenCanvas.width = Math.max(1, Math.round(exportWidth));
    offscreenCanvas.height = Math.max(1, Math.round(exportHeight));

    const gl = offscreenCanvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      console.error("generateImageDataUrlWithSettings: Could not get WebGL context for offscreen canvas.");
      return null;
    }
    
    const vsSource = 
      'attribute vec4 a_position;' + '\n' +
      'attribute vec2 a_texCoord;' + '\n' +
      'uniform float u_rotationAngle;' + '\n' +
      'uniform vec2 u_scale;' + '\n' +
      'uniform vec2 u_crop_tex_scale;' + '\n' +
      'uniform vec2 u_crop_tex_offset;' + '\n' +
      'varying highp vec2 v_textureCoord;' + '\n' +
      'void main(void) {' + '\n' +
      '  gl_Position = a_position;' + '\n' +
      '  vec2 texCoord = a_texCoord;' + '\n' +
      '  texCoord -= 0.5;' + '\n' +
      '  texCoord *= u_scale;' + '\n' +
      '  float c90 = cos(u_rotationAngle);' + '\n' +
      '  float s90 = sin(u_rotationAngle);' + '\n' +
      '  mat2 rotation90Matrix = mat2(c90, -s90, s90, c90);' + '\n' + // Corrected for CW image rotation
      '  texCoord = rotation90Matrix * texCoord;' + '\n' +
      '  texCoord *= u_crop_tex_scale;' + '\n' +
      '  texCoord += u_crop_tex_offset;' + '\n' +
      '  texCoord += 0.5;' + '\n' +
      '  v_textureCoord = texCoord;' + '\n' +
      '}';

    const fsSource = 
      'precision mediump float;' + '\n' +
      'varying highp vec2 v_textureCoord;' + '\n' +
      'uniform sampler2D u_sampler;' + '\n' +
      'uniform sampler2D u_grainSampler;' + '\n' +
      'uniform vec2 u_noiseTextureResolution;' + '\n' +
      'uniform float u_brightness;' + '\n' +
      'uniform float u_contrast;' + '\n' +
      'uniform float u_saturation;' + '\n' +
      'uniform float u_vibrance;' + '\n' +
      'uniform float u_exposure;' + '\n' +
      'uniform float u_highlights;' + '\n' +
      'uniform float u_shadows;' + '\n' +
      'uniform float u_whites;' + '\n' +
      'uniform float u_blacks;' + '\n' +
      'uniform float u_hueValue;' + '\n' +
      'uniform float u_temperatureShift;' + '\n' +
      'uniform vec3 u_tintShadowsColorRGB;' + '\n' +
      'uniform float u_tintShadowsIntensityFactor;' + '\n' +
      'uniform float u_tintShadowsSaturationValue;' + '\n' +
      'uniform vec3 u_tintHighlightsColorRGB;' + '\n' +
      'uniform float u_tintHighlightsIntensityFactor;' + '\n' +
      'uniform float u_tintHighlightsSaturationValue;' + '\n' +
      'uniform float u_vignetteIntensity;' + '\n' +
      'uniform float u_grainIntensity;' + '\n' +
      'uniform float u_time;' + '\n' +
      'uniform vec2 u_resolution;' + '\n' +
      'uniform int u_selectedColorTargetIndex;' + '\n' +
      'uniform float u_hueAdjustment;' + '\n' +
      'uniform float u_saturationAdjustment;' + '\n' +
      'uniform float u_luminanceAdjustment;' + '\n' +

      'vec3 rgbToHsv(vec3 c) {' + '\n' +
      '    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);' + '\n' +
      '    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));' + '\n' +
      '    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));' + '\n' +
      '    float d = q.x - min(q.w, q.y);' + '\n' +
      '    float e = 1.0e-10;' + '\n' +
      '    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);' + '\n' +
      '}' + '\n' +

      'vec3 hsvToRgb(vec3 c) {' + '\n' +
      '    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);' + '\n' +
      '    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);' + '\n' +
      '    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);' + '\n' +
      '}' + '\n' +

      'vec3 desaturate(vec3 color, float saturationFactor) {' + '\n' +
      '    float luma = dot(color, vec3(0.299, 0.587, 0.114));' + '\n' +
      '    return mix(vec3(luma), color, saturationFactor);' + '\n' +
      '}' + '\n' +

      'float random(vec2 st) {' + '\n' +
      '  return fract(sin(dot(st.xy + u_time * 0.01, vec2(12.9898,78.233))) * 43758.5453123);' + '\n' +
      '}' + '\n' +

      'const float HUE_RED_MAX = 0.05;' + '\n' + // Example values, adjust as needed
      'const float HUE_RED_MIN = 0.95;' + '\n' +
      'const float HUE_ORANGE_MIN = 0.05;' + '\n' +
      'const float HUE_ORANGE_MAX = 0.12;' + '\n' +
      'const float HUE_YELLOW_MIN = 0.12;' + '\n' +
      'const float HUE_YELLOW_MAX = 0.20;' + '\n' +
      'const float HUE_GREEN_MIN = 0.20;' + '\n' +
      'const float HUE_GREEN_MAX = 0.45;' + '\n' +
      'const float HUE_CYAN_MIN = 0.45;' + '\n' +
      'const float HUE_CYAN_MAX = 0.55;' + '\n' +
      'const float HUE_BLUE_MIN = 0.55;' + '\n' +
      'const float HUE_BLUE_MAX = 0.70;' + '\n' +
      'const float HUE_PURPLE_MIN = 0.70;' + '\n' +
      'const float HUE_PURPLE_MAX = 0.80;' + '\n' +
      'const float HUE_MAGENTA_MIN = 0.80;' + '\n' +
      'const float HUE_MAGENTA_MAX = 0.95;' + '\n' +

      'void main(void) {' + '\n' +
      '  vec4 textureColor = texture2D(u_sampler, v_textureCoord);' + '\n' +
      '  vec3 color = textureColor.rgb;' + '\n' +

      // Basic Adjustments
      '  color *= u_brightness;' + '\n' +
      '  color = (color - 0.5) * u_contrast + 0.5;' + '\n' +
      '  float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));' + '\n' +
      '  color = mix(vec3(luma_sat), color, u_saturation);' + '\n' +
      
      '  if (u_vibrance != 0.0) {' + '\n' +
      '      vec3 vibrance_input_color = color;' + '\n' +
      '      float luma_vib = dot(vibrance_input_color, vec3(0.299, 0.587, 0.114));' + '\n' +
      '      float Cmax = max(vibrance_input_color.r, max(vibrance_input_color.g, vibrance_input_color.b));' + '\n' +
      '      float Cmin = min(vibrance_input_color.r, min(vibrance_input_color.g, vibrance_input_color.b));' + '\n' +
      '      float current_pixel_saturation_metric = Cmax - Cmin;' + '\n' +
      '      float vibrance_effect_strength = u_vibrance * 1.2;' + '\n' +
      '      if (vibrance_effect_strength > 0.0) {' + '\n' +
      '        color = mix(vec3(luma_vib), vibrance_input_color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));' + '\n' +
      '      } else {' + '\n' +
      '        color = mix(vibrance_input_color, vec3(luma_vib), -vibrance_effect_strength);' + '\n' +
      '      }' + '\n' +
      '  }' + '\n' +

      '  color *= pow(2.0, u_exposure);' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +

      '  if (u_shadows != 0.0) {' + '\n' +
      '      float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
      '      color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial));' + '\n' +
      '  }' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +

      '  if (u_highlights != 0.0) {' + '\n' +
      '      float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
      '      color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);' + '\n' +
      '  }' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +

      '  float black_point_adjust = u_blacks * 0.15;' + '\n' +
      '  float white_point_adjust = 1.0 + u_whites * 0.15;' + '\n' +
      '  white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001);' + '\n' +
      '  color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);' + '\n' +

      // Hue and Temperature
      '  if (u_hueValue != 0.0) {' + '\n' +
      '      vec3 hsv_hue = rgbToHsv(color);' + '\n' +
      '      hsv_hue.x = mod(hsv_hue.x + u_hueValue, 1.0);' + '\n' +
      '      color = hsvToRgb(hsv_hue);' + '\n' +
      '  }' + '\n' +

      '  if (u_temperatureShift != 0.0) {' + '\n' +
      '      float temp_strength = u_temperatureShift * 0.3;' + '\n' +
      '      color.r += temp_strength;' + '\n' +
      '      color.b -= temp_strength;' + '\n' +
      '  }' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +

      // Tinting
      '  float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
      '  if (u_tintShadowsIntensityFactor > 0.001) {' + '\n' +
      '    vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);' + '\n' +
      '    float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint);' + '\n' +
      '    color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);' + '\n' +
      '  }' + '\n' +
      '  if (u_tintHighlightsIntensityFactor > 0.001) {' + '\n' +
      '    vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);' + '\n' +
      '    float highlightMask = smoothstep(0.55, 1.0, luma_tint);' + '\n' +
      '    color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);' + '\n' +
      '  }' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +

      // Selective Color
      '  if (u_selectedColorTargetIndex != -1 && (u_hueAdjustment != 0.0 || u_saturationAdjustment != 0.0 || u_luminanceAdjustment != 0.0)) {' + '\n' +
      '      vec3 hsv_selective = rgbToHsv(color);' + '\n' +
      '      bool colorMatch = false;' + '\n' +
      '      if (u_selectedColorTargetIndex == 0) { if (hsv_selective.x >= HUE_RED_MIN || hsv_selective.x < HUE_RED_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 1) { if (hsv_selective.x >= HUE_ORANGE_MIN && hsv_selective.x < HUE_ORANGE_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 2) { if (hsv_selective.x >= HUE_YELLOW_MIN && hsv_selective.x < HUE_YELLOW_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 3) { if (hsv_selective.x >= HUE_GREEN_MIN && hsv_selective.x < HUE_GREEN_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 4) { if (hsv_selective.x >= HUE_CYAN_MIN && hsv_selective.x < HUE_CYAN_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 5) { if (hsv_selective.x >= HUE_BLUE_MIN && hsv_selective.x < HUE_BLUE_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 6) { if (hsv_selective.x >= HUE_PURPLE_MIN && hsv_selective.x < HUE_PURPLE_MAX) colorMatch = true; }' + '\n' +
      '      else if (u_selectedColorTargetIndex == 7) { if (hsv_selective.x >= HUE_MAGENTA_MIN && hsv_selective.x < HUE_MAGENTA_MAX) colorMatch = true; }' + '\n' +
      '      if (colorMatch) {' + '\n' +
      '          hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0);' + '\n' +
      '          hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0);' + '\n' +
      '          hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0);' + '\n' +
      '          color = hsvToRgb(hsv_selective);' + '\n' +
      '      }' + '\n' +
      '  }' + '\n' +
      '  color = clamp(color, 0.0, 1.0);' + '\n' +
       
      // Effects
      '  if (u_vignetteIntensity > 0.001) {' + '\n' +
      '      float vignetteRadius = 0.7;' + '\n' +
      '      float vignetteSoftness = 0.6;' + '\n' +
      '      float dist_vignette = distance(v_textureCoord, vec2(0.5));' + '\n' +
      '      float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);' + '\n' +
      '      color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);' + '\n' +
      '  }' + '\n' +

      '  if (u_grainIntensity > 0.001) {' + '\n' +
      '    float grain_scale_factor = u_resolution.y > 0.0 ? 50.0 / u_resolution.y : 1.0;' + '\n' +
      '    vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor;' + '\n' +
      '    float grain_noise = (random(grainCoord) - 0.5) * 0.15;' + '\n' + 
      '    color.rgb += grain_noise * u_grainIntensity;' + '\n' +
      '  }' + '\n' +
      
      '  gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);' + '\n' +
      '}';
    
    const loadShader = (glContext: WebGLRenderingContext, type: number, source: string): WebGLShader | null => { 
        const shader = glContext.createShader(type); 
        if (!shader) return null; 
        glContext.shaderSource(shader, source); 
        glContext.compileShader(shader); 
        if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) { 
            console.error('An error occurred compiling the export shader: ' + glContext.getShaderInfoLog(shader)); 
            glContext.deleteShader(shader); return null; 
        } 
        return shader; 
    };
    const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { 
        console.error('Unable to initialize the export shader program: ' + gl.getProgramInfoLog(program)); 
        return null; 
    }
    
    const programInfo = {
        program: program,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'a_position'),
            textureCoord: gl.getAttribLocation(program, 'a_texCoord'),
        },
        uniformLocations: { 
            sampler: gl.getUniformLocation(program, 'u_sampler'),
            brightness: gl.getUniformLocation(program, 'u_brightness'),
            contrast: gl.getUniformLocation(program, 'u_contrast'),
            saturation: gl.getUniformLocation(program, 'u_saturation'),
            vibrance: gl.getUniformLocation(program, 'u_vibrance'),
            exposure: gl.getUniformLocation(program, 'u_exposure'),
            highlights: gl.getUniformLocation(program, 'u_highlights'),
            shadows: gl.getUniformLocation(program, 'u_shadows'),
            whites: gl.getUniformLocation(program, 'u_whites'),
            blacks: gl.getUniformLocation(program, 'u_blacks'),
            hueValue: gl.getUniformLocation(program, 'u_hueValue'),
            temperatureShift: gl.getUniformLocation(program, 'u_temperatureShift'),
            tintShadowsColorRGB: gl.getUniformLocation(program, 'u_tintShadowsColorRGB'),
            tintShadowsIntensityFactor: gl.getUniformLocation(program, 'u_tintShadowsIntensityFactor'),
            tintShadowsSaturationValue: gl.getUniformLocation(program, 'u_tintShadowsSaturationValue'),
            tintHighlightsColorRGB: gl.getUniformLocation(program, 'u_tintHighlightsColorRGB'),
            tintHighlightsIntensityFactor: gl.getUniformLocation(program, 'u_tintHighlightsIntensityFactor'),
            tintHighlightsSaturationValue: gl.getUniformLocation(program, 'u_tintHighlightsSaturationValue'),
            vignetteIntensity: gl.getUniformLocation(program, 'u_vignetteIntensity'),
            grainIntensity: gl.getUniformLocation(program, 'u_grainIntensity'),
            time: gl.getUniformLocation(program, 'u_time'),
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            rotationAngle: gl.getUniformLocation(program, 'u_rotationAngle'),
            scale: gl.getUniformLocation(program, 'u_scale'),
            cropTexScale: gl.getUniformLocation(program, 'u_crop_tex_scale'),
            cropTexOffset: gl.getUniformLocation(program, 'u_crop_tex_offset'),
            selectedColorTargetIndex: gl.getUniformLocation(program, 'u_selectedColorTargetIndex'),
            hueAdjustment: gl.getUniformLocation(program, 'u_hueAdjustment'),
            saturationAdjustment: gl.getUniformLocation(program, 'u_saturationAdjustment'),
            luminanceAdjustment: gl.getUniformLocation(program, 'u_luminanceAdjustment'),
            grainSampler: gl.getUniformLocation(program, 'u_grainSampler'),
            noiseTextureResolution: gl.getUniformLocation(program, 'u_noiseTextureResolution'),
        }
    };
    
    const positionBuffer = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,  -1,-1,  1,1,  1,1,  -1,-1,  1,-1]), gl.STATIC_DRAW); // Two triangles for a quad
    
    const textureCoordBuffer = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer); 
    // Texture coords for two triangles: (0,1 top-left), (0,0 bottom-left), (1,1 top-right), (1,1 top-right), (0,0 bottom-left), (1,0 bottom-right)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1,  0,0,  1,1,  1,1,  0,0,  1,0]), gl.STATIC_DRAW);
    
    const buffers = { position: positionBuffer, textureCoord: textureCoordBuffer };

    drawImageWithSettingsToContext(gl, imageElement, settingsToApply, programInfo, buffers, noiseImageDataRef.current, offscreenCanvas.width, offscreenCanvas.height);
    
    const dataUrl = offscreenCanvas.toDataURL(type, quality);

    gl.deleteBuffer(buffers.position);
    gl.deleteBuffer(buffers.textureCoord);
    gl.deleteProgram(programInfo.program);
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    
    // Try to lose context if available
    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    if (loseContextExt) {
        loseContextExt.loseContext();
    }


    return dataUrl;

  }, [drawImageWithSettingsToContext, noiseImageDataRef]); 


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
        noiseImageDataRef,
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

    