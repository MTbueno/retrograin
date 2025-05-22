
"use client";

import type { Dispatch, ReactNode, RefObject } from 'react';
import React, { createContext, useContext, useReducer, useState, useRef, useCallback, useEffect } from 'react';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils'; // Ensure this path is correct

// Define color targets for selective color adjustments
export const SELECTIVE_COLOR_TARGETS = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'] as const;
export type SelectiveColorTarget = typeof SELECTIVE_COLOR_TARGETS[number];

export interface SelectiveColorAdjustment {
  hue: number;        // Shader: -0.5 to 0.5 (maps to -180 to 180 degrees). UI: -0.1 to 0.1 for finer control.
  saturation: number; // Shader: -0.5 to 0.5 (maps to -100% to 100% change). UI: -0.5 to 0.5
  luminance: number;  // Shader: -0.5 to 0.5 (maps to -100% to 100% change). UI: -0.5 to 0.5
}

export type SelectiveColors = {
  [K in SelectiveColorTarget]: SelectiveColorAdjustment;
};

export interface ImageSettings {
  brightness: number; // 0.75 to 1.25, default 1
  contrast: number;   // 0.75 to 1.25, default 1
  saturation: number; // 0 to 1.5, default 1
  vibrance: number;   // -1 to 1, default 0
  exposure: number;   // -0.5 to 0.5, default 0
  highlights: number; // -1 to 1, default 0
  shadows: number;    // -1 to 1, default 0
  whites: number;     // -1 to 1, default 0
  blacks: number;     // -1 to 1, default 0
  hueRotate: number; // -180 to 180 degrees for UI, default 0
  colorTemperature: number; // -100 to 100, default 0
  tintShadowsColor: string;
  tintShadowsIntensity: number; // 0 to 0.25, default 0
  tintShadowsSaturation: number; // 0 to 1, default 1
  tintHighlightsColor: string;
  tintHighlightsIntensity: number; // 0 to 0.25, default 0
  tintHighlightsSaturation: number; // 0 to 1, default 1
  vignetteIntensity: number; // 0 to 1, default 0
  grainIntensity: number;    // 0 to 1, default 0
  sharpness: number;         // 0 to 1, default 0
  rotation: number; // 0, 90, 180, 270
  scaleX: number; // 1 or -1
  scaleY: number; // 1 or -1
  cropZoom: number; // 1 to 5, default 1
  cropOffsetX: number; // -1 to 1, default 0
  cropOffsetY: number; // -1 to 1, default 0
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
  contrast: 1,
  saturation: 1,
  vibrance: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  hueRotate: 0,
  colorTemperature: 0,
  tintShadowsColor: '#808080', 
  tintShadowsIntensity: 0,
  tintShadowsSaturation: 1,
  tintHighlightsColor: '#808080', 
  tintHighlightsIntensity: 0,
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
        ...JSON.parse(JSON.stringify(initialImageSettings)), 
        rotation: state.rotation,
        scaleX: state.scaleX,
        scaleY: state.scaleY,
        cropZoom: state.cropZoom,
        cropOffsetX: state.cropOffsetX,
        cropOffsetY: state.cropOffsetY,
        isViewingOriginal: false, 
      };
    case 'LOAD_SETTINGS':
      return { ...action.payload, isViewingOriginal: false }; 
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
  getCanvasDataURL: (type?: string, quality?: number) => Promise<string | null>;
  generateImageDataUrlWithSettings: (imageElement: HTMLImageElement, settings: ImageSettings, type?: string, quality?: number) => Promise<string | null>;
  copiedSettings: ImageSettings | null;
  copyActiveSettings: () => void;
  pasteSettingsToActiveImage: () => void;
  noiseImageDataRef: RefObject<ImageData | null>; 
  jpegQualityExport: number;
}

const ImageEditorContext = createContext<ImageEditorContextType | undefined>(undefined);

