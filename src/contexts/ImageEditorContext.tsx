
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
  // hueRotate: number; // Removed for WebGL implementation, will be part of selective color or a dedicated effect
  // filter: string | null; // Presets also depend on ctx.filter, removed for WebGL
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
  // tiltAngle: number; // -45 to 45 degrees, default 0
  // Selective Color
  selectiveColors: SelectiveColors;
  activeSelectiveColorTarget: SelectiveColorTarget;
  hueRotate: number; // Re-added for WebGL
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
  // filter: null, // Removed
  vignetteIntensity: 0,
  grainIntensity: 0,
  colorTemperature: 0,
  tintShadowsColor: '#808080', // Default gray, can be changed
  tintShadowsIntensity: 0,
  tintShadowsSaturation: 1,
  tintHighlightsColor: '#808080', // Default gray, can be changed
  tintHighlightsIntensity: 0,
  tintHighlightsSaturation: 1,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  cropZoom: 1,
  cropOffsetX: 0,
  cropOffsetY: 0,
  // tiltAngle: 0, // Removed
  selectiveColors: initialSelectiveColors,
  activeSelectiveColorTarget: 'reds',
  hueRotate: 0, // Re-added
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
  // | { type: 'APPLY_FILTER'; payload: string | null } // Removed
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
  // | { type: 'SET_TILT_ANGLE'; payload: number } // Removed
  | { type: 'RESET_SETTINGS' }
  | { type: 'LOAD_SETTINGS'; payload: ImageSettings }
  | { type: 'RESET_CROP_AND_TRANSFORMS' }
  | { type: 'SET_ACTIVE_SELECTIVE_COLOR_TARGET'; payload: SelectiveColorTarget }
  | { type: 'SET_SELECTIVE_COLOR_ADJUSTMENT'; payload: { target: SelectiveColorTarget; adjustment: Partial<SelectiveColorAdjustment> } }
  | { type: 'SET_HUE_ROTATE'; payload: number }; // Re-added


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
    // case 'APPLY_FILTER': // Removed
    //   return { ...state, filter: action.payload };
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
    // case 'SET_TILT_ANGLE': // Removed
    //   return { ...state, tiltAngle: action.payload };
    case 'RESET_CROP_AND_TRANSFORMS':
      return {
        ...state,
        cropZoom: 1,
        cropOffsetX: 0,
        cropOffsetY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        // tiltAngle: 0, // Removed
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
        // tiltAngle: state.tiltAngle, // Removed
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
    case 'SET_HUE_ROTATE': // Re-added
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
  // exifData: object | null; // Removed
}

