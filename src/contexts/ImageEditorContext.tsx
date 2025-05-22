
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';

// Define color targets for selective color adjustments
export const SELECTIVE_COLOR_TARGETS = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'] as const;
export type SelectiveColorTarget = typeof SELECTIVE_COLOR_TARGETS[number];

export interface SelectiveColorAdjustment {
  hue: number;        // Shader: -0.5 to 0.5 (maps to -180 to 180 degrees). UI: -0.1 to 0.1 for finer control.
  saturation: number; // Shader: -1.0 to 1.0 (maps to -100% to 100% change). UI: -0.5 to 0.5
  luminance: number;  // Shader: -1.0 to 1.0 (maps to -100% to 100% change). UI: -0.5 to 0.5
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
  hueRotate: number; // -180 to 180 degrees for UI
  colorTemperature: number;
  tintShadowsColor: string;
  tintShadowsIntensity: number;
  tintShadowsSaturation: number;
  tintHighlightsColor: string;
  tintHighlightsIntensity: number;
  tintHighlightsSaturation: number;
  vignetteIntensity: number;
  grainIntensity: number;
  sharpness: number;
  rotation: number; 
  scaleX: number; 
  scaleY: number; 
  cropZoom: number; 
  cropOffsetX: number; 
  cropOffsetY: number; 
  selectiveColors: SelectiveColors;
  activeSelectiveColorTarget: SelectiveColorTarget;
  isViewingOriginal: boolean; // For Before/After
}

const initialSelectiveColors: SelectiveColors = SELECTIVE_COLOR_TARGETS.reduce((acc, color) => {
  acc[color] = { hue: 0, saturation: 0, luminance: 0 };
  return acc;
}, {} as SelectiveColors);

export const initialImageSettings: ImageSettings = {
  brightness: 1,
  contrast: 1, // UI: 0.75 to 1.25
  saturation: 1, // UI: 0.5 to 1.5
  vibrance: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  hueRotate: 0, // UI: -180 to 180
  colorTemperature: 0,
  tintShadowsColor: '#808080', 
  tintShadowsIntensity: 0, // UI: 0 to 0.25
  tintShadowsSaturation: 1,
  tintHighlightsColor: '#808080', 
  tintHighlightsIntensity: 0, // UI: 0 to 0.25
  tintHighlightsSaturation: 1,
  vignetteIntensity: 0,
  grainIntensity: 0,
  sharpness: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  cropZoom: 1,
  cropOffsetX: 0,
  cropOffsetY: 0,
  selectiveColors: JSON.parse(JSON.stringify(initialSelectiveColors)), // Deep clone for safety
  activeSelectiveColorTarget: 'reds',
  isViewingOriginal: false,
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
  | { type: 'SET_SHARPNESS'; payload: number }
  | { type: 'SET_COLOR_TEMPERATURE'; payload: number }
  | { type: 'SET_TINT_SHADOWS_COLOR'; payload: string }
  | { type: 'SET_TINT_SHADOWS_INTENSITY'; payload: number }
  | { type: 'SET_TINT_SHADOWS_SATURATION'; payload: number }
  | { type: 'SET_TINT_HIGHLIGHTS_COLOR'; payload: string }
  | { type: 'SET_TINT_HIGHLIGHTS_INTENSITY'; payload: number }
  | { type: 'SET_TINT_HIGHLIGHTS_SATURATION'; payload: number }
  | { type: 'SET_VIGNETTE_INTENSITY'; payload: number }
  | { type: 'SET_GRAIN_INTENSITY'; payload: number }
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
  | { type: 'SET_IS_VIEWING_ORIGINAL'; payload: boolean };


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
    case 'SET_SHARPNESS':
      return { ...state, sharpness: action.payload };
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
    case 'SET_VIGNETTE_INTENSITY':
      return { ...state, vignetteIntensity: action.payload };
    case 'SET_GRAIN_INTENSITY':
      return { ...state, grainIntensity: action.payload };
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
      // Reset offsets if zoom is effectively 1 to prevent sticking
      const newOffsetX = newZoom <= 1.001 ? 0 : state.cropOffsetX;
      const newOffsetY = newZoom <= 1.001 ? 0 : state.cropOffsetY;
      return { ...state, cropZoom: newZoom, cropOffsetX: newOffsetX, cropOffsetY: newOffsetY };
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
        // Deep clone initial settings to avoid modifying the template
        ...JSON.parse(JSON.stringify(initialImageSettings)), 
        // Preserve transforms
        rotation: state.rotation,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        cropZoom: state.cropZoom,
        cropOffsetX: state.cropOffsetX,
        cropOffsetY: state.cropOffsetY,
        isViewingOriginal: false, // Always reset this
      };
    case 'LOAD_SETTINGS':
      return { ...action.payload, isViewingOriginal: false }; // Ensure isViewingOriginal is false when loading
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
    case 'SET_IS_VIEWING_ORIGINAL':
      return { ...state, isViewingOriginal: action.payload };
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
  addImageObject: (imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl' | 'settings'> & { settings?: Partial<ImageSettings>}) => void;
  removeImage: (id: string) => void;
  setActiveImageId: (id: string | null) => void;
  canvasRef: RefObject<HTMLCanvasElement>;
  getCanvasDataURL: (type?: string, quality?: number) => string | null; // Kept for WebGL direct export
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) => Promise<string | null>;
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
  if (!thumbCtx) return '';

  let { naturalWidth: width, naturalHeight: height } = imageElement;
  const aspectRatio = width / height;

  if (width > THUMBNAIL_MAX_WIDTH || height > THUMBNAIL_MAX_HEIGHT) {
    if (aspectRatio > 1) { // Landscape or square
      width = THUMBNAIL_MAX_WIDTH;
      height = Math.round(width / aspectRatio);
    } else { // Portrait
      height = THUMBNAIL_MAX_HEIGHT;
      width = Math.round(height * aspectRatio);
    }
    // Final check if the other dimension now exceeds its max due to aspect ratio
    if (width > THUMBNAIL_MAX_WIDTH) {
        width = THUMBNAIL_MAX_WIDTH;
        height = Math.round(width / aspectRatio);
    }
    if (height > THUMBNAIL_MAX_HEIGHT) {
        height = THUMBNAIL_MAX_HEIGHT;
        width = Math.round(height * aspectRatio);
    }
  }

  thumbCanvas.width = Math.max(1, width);
  thumbCanvas.height = Math.max(1, height);
  thumbCtx.drawImage(imageElement, 0, 0, thumbCanvas.width, thumbCanvas.height);
  return thumbCanvas.toDataURL('image/jpeg', THUMBNAIL_JPEG_QUALITY);
};