const THUMBNAIL_MAX_WIDTH = 80;
const THUMBNAIL_MAX_HEIGHT = 80;
const THUMBNAIL_JPEG_QUALITY = 0.8;
const JPEG_QUALITY_EXPORT = 0.92;

const generateThumbnail = (imageElement: HTMLImageElement): string => {
  const thumbCanvas = document.createElement('canvas');
  const thumbCtx = thumbCanvas.getContext('2d');
  if (!thumbCtx) return '';

  let { naturalWidth: width, naturalHeight: height } = imageElement;
  const aspectRatio = width / height;

  if (width > THUMBNAIL_MAX_WIDTH || height > THUMBNAIL_MAX_HEIGHT) {
    if (aspectRatio > 1) { 
      width = THUMBNAIL_MAX_WIDTH;
      height = Math.round(width / aspectRatio);
    } else { 
      height = THUMBNAIL_MAX_HEIGHT;
      width = Math.round(height * aspectRatio);
    }
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

// Vertex Shader (minimal, handles transforms including crop/pan/tilt via texture coords)
const vsSourceForExport = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;
  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
  uniform vec2 u_crop_tex_scale; // combined zoom
  uniform vec2 u_crop_tex_offset;// pan
  varying highp vec2 v_textureCoord;
  void main(void) {
    gl_Position = a_position;
    vec2 texCoord = a_texCoord;
    texCoord -= 0.5; // Center to origin
    texCoord *= u_scale;
    float c90 = cos(u_rotationAngle);
    float s90 = sin(u_rotationAngle);
    mat2 rotation90Matrix = mat2(c90, s90, -s90, c90);
    texCoord = rotation90Matrix * texCoord;
    texCoord *= u_crop_tex_scale;
    texCoord += u_crop_tex_offset;
    texCoord += 0.5; // Move back to 0,1 range
    v_textureCoord = texCoord;
  }
`;

// Fragment Shader (includes all visual effects)
const fsSourceForExport = `
  precision mediump float;
  varying highp vec2 v_textureCoord;
  uniform sampler2D u_sampler;
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
  uniform float u_sharpness;
  uniform vec2 u_resolution;
  uniform int u_selectedColorTargetIndex;
  uniform float u_hueAdjustment;
  uniform float u_saturationAdjustment;
  uniform float u_luminanceAdjustment;

  vec3 rgbToHsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  vec3 hsvToRgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  const float HUE_RED_MAX = 0.0416; 
  const float HUE_RED_MIN = 0.9583; 
  const float HUE_ORANGE_MIN = 0.0416; 
  const float HUE_ORANGE_MAX = 0.1111; 
  const float HUE_YELLOW_MIN = 0.1111; 
  const float HUE_YELLOW_MAX = 0.1944; 
  const float HUE_GREEN_MIN = 0.1944; 
  const float HUE_GREEN_MAX = 0.4444; 
  const float HUE_CYAN_MIN = 0.4444; 
  const float HUE_CYAN_MAX = 0.5555; 
  const float HUE_BLUE_MIN = 0.5555; 
  const float HUE_BLUE_MAX = 0.7083; 
  const float HUE_PURPLE_MIN = 0.7083; 
  const float HUE_PURPLE_MAX = 0.8333; 
  const float HUE_MAGENTA_MIN = 0.8333; 
  const float HUE_MAGENTA_MAX = 0.9583; 

  void main(void) {
    if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {
        // discard; // or return a border color: gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Transparent for out-of-bounds
        return;
    }
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
    
    float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial));
    float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);
    
    float black_point_adjust = u_blacks * 0.15;
    float white_point_adjust = 1.0 + u_whites * 0.15;
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001);
    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);

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

    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 desaturate_temp_tint_color = vec3(0.0);
    if (u_tintShadowsIntensityFactor > 0.001) {
      desaturate_temp_tint_color = vec3(dot(u_tintShadowsColorRGB, vec3(0.299, 0.587, 0.114)));
      vec3 finalShadowTintColor = mix(desaturate_temp_tint_color, u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
      float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint);
      color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }
    if (u_tintHighlightsIntensityFactor > 0.001) {
      desaturate_temp_tint_color = vec3(dot(u_tintHighlightsColorRGB, vec3(0.299, 0.587, 0.114)));
      vec3 finalHighlightTintColor = mix(desaturate_temp_tint_color, u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
      float highlightMask = smoothstep(0.55, 1.0, luma_tint);
      color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
    }

    if (u_selectedColorTargetIndex != -1 && (abs(u_hueAdjustment) > 0.001 || abs(u_saturationAdjustment) > 0.001 || abs(u_luminanceAdjustment) > 0.001 )) {
        vec3 hsv_selective = rgbToHsv(color);
        bool colorMatch = false;
        if (u_selectedColorTargetIndex == 0 && (hsv_selective.x >= HUE_RED_MIN || hsv_selective.x < HUE_RED_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 1 && (hsv_selective.x >= HUE_ORANGE_MIN && hsv_selective.x < HUE_ORANGE_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 2 && (hsv_selective.x >= HUE_YELLOW_MIN && hsv_selective.x < HUE_YELLOW_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 3 && (hsv_selective.x >= HUE_GREEN_MIN && hsv_selective.x < HUE_GREEN_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 4 && (hsv_selective.x >= HUE_CYAN_MIN && hsv_selective.x < HUE_CYAN_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 5 && (hsv_selective.x >= HUE_BLUE_MIN && hsv_selective.x < HUE_BLUE_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 6 && (hsv_selective.x >= HUE_PURPLE_MIN && hsv_selective.x < HUE_PURPLE_MAX)) { colorMatch = true; }
        else if (u_selectedColorTargetIndex == 7 && (hsv_selective.x >= HUE_MAGENTA_MIN && hsv_selective.x < HUE_MAGENTA_MAX)) { colorMatch = true; }
        if (colorMatch) {
            hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0);
            hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0);
            hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0);
            color = hsvToRgb(hsv_selective);
        }
    }
    
    if (u_vignetteIntensity > 0.0) {
        float vignetteRadius = 0.7;
        float vignetteSoftness = 0.6;
        float dist_vignette = distance(v_textureCoord, vec2(0.5));
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);
    }

    if (u_grainIntensity > 0.0) {
      float grain_scale_factor = u_resolution.x > 0.0 ? 50.0 / u_resolution.x : 1.0;
      vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor;
      float grain_noise = (random(grainCoord) - 0.5) * 0.15;
      color.rgb += grain_noise * u_grainIntensity;
    }

    if (u_sharpness > 0.0) {
        vec2 texelSize = 1.0 / u_resolution;
        vec3 centerPixelColor = color.rgb;
        vec3 sum = vec3(0.0);
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 0.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 0.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, -1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, -1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, -1.0)).rgb;
        vec3 blurred = sum / 8.0;
        color.rgb = mix(centerPixelColor, centerPixelColor + (centerPixelColor - blurred) * 1.5, u_sharpness);
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);
  }