interface ImageEditorContextType {
  originalImage: HTMLImageElement | null; // Represents the imageElement of the activeImageId
  settings: ImageSettings; // Represents the settings of the activeImageId
  dispatchSettings: Dispatch<SettingsAction>;
  baseFileName: string; // Represents the baseFileName of the activeImageId
  allImages: ImageObject[];
  activeImageId: string | null;
  addImageObject: (imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl'>) => void;
  removeImage: (id: string) => void;
  setActiveImageId: (id: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: (type?: string, quality?: number) => string | null; // Made parameters optional, defaults to JPEG for WebGL
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) => Promise<string | null>;
  isPreviewing: boolean;
  setIsPreviewing: (isPreviewing: boolean) => void;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
  noiseImageDataRef: RefObject<ImageData | null>; // For WebGL grain effect
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
  return thumbCanvas.toDataURL('image/jpeg', 0.8); // Thumbnail as JPEG
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
    // Update settings of the active image in allImages array when currentSettings change
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
      // exifData: imageData.exifData, // Removed
    };
    setAllImages(prev => [...prev, newImageObject]);
    setActiveImageIdInternal(newId); // Automatically set new image as active
  }, []);

  const removeImage = useCallback((id: string) => {
    setAllImages(prev => {
      const remainingImages = prev.filter(img => img.id !== id);
      if (activeImageId === id) {
        // If active image is removed, set the first remaining image as active, or null if no images left
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
      // No active image, reset to initial state
      setCurrentActiveImageElement(null);
      setCurrentBaseFileName('retrograin_image');
      dispatchSettings({ type: 'RESET_SETTINGS' });
    }
  }, [allImages]); // Dependency on allImages ensures we re-evaluate if allImages changes

  // Effect to set the first image as active if no active image is set and images are available
  useEffect(() => {
    if (allImages.length > 0 && !activeImageId) {
      setActiveImageId(allImages[0].id);
    } else if (allImages.length === 0 && activeImageId) {
      // If all images are removed, clear active image related states
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
      _programInfo: any, // Simplified ProgramInfo for this context
      _buffers: any, // Simplified Buffers for this context
      _currentNoiseImageData: ImageData | null, // Pass ImageData for noise
      targetWidth: number,
      targetHeight: number
    ): void => {
        if (!_ctx || !_image || !_programInfo || !_buffers) return;

        const gl = _ctx;

        gl.useProgram(_programInfo.program);

        // Setup attributes: position and texture coordinates
        gl.bindBuffer(gl.ARRAY_BUFFER, _buffers.position);
        gl.vertexAttribPointer(_programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(_programInfo.attribLocations.vertexPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, _buffers.textureCoord);
        gl.vertexAttribPointer(_programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(_programInfo.attribLocations.textureCoord);
        
        // Load image into texture
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


        // Set uniforms from settings
        if (_programInfo.uniformLocations.sampler) gl.uniform1i(_programInfo.uniformLocations.sampler, 0); // Texture unit 0
        
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
        
        // Tint uniforms require hexToRgbNormalizedArray, which is a util function.
        // This part might need to be adjusted if hexToRgbNormalizedArray isn't directly available or appropriate here.
        // For simplicity, assuming colors are already in a format the shader expects or are converted before this call.
        // Placeholder for tint color conversion if needed:
        // const shadowRgb = hexToRgbNormalizedArray(_settings.tintShadowsColor);
        // if (_programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
        // Similar for highlights...
        // For now, these are omitted for brevity as they involve external utils or direct shader vec3 inputs

        // Effects
        if (_programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(_programInfo.uniformLocations.vignetteIntensity, _settings.vignetteIntensity);
        if (_programInfo.uniformLocations.grainIntensity) gl.uniform1f(_programInfo.uniformLocations.grainIntensity, _settings.grainIntensity);
        if (_programInfo.uniformLocations.time) gl.uniform1f(_programInfo.uniformLocations.time, performance.now() / 1000.0);
        if (_programInfo.uniformLocations.resolution) gl.uniform2f(_programInfo.uniformLocations.resolution, targetWidth, targetHeight);

        // Transforms (Rotation, Scale for flip)
        let rotationInRadians = 0;
        switch (_settings.rotation) {
            case 90: rotationInRadians = Math.PI / 2; break;
            case 180: rotationInRadians = Math.PI; break;
            case 270: rotationInRadians = (3 * Math.PI) / 2; break;
        }
        if (_programInfo.uniformLocations.rotationAngle) gl.uniform1f(_programInfo.uniformLocations.rotationAngle, rotationInRadians);
        if (_programInfo.uniformLocations.scale) gl.uniform2f(_programInfo.uniformLocations.scale, _settings.scaleX, _settings.scaleY);
        
        // Crop/Pan/Zoom transforms for WebGL
        const autoZoomFactor = 1.0; // Simplified for this context, tilt was removed
        const totalEffectiveZoom = _settings.cropZoom * autoZoomFactor;
        const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
        const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0);
        const texOffsetX = _settings.cropOffsetX * maxTexOffset;
        const texOffsetY = _settings.cropOffsetY * maxTexOffset * -1.0; // Inverted for intuitive pan
        const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

        if (_programInfo.uniformLocations.cropTexScale) gl.uniform2fv(_programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
        if (_programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(_programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);

        // Selective Color - map target string to index
        const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
        const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(_settings.activeSelectiveColorTarget);
        
        if (_programInfo.uniformLocations.selectedColorTargetIndex && targetIndex !== -1) {
          gl.uniform1i(_programInfo.uniformLocations.selectedColorTargetIndex, targetIndex);
        } else if (_programInfo.uniformLocations.selectedColorTargetIndex) {
          gl.uniform1i(_programInfo.uniformLocations.selectedColorTargetIndex, -1); // No target or invalid
        }

        const currentSelective = _settings.selectiveColors[_settings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
        if (_programInfo.uniformLocations.hueAdjustment) gl.uniform1f(_programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
        if (_programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(_programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
        if (_programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(_programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

        // Grain for export - using _currentNoiseImageData
        if (_settings.grainIntensity > 0.001 && _currentNoiseImageData && _programInfo.uniformLocations.grainSampler && _programInfo.uniformLocations.noiseTextureResolution) {
            const noiseTexture = gl.createTexture();
            if (noiseTexture) {
                gl.activeTexture(gl.TEXTURE1); // Use texture unit 1 for noise
                gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, _currentNoiseImageData.width, _currentNoiseImageData.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, _currentNoiseImageData);
                
                gl.uniform1i(_programInfo.uniformLocations.grainSampler, 1); // Tell shader noise is on texture unit 1
                gl.uniform2f(_programInfo.uniformLocations.noiseTextureResolution, _currentNoiseImageData.width, _currentNoiseImageData.height);

                // Activate main image texture on unit 0 again before drawing
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, texture); // Rebind main image texture
            }
        }


        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.deleteTexture(texture); // Clean up texture used for this draw
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
    
    // Determine target dimensions for export based on original image and cropZoom
    let exportWidth = imageElement.naturalWidth / settingsToApply.cropZoom;
    let exportHeight = imageElement.naturalHeight / settingsToApply.cropZoom;

    // Adjust for 90/270 degree rotations
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
    
    // Minimal shaders for export - these should match ImageCanvas.tsx's shaders
    // Ideally, shader sources are defined once and imported. For brevity:
    const vsSource = `
      attribute vec4 a_position;
      attribute vec2 a_texCoord;
      uniform float u_rotationAngle;
      uniform vec2 u_scale;
      uniform vec2 u_crop_tex_scale;
      uniform vec2 u_crop_tex_offset;
      varying highp vec2 v_textureCoord;
      void main(void) {
        gl_Position = a_position;
        vec2 texCoord = a_texCoord;
        texCoord -= 0.5;
        texCoord *= u_scale;
        float c90 = cos(u_rotationAngle);
        float s90 = sin(u_rotationAngle);
        mat2 rotation90Matrix = mat2(c90, s90, -s90, c90);
        texCoord = rotation90Matrix * texCoord;
        texCoord *= u_crop_tex_scale;
        texCoord += u_crop_tex_offset;
        texCoord += 0.5;
        v_textureCoord = texCoord;
      }
    `;
    // Fragment shader for export should also include all effects
    const fsSource = \`
      precision mediump float;
      varying highp vec2 v_textureCoord;
      uniform sampler2D u_sampler;
      uniform sampler2D u_grainSampler; // For grain if implemented in shader
      uniform vec2 u_noiseTextureResolution; // For grain

      uniform float u_brightness;
      uniform float u_contrast;
      uniform float u_saturation;
      uniform float u_vibrance;
      uniform float u_exposure;
      uniform float u_highlights;
      uniform float u_shadows;
      uniform float u_whites;
      uniform float u_blacks;
      uniform float u_hueValue;
      uniform float u_temperatureShift;
      uniform vec3 u_tintShadowsColorRGB;
      uniform float u_tintShadowsIntensityFactor;
      uniform float u_tintShadowsSaturationValue;
      uniform vec3 u_tintHighlightsColorRGB;
      uniform float u_tintHighlightsIntensityFactor;
      uniform float u_tintHighlightsSaturationValue;
      uniform float u_vignetteIntensity;
      uniform float u_grainIntensity;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform int u_selectedColorTargetIndex;
      uniform float u_hueAdjustment;
      uniform float u_saturationAdjustment;
      uniform float u_luminanceAdjustment;

      vec3 rgbToHsv(vec3 c) { /* ... HSV conversion ... */ vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0); vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g)); vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r)); float d = q.x - min(q.w, q.y); float e = 1.0e-10; return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x); }
      vec3 hsvToRgb(vec3 c) { /* ... HSV conversion ... */ vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0); vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www); return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y); }
      vec3 desaturate(vec3 color, float saturationFactor) { float luma = dot(color, vec3(0.299, 0.587, 0.114)); return mix(vec3(luma), color, saturationFactor); }
      float random(vec2 st) { vec2 st_anim = st + u_time * 0.01; return fract(sin(dot(st_anim.xy, vec2(12.9898,78.233))) * 43758.5453123); }
      
      // Hue ranges (normalized 0-1, approximate)
      const float HUE_RED_MAX = 0.05; const float HUE_RED_MIN = 0.95; 
      const float HUE_ORANGE_MIN = 0.05; const float HUE_ORANGE_MAX = 0.12;
      const float HUE_YELLOW_MIN = 0.12; const float HUE_YELLOW_MAX = 0.20;
      const float HUE_GREEN_MIN = 0.20; const float HUE_GREEN_MAX = 0.45;
      const float HUE_CYAN_MIN = 0.45; const float HUE_CYAN_MAX = 0.55;
      const float HUE_BLUE_MIN = 0.55; const float HUE_BLUE_MAX = 0.70;
      const float HUE_PURPLE_MIN = 0.70; const float HUE_PURPLE_MAX = 0.80;
      const float HUE_MAGENTA_MIN = 0.80; const float HUE_MAGENTA_MAX = 0.95;

      void main(void) {
        vec4 textureColor = texture2D(u_sampler, v_textureCoord);
        vec3 color = textureColor.rgb;

        color *= u_brightness;
        color = (color - 0.5) * u_contrast + 0.5;
        
        float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luma_sat), color, u_saturation);

        if (u_vibrance != 0.0) {
            vec3 vibrance_input_color = color; 
            float luma_vib = dot(vibrance_input_color, vec3(0.299, 0.587, 0.114));
            float Cmax = max(vibrance_input_color.r, max(vibrance_input_color.g, vibrance_input_color.b));
            float Cmin = min(vibrance_input_color.r, min(vibrance_input_color.g, vibrance_input_color.b));
            float current_pixel_saturation_metric = Cmax - Cmin;
            float vibrance_effect_strength = u_vibrance * 1.2;
            if (vibrance_effect_strength > 0.0) {
              color = mix(vec3(luma_vib), vibrance_input_color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));
            } else {
              color = mix(vibrance_input_color, vec3(luma_vib), -vibrance_effect_strength);
            }
        }
        
        color *= pow(2.0, u_exposure);
        color = clamp(color, 0.0, 1.0); 
        
        if (u_shadows != 0.0) {
            float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
        }
        color = clamp(color, 0.0, 1.0);
        
        if (u_highlights != 0.0) {
            float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);
        }
        color = clamp(color, 0.0, 1.0);

        float black_point_adjust = u_blacks * 0.15; 
        float white_point_adjust = 1.0 + u_whites * 0.15; 
        white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001);
        color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);
        color = clamp(color, 0.0, 1.0);

        if (u_hueValue != 0.0) {
            vec3 hsv_hue = rgbToHsv(color);
            hsv_hue.x = mod(hsv_hue.x + u_hueValue, 1.0);
            color = hsvToRgb(hsv_hue);
        }

        if (u_temperatureShift != 0.0) {
            float temp_strength = u_temperatureShift * 0.3;
            color.r += temp_strength;
            color.b -= temp_strength;
        }
        color = clamp(color, 0.0, 1.0);

        float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));
        if (u_tintShadowsIntensityFactor > 0.001) {
          vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
          float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint);
          color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
        }
        if (u_tintHighlightsIntensityFactor > 0.001) {
          vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
          float highlightMask = smoothstep(0.55, 1.0, luma_tint);
          color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
        }
        color = clamp(color, 0.0, 1.0);

        if (u_hueAdjustment != 0.0 || u_saturationAdjustment != 0.0 || u_luminanceAdjustment != 0.0) {
            vec3 hsv_selective = rgbToHsv(color);
            bool colorMatch = false;
            if (u_selectedColorTargetIndex == 0) { if (hsv_selective.x >= HUE_RED_MIN || hsv_selective.x < HUE_RED_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 1) { if (hsv_selective.x >= HUE_ORANGE_MIN && hsv_selective.x < HUE_ORANGE_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 2) { if (hsv_selective.x >= HUE_YELLOW_MIN && hsv_selective.x < HUE_YELLOW_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 3) { if (hsv_selective.x >= HUE_GREEN_MIN && hsv_selective.x < HUE_GREEN_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 4) { if (hsv_selective.x >= HUE_CYAN_MIN && hsv_selective.x < HUE_CYAN_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 5) { if (hsv_selective.x >= HUE_BLUE_MIN && hsv_selective.x < HUE_BLUE_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 6) { if (hsv_selective.x >= HUE_PURPLE_MIN && hsv_selective.x < HUE_PURPLE_MAX) colorMatch = true;
            } else if (u_selectedColorTargetIndex == 7) { if (hsv_selective.x >= HUE_MAGENTA_MIN && hsv_selective.x < HUE_MAGENTA_MAX) colorMatch = true;}
            if (colorMatch) {
                hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0);
                hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0);
                hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0);
                color = hsvToRgb(hsv_selective);
            }
        }
        color = clamp(color, 0.0, 1.0);
       
        if (u_vignetteIntensity > 0.001) {
            float vignetteRadius = 0.7; float vignetteSoftness = 0.6;
            float dist_vignette = distance(v_textureCoord, vec2(0.5));
            float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
            color.rgb *= mix(vignetteFactor, 1.0, 1.0 - (u_vignetteIntensity * 1.5) );
        }

        // Grain (ensure u_grainSampler, u_noiseTextureResolution are available if u_grainIntensity > 0)
        // This part needs the noise texture passed correctly
        if (u_grainIntensity > 0.001) {
            vec2 noiseTexCoord = mod(v_textureCoord * u_resolution / u_noiseTextureResolution, 1.0); // Tile noise texture
            float noiseSample = texture2D(u_grainSampler, noiseTexCoord).r; // Assuming noise is monochrome in R channel
            float grain = (noiseSample - 0.5) * 0.15; // Adjust strength/range of grain
            color.rgb += grain * u_grainIntensity;
        }
        
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);
      }
    \`;
    
    // Simplified initShaderProgram for export
    const loadShader = (glContext: WebGLRenderingContext, type: number, source: string): WebGLShader | null => { /* ... same as in ImageCanvas ... */ const shader = glContext.createShader(type); if (!shader) return null; glContext.shaderSource(shader, source); glContext.compileShader(shader); if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) { console.error('An error occurred compiling the export shader: ' + glContext.getShaderInfoLog(shader)); glContext.deleteShader(shader); return null; } return shader; };
    const vs = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return null;
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { console.error('Unable to initialize the export shader program: ' + gl.getProgramInfoLog(program)); return null; }
    
    const programInfo = {
        program: program,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(program, 'a_position'),
            textureCoord: gl.getAttribLocation(program, 'a_texCoord'),
        },
        uniformLocations: { // Get all necessary uniform locations
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
            time: gl.getUniformLocation(program, 'u_time'), // May not be needed for static export
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
    
    // Simplified initBuffers for export
    const positionBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,1,1,-1,-1,1,-1]), gl.STATIC_DRAW);
    const textureCoordBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1,1,1,0,0,1,0]), gl.STATIC_DRAW);
    const buffers = { position: positionBuffer, textureCoord: textureCoordBuffer };

    // Set viewport to match offscreen canvas size
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.0, 0.0, 0.0, 0.0); // Clear to transparent
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Call drawImageWithSettingsToContext
    drawImageWithSettingsToContext(gl, imageElement, settingsToApply, programInfo, buffers, noiseImageDataRef.current, offscreenCanvas.width, offscreenCanvas.height);
    
    // Delete WebGL resources used for this offscreen render
    gl.deleteBuffer(buffers.position);
    gl.deleteBuffer(buffers.textureCoord);
    gl.deleteProgram(programInfo.program);
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    // Consider gl.getExtension('WEBGL_lose_context')?.loseContext(); if many offscreen canvases are created.

    return offscreenCanvas.toDataURL(type, quality);

  }, [drawImageWithSettingsToContext, noiseImageDataRef]); // Added noiseImageDataRef


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
        // Preserve transforms of the target image, apply other copied settings
        const newSettings = {
          ...copiedSettings,
          rotation: targetImg.settings.rotation,
          scaleX: targetImg.settings.scaleX,
          scaleY: targetImg.settings.scaleY,
          cropZoom: targetImg.settings.cropZoom,
          cropOffsetX: targetImg.settings.cropOffsetX,
          cropOffsetY: targetImg.settings.cropOffsetY,
          // tiltAngle: targetImg.settings.tiltAngle, // Removed
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

// Helper to convert hex to normalized RGB array for WebGL uniforms
// This should ideally live in colorUtils.ts and be imported
const hexToRgbNormalizedArray = (hex: string): [number, number, number] | null => {
    if (!hex || hex === '') return [0.5, 0.5, 0.5]; // Default to gray if no color
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255,
          ]
        : [0.5, 0.5, 0.5]; // Default to gray on parse error
};