// Vertex Shader for offscreen rendering (minimal)
const offscreenVsSource = 
  'attribute vec4 a_position;' + '\n' +
  'attribute vec2 a_texCoord;' + '\n' +
  'varying highp vec2 v_textureCoord;' + '\n' +
  'void main(void) {' + '\n' +
  '  gl_Position = a_position;' + '\n' +
  '  v_textureCoord = a_texCoord;' + '\n' +
  '}';


export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [allImages, setAllImages] = useState<ImageObject[]>([]);
  const [activeImageId, setActiveImageIdInternal] = useState<string | null>(null);

  const [currentActiveImageElement, setCurrentActiveImageElement] = useState<HTMLImageElement | null>(null);
  const [currentBaseFileName, setCurrentBaseFileName] = useState<string>('retrograin_image');
  const [currentSettings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);

  const canvasRef = useRef<HTMLCanvasElement>(null); // Main display canvas
  const [copiedSettings, setCopiedSettings] = useState<ImageSettings | null>(null);
  const noiseImageDataRef = useRef<ImageData | null>(null);


  // Save current settings to the active image object when currentSettings change
  useEffect(() => {
    if (activeImageId) {
      setAllImages(prevImages =>
        prevImages.map(img =>
          img.id === activeImageId ? { ...img, settings: { ...currentSettings } } : img
        )
      );
    }
  }, [currentSettings, activeImageId]);

  const addImageObject = useCallback((imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl' | 'settings'> & { settings?: Partial<ImageSettings>}) => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
    const thumbnailDataUrl = generateThumbnail(imageData.imageElement);
    const newImageObject: ImageObject = {
      ...imageData,
      id: newId,
      settings: JSON.parse(JSON.stringify(initialImageSettings)), // Ensure new images get fresh default settings
      thumbnailDataUrl,
    };
    setAllImages(prev => [...prev, newImageObject]);
    setActiveImageIdInternal(newId); 
  }, []);

  const removeImage = useCallback((id: string) => {
    setAllImages(prev => {
      const remainingImages = prev.filter(img => img.id !== id);
      if (activeImageId === id) {
        const newActiveId = remainingImages.length > 0 ? remainingImages[0].id : null;
        setActiveImageIdInternal(newActiveId);
         if (!newActiveId) { // If no images left, reset settings
            setCurrentActiveImageElement(null);
            setCurrentBaseFileName('retrograin_image');
            dispatchSettings({ type: 'RESET_SETTINGS' });
        }
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
  }, [allImages]); // allImages is a dependency

  useEffect(() => {
    if (allImages.length > 0 && !activeImageId) {
      setActiveImageId(allImages[0].id);
    } else if (allImages.length === 0 && activeImageId) {
      setActiveImageId(null); // Resets settings via its own logic
    }
  }, [allImages, activeImageId, setActiveImageId]);


  const getCanvasDataURL = useCallback((type: string = 'image/jpeg', quality: number = 0.92): string | null => {
    const currentCanvas = canvasRef.current;
    if (!currentCanvas || !currentActiveImageElement) {
      console.warn("getCanvasDataURL: Main canvas or original image not available for WebGL export.");
      return null;
    }
    try {
      // Ensure drawing buffer is up-to-date if settings changed but not yet rendered in an animation frame
      // This is tricky; ideally, export happens after a confirmed render.
      // For simplicity, assume it's reasonably up-to-date or an explicit "apply" action is needed.
      return currentCanvas.toDataURL(type, quality);
    } catch (e) {
      console.error("Error getting data URL from WebGL canvas:", e);
      return null;
    }
  }, [canvasRef, currentActiveImageElement]);


const drawImageWithSettingsToContext = useCallback(
    (
      _gl: WebGLRenderingContext,
      _canvas: HTMLCanvasElement,
      _image: HTMLImageElement,
      _settings: ImageSettings,
      _programInfo: any, 
      _buffers: any, 
      currentNoiseImageData: ImageData | null
    ): void => {
        if (!_gl || !_image || !_programInfo || !_buffers || !_canvas) {
          console.error("drawImageWithSettingsToContext: Missing GL context, canvas, image, programInfo, or buffers.");
          return;
        }

        const { hexToRgbNormalizedArray } = require('@/lib/colorUtils'); 

        _gl.viewport(0, 0, _gl.drawingBufferWidth, _gl.drawingBufferHeight);
        _gl.clearColor(0.188, 0.188, 0.188, 1.0); 
        _gl.clear(_gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT);

        _gl.useProgram(_programInfo.program);

        // Bind attribute buffers
        _gl.bindBuffer(_gl.ARRAY_BUFFER, _buffers.position);
        _gl.vertexAttribPointer(_programInfo.attribLocations.vertexPosition, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(_programInfo.attribLocations.vertexPosition);

        _gl.bindBuffer(_gl.ARRAY_BUFFER, _buffers.textureCoord);
        _gl.vertexAttribPointer(_programInfo.attribLocations.textureCoord, 2, _gl.FLOAT, false, 0, 0);
        _gl.enableVertexAttribArray(_programInfo.attribLocations.textureCoord);
        
        const texture = _gl.createTexture();
        if (!texture) {
            console.error("Failed to create texture for export.");
            return;
        }
        _gl.bindTexture(_gl.TEXTURE_2D, texture);
        _gl.pixelStorei(_gl.UNPACK_FLIP_Y_WEBGL, true);
        _gl.texImage2D(_gl.TEXTURE_2D, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, _image);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR);
        _gl.texParameteri(_gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR);

        _gl.activeTexture(_gl.TEXTURE0);
        _gl.bindTexture(_gl.TEXTURE_2D, texture);
        if (_programInfo.uniformLocations.sampler) _gl.uniform1i(_programInfo.uniformLocations.sampler, 0);
        
        // Pass all visual effect settings to uniforms
        const settingsToApply = _settings.isViewingOriginal
        ? { 
            ...initialImageSettings, 
            rotation: _settings.rotation, scaleX: _settings.scaleX, scaleY: _settings.scaleY,
            cropZoom: _settings.cropZoom, cropOffsetX: _settings.cropOffsetX, cropOffsetY: _settings.cropOffsetY,
            selectiveColors: JSON.parse(JSON.stringify(initialImageSettings.selectiveColors)),
            tintShadowsColor: initialImageSettings.tintShadowsColor,
            tintShadowsIntensity: initialImageSettings.tintShadowsIntensity,
            tintShadowsSaturation: initialImageSettings.tintShadowsSaturation,
            tintHighlightsColor: initialImageSettings.tintHighlightsColor,
            tintHighlightsIntensity: initialImageSettings.tintHighlightsIntensity,
            tintHighlightsSaturation: initialImageSettings.tintHighlightsSaturation,
          }
        : _settings;

        if (_programInfo.uniformLocations.brightness) _gl.uniform1f(_programInfo.uniformLocations.brightness, settingsToApply.brightness);
        if (_programInfo.uniformLocations.contrast) _gl.uniform1f(_programInfo.uniformLocations.contrast, settingsToApply.contrast);
        if (_programInfo.uniformLocations.saturation) _gl.uniform1f(_programInfo.uniformLocations.saturation, settingsToApply.saturation);
        if (_programInfo.uniformLocations.vibrance) _gl.uniform1f(_programInfo.uniformLocations.vibrance, settingsToApply.vibrance);
        if (_programInfo.uniformLocations.exposure) _gl.uniform1f(_programInfo.uniformLocations.exposure, settingsToApply.exposure);
        if (_programInfo.uniformLocations.highlights) _gl.uniform1f(_programInfo.uniformLocations.highlights, settingsToApply.highlights);
        if (_programInfo.uniformLocations.shadows) _gl.uniform1f(_programInfo.uniformLocations.shadows, settingsToApply.shadows);
        if (_programInfo.uniformLocations.whites) _gl.uniform1f(_programInfo.uniformLocations.whites, settingsToApply.whites);
        if (_programInfo.uniformLocations.blacks) _gl.uniform1f(_programInfo.uniformLocations.blacks, settingsToApply.blacks);
        if (_programInfo.uniformLocations.sharpness) _gl.uniform1f(_programInfo.uniformLocations.sharpness, settingsToApply.sharpness);
        
        // Hue, Temp, Tints
        if (_programInfo.uniformLocations.hueValue) _gl.uniform1f(_programInfo.uniformLocations.hueValue, (settingsToApply.hueRotate / 360.0));
        if (_programInfo.uniformLocations.temperatureShift) _gl.uniform1f(_programInfo.uniformLocations.temperatureShift, (settingsToApply.colorTemperature / 200.0));

        const shadowRgb = hexToRgbNormalizedArray(settingsToApply.tintShadowsColor);
        if (_programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) _gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
        else if (_programInfo.uniformLocations.tintShadowsColorRGB) _gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, [0.5, 0.5, 0.5]); // Default gray
        if (_programInfo.uniformLocations.tintShadowsIntensityFactor) _gl.uniform1f(_programInfo.uniformLocations.tintShadowsIntensityFactor, settingsToApply.tintShadowsIntensity);
        if (_programInfo.uniformLocations.tintShadowsSaturationValue) _gl.uniform1f(_programInfo.uniformLocations.tintShadowsSaturationValue, settingsToApply.tintShadowsSaturation);

        const highlightRgb = hexToRgbNormalizedArray(settingsToApply.tintHighlightsColor);
        if (_programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) _gl.uniform3fv(_programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
        else if (_programInfo.uniformLocations.tintHighlightsColorRGB) _gl.uniform3fv(_programInfo.uniformLocations.tintHighlightsColorRGB, [0.5, 0.5, 0.5]); // Default gray
        if (_programInfo.uniformLocations.tintHighlightsIntensityFactor) _gl.uniform1f(_programInfo.uniformLocations.tintHighlightsIntensityFactor, settingsToApply.tintHighlightsIntensity);
        if (_programInfo.uniformLocations.tintHighlightsSaturationValue) _gl.uniform1f(_programInfo.uniformLocations.tintHighlightsSaturationValue, settingsToApply.tintHighlightsSaturation);
        
        // Effects
        if (_programInfo.uniformLocations.vignetteIntensity) _gl.uniform1f(_programInfo.uniformLocations.vignetteIntensity, settingsToApply.vignetteIntensity);
        if (_programInfo.uniformLocations.grainIntensity) _gl.uniform1f(_programInfo.uniformLocations.grainIntensity, settingsToApply.grainIntensity);
        if (_programInfo.uniformLocations.resolution) _gl.uniform2f(_programInfo.uniformLocations.resolution, _gl.drawingBufferWidth, _gl.drawingBufferHeight);

        // Selective Color
        const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
        const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settingsToApply.activeSelectiveColorTarget);
        if (_programInfo.uniformLocations.selectedColorTargetIndex) {
          _gl.uniform1i(_programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
        }
        const currentSelective = settingsToApply.selectiveColors[settingsToApply.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
        if (_programInfo.uniformLocations.hueAdjustment) _gl.uniform1f(_programInfo.uniformLocations.hueAdjustment, currentSelective.hue * 2.0); // Shader expects -0.5 to 0.5, UI is -0.1 to 0.1, so scale to match
        if (_programInfo.uniformLocations.saturationAdjustment) _gl.uniform1f(_programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
        if (_programInfo.uniformLocations.luminanceAdjustment) _gl.uniform1f(_programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);


        // Transform uniforms (always use actual current settings for these, not initial ones for "before" view)
        let rotationInRadians = 0;
        switch (_settings.rotation) {
            case 90: rotationInRadians = Math.PI / 2; break;
            case 180: rotationInRadians = Math.PI; break;
            case 270: rotationInRadians = (3 * Math.PI) / 2; break;
        }
        if (_programInfo.uniformLocations.rotationAngle) _gl.uniform1f(_programInfo.uniformLocations.rotationAngle, rotationInRadians);
        if (_programInfo.uniformLocations.scale) _gl.uniform2f(_programInfo.uniformLocations.scale, _settings.scaleX, _settings.scaleY);
        
        let autoZoomFactor = 1.0;
        if (_settings.rotation === 90 || _settings.rotation === 270) {
             // For 90/270 rotations, the canvas dimensions are already swapped.
             // The autoZoomFactor for tilt needs to use the viewport dimensions.
             const radTiltAbs = Math.abs((_settings.hueRotate /* Placeholder, should be tiltAngle */ % 360) * Math.PI / 180.0); // Assuming hueRotate is tilt for now
             if (radTiltAbs > 0.001) { // Only calculate if there's a tilt
                const cosA = Math.cos(radTiltAbs);
                const sinA = Math.sin(radTiltAbs);
                // Use the actual drawing buffer dimensions as the viewport to cover
                const vpW = _gl.drawingBufferWidth;
                const vpH = _gl.drawingBufferHeight;
                autoZoomFactor = Math.max( (vpW * cosA + vpH * sinA) / vpW, (vpW * sinA + vpH * cosA) / vpH );
             }
        } else {
            const radTiltAbs = Math.abs((_settings.hueRotate /* Placeholder */ % 360) * Math.PI / 180.0);
             if (radTiltAbs > 0.001) {
                const cosA = Math.cos(radTiltAbs);
                const sinA = Math.sin(radTiltAbs);
                const vpW = _gl.drawingBufferWidth;
                const vpH = _gl.drawingBufferHeight;
                autoZoomFactor = Math.max( (vpW * cosA + vpH * sinA) / vpW, (vpW * sinA + vpH * cosA) / vpH );
             }
        }
        
        const totalEffectiveZoom = _settings.cropZoom * autoZoomFactor;
        const u_crop_tex_scale_val: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
        
        // Calculate max offset based on how much is "outside" the 1.0 zoom view
        const maxTexOffset = Math.max(0, (totalEffectiveZoom - 1.0) / (2.0 * totalEffectiveZoom) );
        let texOffsetX = _settings.cropOffsetX * maxTexOffset;
        let texOffsetY = _settings.cropOffsetY * maxTexOffset * -1.0; 

        if (_programInfo.uniformLocations.cropTexScale) _gl.uniform2fv(_programInfo.uniformLocations.cropTexScale, u_crop_tex_scale_val);
        if (_programInfo.uniformLocations.cropTexOffset) _gl.uniform2fv(_programInfo.uniformLocations.cropTexOffset, [texOffsetX, texOffsetY]);
        
        _gl.drawArrays(_gl.TRIANGLES, 0, 6);
        _gl.deleteTexture(texture); 
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
    
    let imgNatWidth = imageElement.naturalWidth;
    let imgNatHeight = imageElement.naturalHeight;

    let exportWidth = imgNatWidth / settingsToApply.cropZoom;
    let exportHeight = imgNatHeight / settingsToApply.cropZoom;
    
    // Adjust export dimensions for 90/270 degree rotations
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
    
    // Shaders (same as ImageCanvas.tsx for consistency)
    // Vertex Shader (ensure it has all transform uniforms)
    const vsSource = 
      'attribute vec4 a_position;' + '\n' +
      'attribute vec2 a_texCoord;' + '\n' +
      'uniform float u_rotationAngle;' + '\n' +
      'uniform vec2 u_scale;' + '\n' +
      // 'uniform float u_tiltAngle;' + '\n' + // Tilt was removed
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
      '  mat2 rotation90Matrix = mat2(c90, s90, -s90, c90);' + '\n' +
      '  texCoord = rotation90Matrix * texCoord;' + '\n' +
      // Tilt logic removed
      '  texCoord *= u_crop_tex_scale;' + '\n' +
      '  texCoord += u_crop_tex_offset;' + '\n' +
      '  texCoord += 0.5;' + '\n' +
      '  v_textureCoord = texCoord;' + '\n' +
      '}';

    // Fragment Shader (ensure it has all effect uniforms)
    const fsSource = 
    'precision mediump float;' + '\n' +
    'varying highp vec2 v_textureCoord;' + '\n' +
    'uniform sampler2D u_sampler;' + '\n' +
    'uniform float u_brightness;' + '\n' +
    'uniform float u_contrast;' + '\n' +
    'uniform float u_saturation;' + '\n' +
    'uniform float u_vibrance;' + '\n' +
    'uniform float u_exposure;' + '\n' +
    'uniform float u_highlights;' + '\n' +
    'uniform float u_shadows;' + '\n' +
    'uniform float u_whites;' + '\n' +
    'uniform float u_blacks;' + '\n' +
    'uniform float u_sharpness;' + '\n' +
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
    'uniform vec2 u_resolution;' + '\n' + // For grain and sharpness
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

    'float random(vec2 st) {' + '\n' + // For grain
    '  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);' + '\n' +
    '}' + '\n' +
    
    // Hue ranges for selective color (0-1)
    'const float HUE_RED_MAX = 0.05;' + '\n' +     // Wraps around 0/1
    'const float HUE_RED_MIN = 0.95;' + '\n' +     // Red part 2
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
    '  if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {' + '\n' +
    '    discard;' + '\n' + // Discard pixels outside texture range (due to transforms)
    '  }' + '\n' +
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
    
    '  float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
    '  color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial));' + '\n' +
    '  float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
    '  color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);' + '\n' +
    
    '  float black_point_adjust = u_blacks * 0.15;' + '\n' +
    '  float white_point_adjust = 1.0 + u_whites * 0.15;' + '\n' +
    '  white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001);' + '\n' +
    '  color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);' + '\n' +

    // Color Adjustments
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

    // Tinting
    '  float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
    '  vec3 desaturate_temp_tint_color = vec3(0.0);' + '\n' +
    '  if (u_tintShadowsIntensityFactor > 0.001) {' + '\n' +
    '    desaturate_temp_tint_color = vec3(dot(u_tintShadowsColorRGB, vec3(0.299, 0.587, 0.114)));' + '\n' +
    '    vec3 finalShadowTintColor = mix(desaturate_temp_tint_color, u_tintShadowsColorRGB, u_tintShadowsSaturationValue);' + '\n' +
    '    float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint);' + '\n' +
    '    color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);' + '\n' +
    '  }' + '\n' +
    '  if (u_tintHighlightsIntensityFactor > 0.001) {' + '\n' +
    '    desaturate_temp_tint_color = vec3(dot(u_tintHighlightsColorRGB, vec3(0.299, 0.587, 0.114)));' + '\n' +
    '    vec3 finalHighlightTintColor = mix(desaturate_temp_tint_color, u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);' + '\n' +
    '    float highlightMask = smoothstep(0.55, 1.0, luma_tint);' + '\n' +
    '    color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);' + '\n' +
    '  }' + '\n' +

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

    // Effects
    '  if (u_vignetteIntensity > 0.0) {' + '\n' +
    '      float vignetteRadius = 0.7;' + '\n' +
    '      float vignetteSoftness = 0.6;' + '\n' +
    '      float dist_vignette = distance(v_textureCoord, vec2(0.5));' + '\n' +
    '      float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);' + '\n' +
    '      color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);' + '\n' +
    '  }' + '\n' +

    '  if (u_grainIntensity > 0.0) {' + '\n' +
    '    float grain_scale_factor = u_resolution.x > 0.0 ? 50.0 / u_resolution.x : 1.0;' + '\n' + 
    '    vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor;' + '\n' + // Static grain based on tex coord & resolution
    '    float grain_noise = (random(grainCoord) - 0.5) * 0.15;' + '\n' + 
    '    color.rgb += grain_noise * u_grainIntensity;' + '\n' +
    '  }' + '\n' +

    '  if (u_sharpness > 0.0) {' + '\n' +
    '      vec2 texelSize = 1.0 / u_resolution;' + '\n' +
    '      vec3 centerPixelColor = color.rgb;' + '\n' +
    '      vec3 sum = vec3(0.0);' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 1.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, 1.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 1.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 0.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 0.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, -1.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, -1.0)).rgb;' + '\n' +
    '      sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, -1.0)).rgb;' + '\n' +
    '      vec3 blurred = sum / 8.0;' + '\n' +
    '      color.rgb = mix(centerPixelColor, centerPixelColor + (centerPixelColor - blurred) * 1.5, u_sharpness);' + '\n' +
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
            sharpness: gl.getUniformLocation(program, 'u_sharpness'),
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
            resolution: gl.getUniformLocation(program, 'u_resolution'),
            rotationAngle: gl.getUniformLocation(program, 'u_rotationAngle'), // For 90-deg transforms
            scale: gl.getUniformLocation(program, 'u_scale'), // For flip
            // tiltAngle: gl.getUniformLocation(program, 'u_tiltAngle'), // Tilt was removed
            cropTexScale: gl.getUniformLocation(program, 'u_crop_tex_scale'), // For zoom/pan
            cropTexOffset: gl.getUniformLocation(program, 'u_crop_tex_offset'), // For zoom/pan
            selectedColorTargetIndex: gl.getUniformLocation(program, 'u_selectedColorTargetIndex'),
            hueAdjustment: gl.getUniformLocation(program, 'u_hueAdjustment'),
            saturationAdjustment: gl.getUniformLocation(program, 'u_saturationAdjustment'),
            luminanceAdjustment: gl.getUniformLocation(program, 'u_luminanceAdjustment'),
        }
    };
    
    const positionBuffer = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,  -1,-1,  1,1,  1,1,  -1,-1,  1,-1]), gl.STATIC_DRAW);
    
    const textureCoordBuffer = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer); 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,1,  0,0,  1,1,  1,1,  0,0,  1,0]), gl.STATIC_DRAW);
    
    const buffers = { position: positionBuffer, textureCoord: textureCoordBuffer };

    drawImageWithSettingsToContext(gl, offscreenCanvas, imageElement, settingsToApply, programInfo, buffers, noiseImageDataRef.current);
    
    const dataUrl = offscreenCanvas.toDataURL(type, quality);

    gl.deleteBuffer(buffers.position);
    gl.deleteBuffer(buffers.textureCoord);
    gl.deleteProgram(programInfo.program);
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
    
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
          // Preserve transforms of the target image
          rotation: targetImg.settings.rotation,
          scaleX: targetImg.settings.scaleX,
          scaleY: targetImg.settings.scaleY,
          cropZoom: targetImg.settings.cropZoom,
          cropOffsetX: targetImg.settings.cropOffsetX,
          cropOffsetY: targetImg.settings.cropOffsetY,
          isViewingOriginal: false, // Ensure not stuck in "before" view
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