`;

// Helper to load a shader
function loadShaderForExport(_gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = _gl.createShader(type);
    if (!shader) {
        console.error('Unable to create shader for export');
        return null;
    }
    _gl.shaderSource(shader, source);
    _gl.compileShader(shader);
    if (!_gl.getShaderParameter(shader, _gl.COMPILE_STATUS)) {
        console.error('An error occurred compiling the export shader: ' + _gl.getShaderInfoLog(shader));
        _gl.deleteShader(shader);
        return null;
    }
    return shader;
}

// Helper to initialize shader program
function initShaderProgramForExport(_gl: WebGLRenderingContext, vsSource: string, fsSource: string) {
    const vertexShader = loadShaderForExport(_gl, _gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShaderForExport(_gl, _gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) {
        return null;
    }
    const shaderProgram = _gl.createProgram();
    if (!shaderProgram) {
        console.error('Unable to create shader program for export');
        return null;
    }
    _gl.attachShader(shaderProgram, vertexShader);
    _gl.attachShader(shaderProgram, fragmentShader);
    _gl.linkProgram(shaderProgram);
    if (!_gl.getProgramParameter(shaderProgram, _gl.LINK_STATUS)) {
        console.error('Unable to initialize the shader program for export: ' + _gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    return {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: _gl.getAttribLocation(shaderProgram, 'a_position'),
            textureCoord: _gl.getAttribLocation(shaderProgram, 'a_texCoord'),
        },
        uniformLocations: {
            sampler: _gl.getUniformLocation(shaderProgram, 'u_sampler'),
            brightness: _gl.getUniformLocation(shaderProgram, 'u_brightness'),
            contrast: _gl.getUniformLocation(shaderProgram, 'u_contrast'),
            saturation: _gl.getUniformLocation(shaderProgram, 'u_saturation'),
            vibrance: _gl.getUniformLocation(shaderProgram, 'u_vibrance'),
            exposure: _gl.getUniformLocation(shaderProgram, 'u_exposure'),
            highlights: _gl.getUniformLocation(shaderProgram, 'u_highlights'),
            shadows: _gl.getUniformLocation(shaderProgram, 'u_shadows'),
            whites: _gl.getUniformLocation(shaderProgram, 'u_whites'),
            blacks: _gl.getUniformLocation(shaderProgram, 'u_blacks'),
            hueValue: _gl.getUniformLocation(shaderProgram, 'u_hueValue'),
            temperatureShift: _gl.getUniformLocation(shaderProgram, 'u_temperatureShift'),
            tintShadowsColorRGB: _gl.getUniformLocation(shaderProgram, 'u_tintShadowsColorRGB'),
            tintShadowsIntensityFactor: _gl.getUniformLocation(shaderProgram, 'u_tintShadowsIntensityFactor'),
            tintShadowsSaturationValue: _gl.getUniformLocation(shaderProgram, 'u_tintShadowsSaturationValue'),
            tintHighlightsColorRGB: _gl.getUniformLocation(shaderProgram, 'u_tintHighlightsColorRGB'),
            tintHighlightsIntensityFactor: _gl.getUniformLocation(shaderProgram, 'u_tintHighlightsIntensityFactor'),
            tintHighlightsSaturationValue: _gl.getUniformLocation(shaderProgram, 'u_tintHighlightsSaturationValue'),
            vignetteIntensity: _gl.getUniformLocation(shaderProgram, 'u_vignetteIntensity'),
            grainIntensity: _gl.getUniformLocation(shaderProgram, 'u_grainIntensity'),
            sharpness: _gl.getUniformLocation(shaderProgram, 'u_sharpness'),
            resolution: _gl.getUniformLocation(shaderProgram, 'u_resolution'),
            rotationAngle: _gl.getUniformLocation(shaderProgram, 'u_rotationAngle'),
            scale: _gl.getUniformLocation(shaderProgram, 'u_scale'),
            cropTexScale: _gl.getUniformLocation(shaderProgram, 'u_crop_tex_scale'),
            cropTexOffset: _gl.getUniformLocation(shaderProgram, 'u_crop_tex_offset'),
            selectedColorTargetIndex: _gl.getUniformLocation(shaderProgram, 'u_selectedColorTargetIndex'),
            hueAdjustment: _gl.getUniformLocation(shaderProgram, 'u_hueAdjustment'),
            saturationAdjustment: _gl.getUniformLocation(shaderProgram, 'u_saturationAdjustment'),
            luminanceAdjustment: _gl.getUniformLocation(shaderProgram, 'u_luminanceAdjustment'),
        },
    };
}

// Helper to draw image with settings to a given WebGL context
function drawImageWithSettingsToContext(
    _gl: WebGLRenderingContext,
    _canvas: HTMLCanvasElement,
    _image: HTMLImageElement,
    _settings: ImageSettings,
    _programInfo: any, // Should be a specific type for ProgramInfo
    _buffers: any,    // Should be a specific type for Buffers
    _currentNoiseImageData: ImageData | null
): void {
    if (!_gl || !_image || !_programInfo || !_buffers || !_canvas) {
        console.error("drawImageWithSettingsToContext: Missing GL context, canvas, image, programInfo, or buffers.");
        return;
    }

    _gl.viewport(0, 0, _gl.drawingBufferWidth, _gl.drawingBufferHeight);
    _gl.clearColor(0.0, 0.0, 0.0, 0.0); // Clear to transparent for export
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

    // Basic Adjustments
    if (_programInfo.uniformLocations.brightness) _gl.uniform1f(_programInfo.uniformLocations.brightness, settingsToApply.brightness);
    if (_programInfo.uniformLocations.contrast) _gl.uniform1f(_programInfo.uniformLocations.contrast, settingsToApply.contrast);
    if (_programInfo.uniformLocations.saturation) _gl.uniform1f(_programInfo.uniformLocations.saturation, settingsToApply.saturation);
    if (_programInfo.uniformLocations.vibrance) _gl.uniform1f(_programInfo.uniformLocations.vibrance, settingsToApply.vibrance);
    if (_programInfo.uniformLocations.exposure) _gl.uniform1f(_programInfo.uniformLocations.exposure, settingsToApply.exposure);
    if (_programInfo.uniformLocations.highlights) _gl.uniform1f(_programInfo.uniformLocations.highlights, settingsToApply.highlights);
    if (_programInfo.uniformLocations.shadows) _gl.uniform1f(_programInfo.uniformLocations.shadows, settingsToApply.shadows);
    if (_programInfo.uniformLocations.whites) _gl.uniform1f(_programInfo.uniformLocations.whites, settingsToApply.whites);
    if (_programInfo.uniformLocations.blacks) _gl.uniform1f(_programInfo.uniformLocations.blacks, settingsToApply.blacks);
    
    // Color Adjustments
    if (_programInfo.uniformLocations.hueValue) _gl.uniform1f(_programInfo.uniformLocations.hueValue, (settingsToApply.hueRotate / 360.0));
    if (_programInfo.uniformLocations.temperatureShift) _gl.uniform1f(_programInfo.uniformLocations.temperatureShift, (settingsToApply.colorTemperature / 200.0));

    // Tints
    const shadowRgb = hexToRgbNormalizedArray(settingsToApply.tintShadowsColor);
    if (_programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) _gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    else if (_programInfo.uniformLocations.tintShadowsColorRGB) _gl.uniform3fv(_programInfo.uniformLocations.tintShadowsColorRGB, [0.5, 0.5, 0.5]);
    if (_programInfo.uniformLocations.tintShadowsIntensityFactor) _gl.uniform1f(_programInfo.uniformLocations.tintShadowsIntensityFactor, settingsToApply.tintShadowsIntensity);
    if (_programInfo.uniformLocations.tintShadowsSaturationValue) _gl.uniform1f(_programInfo.uniformLocations.tintShadowsSaturationValue, settingsToApply.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(settingsToApply.tintHighlightsColor);
    if (_programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) _gl.uniform3fv(_programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    else if (_programInfo.uniformLocations.tintHighlightsColorRGB) _gl.uniform3fv(_programInfo.uniformLocations.tintHighlightsColorRGB, [0.5, 0.5, 0.5]);
    if (_programInfo.uniformLocations.tintHighlightsIntensityFactor) _gl.uniform1f(_programInfo.uniformLocations.tintHighlightsIntensityFactor, settingsToApply.tintHighlightsIntensity);
    if (_programInfo.uniformLocations.tintHighlightsSaturationValue) _gl.uniform1f(_programInfo.uniformLocations.tintHighlightsSaturationValue, settingsToApply.tintHighlightsSaturation);
    
    // Effects
    if (_programInfo.uniformLocations.vignetteIntensity) _gl.uniform1f(_programInfo.uniformLocations.vignetteIntensity, settingsToApply.vignetteIntensity);
    if (_programInfo.uniformLocations.grainIntensity) _gl.uniform1f(_programInfo.uniformLocations.grainIntensity, settingsToApply.grainIntensity * 1.0); // Export grain intensity
    if (_programInfo.uniformLocations.sharpness) _gl.uniform1f(_programInfo.uniformLocations.sharpness, settingsToApply.sharpness);
    if (_programInfo.uniformLocations.resolution) _gl.uniform2f(_programInfo.uniformLocations.resolution, _gl.drawingBufferWidth, _gl.drawingBufferHeight);

    // Selective Color
    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settingsToApply.activeSelectiveColorTarget);
    if (_programInfo.uniformLocations.selectedColorTargetIndex != null) {
      _gl.uniform1i(_programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
    }
    const currentSelective = settingsToApply.selectiveColors[settingsToApply.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (_programInfo.uniformLocations.hueAdjustment) _gl.uniform1f(_programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (_programInfo.uniformLocations.saturationAdjustment) _gl.uniform1f(_programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (_programInfo.uniformLocations.luminanceAdjustment) _gl.uniform1f(_programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

    // Transform uniforms
    let rotationInRadians = 0;
    switch (_settings.rotation) {
        case 90: rotationInRadians = Math.PI / 2; break;
        case 180: rotationInRadians = Math.PI; break;
        case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (_programInfo.uniformLocations.rotationAngle) _gl.uniform1f(_programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (_programInfo.uniformLocations.scale) _gl.uniform2f(_programInfo.uniformLocations.scale, _settings.scaleX, _settings.scaleY);
    
    const totalEffectiveZoom = _settings.cropZoom; // No auto-zoom for tilt as it's removed
    const u_crop_tex_scale_val: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    const maxTexOffset = Math.max(0, (totalEffectiveZoom - 1.0) / (2.0 * totalEffectiveZoom) );
    let texOffsetX = _settings.cropOffsetX * maxTexOffset;
    let texOffsetY = _settings.cropOffsetY * maxTexOffset * -1.0; 

    if (_programInfo.uniformLocations.cropTexScale) _gl.uniform2fv(_programInfo.uniformLocations.cropTexScale, u_crop_tex_scale_val);
    if (_programInfo.uniformLocations.cropTexOffset) _gl.uniform2fv(_programInfo.uniformLocations.cropTexOffset, [texOffsetX, texOffsetY]);
        
    _gl.drawArrays(_gl.TRIANGLES, 0, 6);
    _gl.deleteTexture(texture); 
}

export function ImageEditorProvider({ children }: { children: ReactNode }) {
  const [allImages, setAllImages] = useState<ImageObject[]>([]);
  const [activeImageId, setActiveImageIdInternal] = useState<string | null>(null);

  const [currentActiveImageElement, setCurrentActiveImageElement] = useState<HTMLImageElement | null>(null);
  const [currentBaseFileName, setCurrentBaseFileName] = useState<string>('retrograin_image');
  const [currentSettings, dispatchSettings] = useReducer(settingsReducer, initialImageSettings);

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

  const addImageObject = useCallback((imageData: Omit<ImageObject, 'id' | 'thumbnailDataUrl' | 'settings'> & { settings?: Partial<ImageSettings>}) => {
    const newId = Date.now().toString() + Math.random().toString(36).substring(2, 15);
    const thumbnailDataUrl = generateThumbnail(imageData.imageElement);
    const newImageObject: ImageObject = {
      ...imageData,
      id: newId,
      settings: JSON.parse(JSON.stringify(initialImageSettings)), // New images get fresh default settings
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
         if (!newActiveId) { 
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
  }, [allImages]); 

  useEffect(() => {
    if (allImages.length > 0 && !activeImageId) {
      setActiveImageId(allImages[0].id);
    } else if (allImages.length === 0 && activeImageId) {
      setActiveImageId(null); 
    }
  }, [allImages, activeImageId, setActiveImageId]);

  const getCanvasDataURL = useCallback(async (type: string = 'image/jpeg', quality: number = JPEG_QUALITY_EXPORT): Promise<string | null> => {
    if (!currentActiveImageElement) {
        console.warn("getCanvasDataURL: No active image to export.");
        return null;
    }

    const offscreenCanvas = document.createElement('canvas');
    let imgNatWidth = currentActiveImageElement.naturalWidth;
    let imgNatHeight = currentActiveImageElement.naturalHeight;
    
    let exportWidth = imgNatWidth / currentSettings.cropZoom;
    let exportHeight = imgNatHeight / currentSettings.cropZoom;
    
    if (currentSettings.rotation === 90 || currentSettings.rotation === 270) {
        [exportWidth, exportHeight] = [exportHeight, exportWidth];
    }
    
    offscreenCanvas.width = Math.max(1, Math.round(exportWidth));
    offscreenCanvas.height = Math.max(1, Math.round(exportHeight));

    const gl = offscreenCanvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      console.error("getCanvasDataURL: Could not get WebGL context for offscreen canvas.");
      return null;
    }
    
    const programInfo = initShaderProgramForExport(gl, vsSourceForExport, fsSourceForExport);
    if (!programInfo) return null;

    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0, 1.0, 1.0, -1.0];
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    const buffers = { position: positionBuffer, textureCoord: textureCoordBuffer };

    drawImageWithSettingsToContext(gl, offscreenCanvas, currentActiveImageElement, currentSettings, programInfo, buffers, noiseImageDataRef.current);
    
    const dataUrl = offscreenCanvas.toDataURL(type, quality);

    gl.deleteBuffer(buffers.position);
    gl.deleteBuffer(buffers.textureCoord);
    gl.deleteProgram(programInfo.program);
    // Clean up shaders if they are returned by initShaderProgramForExport and stored in programInfo
    if (programInfo.vertexShader) gl.deleteShader(programInfo.vertexShader);
    if (programInfo.fragmentShader) gl.deleteShader(programInfo.fragmentShader);
        
    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    if (loseContextExt) {
        loseContextExt.loseContext();
    }
    return dataUrl;
  }, [currentActiveImageElement, currentSettings, noiseImageDataRef]);


const generateImageDataUrlWithSettings = useCallback(async (
    imageElement: HTMLImageElement,
    settingsToApply: ImageSettings,
    type: string = 'image/jpeg',
    quality: number = JPEG_QUALITY_EXPORT
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
    
    const programInfo = initShaderProgramForExport(gl, vsSourceForExport, fsSourceForExport);
    if (!programInfo) return null;
    
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0, 1.0, 1.0, -1.0];
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
    
    const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    const buffers = { position: positionBuffer, textureCoord: textureCoordBuffer };

    drawImageWithSettingsToContext(gl, offscreenCanvas, imageElement, settingsToApply, programInfo, buffers, noiseImageDataRef.current);
    
    const dataUrl = offscreenCanvas.toDataURL(type, quality);

    gl.deleteBuffer(buffers.position);
    gl.deleteBuffer(buffers.textureCoord);
    gl.deleteProgram(programInfo.program);
    if (programInfo.vertexShader) gl.deleteShader(programInfo.vertexShader);
    if (programInfo.fragmentShader) gl.deleteShader(programInfo.fragmentShader);

    const loseContextExt = gl.getExtension('WEBGL_lose_context');
    if (loseContextExt) {
        loseContextExt.loseContext();
    }
    return dataUrl;

  }, [noiseImageDataRef]);


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
          isViewingOriginal: false, 
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
        jpegQualityExport: JPEG_QUALITY_EXPORT,
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

