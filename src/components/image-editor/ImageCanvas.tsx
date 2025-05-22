
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor, initialImageSettings, ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Constants for canvas size limits
const MAX_WIDTH_STANDARD_RATIO = 800;
const MAX_WIDTH_WIDE_RATIO = 960;
const MAX_PHYSICAL_HEIGHT_CAP = 1000; // Max height for very tall portrait images

const NOISE_CANVAS_SIZE = 250;

// Vertex Shader
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
  uniform vec2 u_crop_tex_scale; // combined zoom (manual + auto for tilt)
  uniform vec2 u_crop_tex_offset;// pan

  varying highp vec2 v_textureCoord;

  void main(void) {
    gl_Position = a_position;

    vec2 texCoord = a_texCoord;
    texCoord -= 0.5; // Center to origin
    
    // Apply base transforms: flip, then 90-degree rotation
    texCoord *= u_scale;
    
    float c90 = cos(u_rotationAngle);
    float s90 = sin(u_rotationAngle);
    mat2 rotation90Matrix = mat2(c90, s90, -s90, c90); 
    texCoord = rotation90Matrix * texCoord;
    
    // Apply zoom (scale texture coordinates for overall zoom)
    texCoord *= u_crop_tex_scale;

    // Apply pan (offset texture coordinates)
    texCoord += u_crop_tex_offset;
    
    texCoord += 0.5; // Move back to 0,1 range
    v_textureCoord = texCoord;
  }
`;

// Fragment Shader
const fsSource = `
  precision mediump float;
  varying highp vec2 v_textureCoord;
  uniform sampler2D u_sampler;

  // Basic Adjustments
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_vibrance;
  uniform float u_exposure;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;
  
  // Color Adjustments
  uniform float u_hueValue; // Normalized 0-1, where 0.5 is no change
  uniform float u_temperatureShift; // Normalized -0.5 to 0.5

  // Tinting
  uniform vec3 u_tintShadowsColorRGB;
  uniform float u_tintShadowsIntensityFactor;
  uniform float u_tintShadowsSaturationValue;
  uniform vec3 u_tintHighlightsColorRGB;
  uniform float u_tintHighlightsIntensityFactor;
  uniform float u_tintHighlightsSaturationValue;

  // Selective Color
  uniform int u_selectedColorTargetIndex; // 0:reds, 1:oranges, ..., 7:magentas, -1:none
  uniform float u_hueAdjustment;         // For selective color, e.g., -0.1 to 0.1 (shader uses -0.5 to 0.5)
  uniform float u_saturationAdjustment;  // For selective color, e.g., -0.5 to 0.5
  uniform float u_luminanceAdjustment;   // For selective color, e.g., -0.5 to 0.5

  // Effects
  uniform float u_vignetteIntensity;
  uniform float u_grainIntensity;
  uniform float u_sharpness;
  uniform vec2 u_resolution; // For grain and sharpness


  // Helper functions for color conversion
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

  // Hue ranges for selective color (0-1 normalized hue from HSV)
  // These ranges are approximate and might need fine-tuning for desired selectivity
  const float HUE_RED_MAX = 0.0416; // ~15 degrees / 360
  const float HUE_RED_MIN = 0.9583; // ~345 degrees / 360 (wraps around)
  const float HUE_ORANGE_MIN = 0.0416; 
  const float HUE_ORANGE_MAX = 0.1111; // ~40 degrees
  const float HUE_YELLOW_MIN = 0.1111; 
  const float HUE_YELLOW_MAX = 0.1944; // ~70 degrees
  const float HUE_GREEN_MIN = 0.1944; 
  const float HUE_GREEN_MAX = 0.4444; // ~160 degrees
  const float HUE_CYAN_MIN = 0.4444; 
  const float HUE_CYAN_MAX = 0.5555; // ~200 degrees
  const float HUE_BLUE_MIN = 0.5555; 
  const float HUE_BLUE_MAX = 0.7083; // ~255 degrees
  const float HUE_PURPLE_MIN = 0.7083; 
  const float HUE_PURPLE_MAX = 0.8333; // ~300 degrees
  const float HUE_MAGENTA_MIN = 0.8333; 
  const float HUE_MAGENTA_MAX = 0.9583; // Up to 345 degrees

  void main(void) {
    if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Transparent for out-of-bounds
        return;
    }
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // 1. Basic Adjustments
    color *= u_brightness;
    color = (color - 0.5) * u_contrast + 0.5;
    
    // Saturation
    float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma_sat), color, u_saturation);
  
    // Vibrance
    if (u_vibrance != 0.0) { // u_vibrance is from -1 to 1
        vec3 vibrance_input_color = color;
        float luma_vib = dot(vibrance_input_color, vec3(0.299, 0.587, 0.114));
        float Cmax = max(vibrance_input_color.r, max(vibrance_input_color.g, vibrance_input_color.b));
        float Cmin = min(vibrance_input_color.r, min(vibrance_input_color.g, vibrance_input_color.b));
        float current_pixel_saturation_metric = Cmax - Cmin;
        float vibrance_effect_strength = u_vibrance * 1.2; // Amplify the effect
        if (vibrance_effect_strength > 0.0) {
          color = mix(vec3(luma_vib), vibrance_input_color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));
        } else {
          // For negative vibrance, desaturate more uniformly (similar to negative saturation but controlled by vibrance slider)
          color = mix(vibrance_input_color, vec3(luma_vib), -vibrance_effect_strength);
        }
    }

    // Exposure (applied after saturation/vibrance to affect overall light)
    color *= pow(2.0, u_exposure); 
    
    // Shadows & Highlights (Tone adjustments)
    float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
    float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Recalculate luma
    color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows); 
    
    // Levels (Blacks & Whites)
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_adjust = 1.0 + u_whites * 0.15; 
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001); // Prevent division by zero or negative
    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);

    // 2. Color Adjustments (Hue, Temperature)
    if (u_hueValue != 0.0) { // u_hueValue is already normalized -0.5 to 0.5
        vec3 hsv_hue = rgbToHsv(color);
        hsv_hue.x = mod(hsv_hue.x + u_hueValue, 1.0);
        color = hsvToRgb(hsv_hue);
    }

    if (u_temperatureShift != 0.0) { // u_temperatureShift is -0.5 to 0.5
        float temp_strength = u_temperatureShift * 0.3; // Adjust strength of temperature effect
        color.r += temp_strength;
        color.b -= temp_strength;
    }

    // 3. Tinting
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));
    vec3 desaturate_temp_tint_color_shadows = vec3(dot(u_tintShadowsColorRGB, vec3(0.299, 0.587, 0.114)));
    vec3 finalShadowTintColor = mix(desaturate_temp_tint_color_shadows, u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
    float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); // Mask for darker areas
    color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);

    vec3 desaturate_temp_tint_color_highlights = vec3(dot(u_tintHighlightsColorRGB, vec3(0.299, 0.587, 0.114)));
    vec3 finalHighlightTintColor = mix(desaturate_temp_tint_color_highlights, u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
    float highlightMask = smoothstep(0.55, 1.0, luma_tint); // Mask for lighter areas
    color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);

    // 4. Selective Color
    if (u_selectedColorTargetIndex != -1 && (abs(u_hueAdjustment) > 0.001 || abs(u_saturationAdjustment) > 0.001 || abs(u_luminanceAdjustment) > 0.001 )) {
        vec3 hsv_selective = rgbToHsv(color);
        bool colorMatch = false;

        // Using if/else if for clarity and to ensure only one range matches
        if (u_selectedColorTargetIndex == 0) { // Reds
            if (hsv_selective.x >= HUE_RED_MIN || hsv_selective.x < HUE_RED_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 1) { // Oranges
            if (hsv_selective.x >= HUE_ORANGE_MIN && hsv_selective.x < HUE_ORANGE_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 2) { // Yellows
            if (hsv_selective.x >= HUE_YELLOW_MIN && hsv_selective.x < HUE_YELLOW_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 3) { // Greens
            if (hsv_selective.x >= HUE_GREEN_MIN && hsv_selective.x < HUE_GREEN_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 4) { // Cyans
            if (hsv_selective.x >= HUE_CYAN_MIN && hsv_selective.x < HUE_CYAN_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 5) { // Blues
            if (hsv_selective.x >= HUE_BLUE_MIN && hsv_selective.x < HUE_BLUE_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 6) { // Purples
            if (hsv_selective.x >= HUE_PURPLE_MIN && hsv_selective.x < HUE_PURPLE_MAX) colorMatch = true;
        } else if (u_selectedColorTargetIndex == 7) { // Magentas
            if (hsv_selective.x >= HUE_MAGENTA_MIN && hsv_selective.x < HUE_MAGENTA_MAX) colorMatch = true;
        }

        if (colorMatch) {
            hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0); // u_hueAdjustment is -0.5 to 0.5
            hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0); // u_saturationAdjustment is -1.0 to 1.0
            hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0); // u_luminanceAdjustment is -1.0 to 1.0
            color = hsvToRgb(hsv_selective);
        }
    }

    // 5. Effects (Vignette, Grain, Sharpness)
    // Vignette
    if (u_vignetteIntensity > 0.0) {
        float vignetteRadius = 0.7;
        float vignetteSoftness = 0.6;
        float dist_vignette = distance(v_textureCoord, vec2(0.5));
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);
    }

    // Grain
    if (u_grainIntensity > 0.0) {
      float grain_scale_factor = u_resolution.x > 0.0 ? 50.0 / u_resolution.x : 1.0; 
      vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor;
      float noise = (random(grainCoord) - 0.5) * 0.25; // Increased base strength
      color.rgb += noise * u_grainIntensity;
    }

    // Sharpness
    if (u_sharpness > 0.0) {
        vec2 texelSize = 1.0 / u_resolution;
        vec3 centerPixelColor = color.rgb; // Use color after all previous adjustments
        vec3 sum = vec3(0.0);
        // Sample original texture for sharpness to avoid sharpening already sharpened pixels repeatedly if possible
        // This requires passing the original texture or a copy, or applying sharpness first.
        // For simplicity here, we use the current 'color' which might include other effects.
        // A more advanced sharpness would operate on an earlier stage of the color.
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, 0.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, 0.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(1.0, -1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(0.0, -1.0)).rgb;
        sum += texture2D(u_sampler, v_textureCoord - texelSize * vec2(-1.0, -1.0)).rgb;
        vec3 blurred = sum / 8.0; // Simple box blur
        
        color.rgb = mix(centerPixelColor, centerPixelColor + (centerPixelColor - blurred) * 1.5, u_sharpness);
    }

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);
  }
`;

interface ProgramInfo {
  program: WebGLProgram;
  attribLocations: {
    vertexPosition: number;
    textureCoord: number;
  };
  uniformLocations: {
    sampler: WebGLUniformLocation | null;
    rotationAngle: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
    cropTexScale: WebGLUniformLocation | null;
    cropTexOffset: WebGLUniformLocation | null;
    // Basic Adjustments
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    vibrance: WebGLUniformLocation | null;
    exposure: WebGLUniformLocation | null;
    highlights: WebGLUniformLocation | null;
    shadows: WebGLUniformLocation | null;
    whites: WebGLUniformLocation | null;
    blacks: WebGLUniformLocation | null;
    // Color Adjustments
    hueValue: WebGLUniformLocation | null;
    temperatureShift: WebGLUniformLocation | null;
    // Tinting
    tintShadowsColorRGB: WebGLUniformLocation | null;
    tintShadowsIntensityFactor: WebGLUniformLocation | null;
    tintShadowsSaturationValue: WebGLUniformLocation | null;
    tintHighlightsColorRGB: WebGLUniformLocation | null;
    tintHighlightsIntensityFactor: WebGLUniformLocation | null;
    tintHighlightsSaturationValue: WebGLUniformLocation | null;
    // Selective Color
    selectedColorTargetIndex: WebGLUniformLocation | null;
    hueAdjustment: WebGLUniformLocation | null;
    saturationAdjustment: WebGLUniformLocation | null;
    luminanceAdjustment: WebGLUniformLocation | null;
    // Effects
    vignetteIntensity: WebGLUniformLocation | null;
    grainIntensity: WebGLUniformLocation | null;
    sharpness: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
  };
}

interface Buffers {
  position: WebGLBuffer | null;
  textureCoord: WebGLBuffer | null;
}

const PREVIEW_SCALE_FACTOR = 0.5; // For rendering preview faster

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, noiseImageDataRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const isInitializedRef = useRef(false);
  const animationFrameIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  // Track if the current canvas dimensions have been set based on the current image/settings
  const initialCanvasSetupDoneRef = useRef(false); 

  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string): boolean => {
    if (!glContext) { console.error('WebGL Error (' + operation + '): Context is null'); return true; }
    let errorFound = false;
    let error = glContext.getError();
    while (error !== glContext.NO_ERROR) {
      errorFound = true;
      let errorMsg = 'WebGL Error';
      switch (error) {
        case glContext.INVALID_ENUM: errorMsg = 'INVALID_ENUM'; break;
        case glContext.INVALID_VALUE: errorMsg = 'INVALID_VALUE'; break;
        case glContext.INVALID_OPERATION: errorMsg = 'INVALID_OPERATION'; break;
        case glContext.OUT_OF_MEMORY: errorMsg = 'OUT_OF_MEMORY'; break;
        case glContext.CONTEXT_LOST_WEBGL: errorMsg = 'CONTEXT_LOST_WEBGL'; break;
        default: errorMsg = 'Unknown error code: ' + error; break;
      }
      console.error('WebGL Error (' + operation + '): ' + errorMsg + ' (Code: ' + error + ')');
      error = glContext.getError();
    }
    return errorFound;
  }, []);

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) { console.error('Failed to create shader object.'); return null; }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('An error occurred compiling the shader: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader); return null;
    }
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    if (!vertexShader) { console.error('Vertex shader compilation failed.'); return null; }
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!fragmentShader) { console.error('Fragment shader compilation failed.'); gl.deleteShader(vertexShader); return null; }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) { console.error('Failed to create shader program.'); gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); return null; }
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
      gl.deleteProgram(shaderProgram); gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); return null;
    }
    
    const progInfo: ProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord'),
      },
      uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'u_sampler'),
        rotationAngle: gl.getUniformLocation(shaderProgram, 'u_rotationAngle'),
        scale: gl.getUniformLocation(shaderProgram, 'u_scale'),
        cropTexScale: gl.getUniformLocation(shaderProgram, 'u_crop_tex_scale'),
        cropTexOffset: gl.getUniformLocation(shaderProgram, 'u_crop_tex_offset'),
        brightness: gl.getUniformLocation(shaderProgram, 'u_brightness'),
        contrast: gl.getUniformLocation(shaderProgram, 'u_contrast'),
        saturation: gl.getUniformLocation(shaderProgram, 'u_saturation'),
        vibrance: gl.getUniformLocation(shaderProgram, 'u_vibrance'),
        exposure: gl.getUniformLocation(shaderProgram, 'u_exposure'),
        highlights: gl.getUniformLocation(shaderProgram, 'u_highlights'),
        shadows: gl.getUniformLocation(shaderProgram, 'u_shadows'),
        whites: gl.getUniformLocation(shaderProgram, 'u_whites'),
        blacks: gl.getUniformLocation(shaderProgram, 'u_blacks'),
        hueValue: gl.getUniformLocation(shaderProgram, 'u_hueValue'),
        temperatureShift: gl.getUniformLocation(shaderProgram, 'u_temperatureShift'),
        tintShadowsColorRGB: gl.getUniformLocation(shaderProgram, 'u_tintShadowsColorRGB'),
        tintShadowsIntensityFactor: gl.getUniformLocation(shaderProgram, 'u_tintShadowsIntensityFactor'),
        tintShadowsSaturationValue: gl.getUniformLocation(shaderProgram, 'u_tintShadowsSaturationValue'),
        tintHighlightsColorRGB: gl.getUniformLocation(shaderProgram, 'u_tintHighlightsColorRGB'),
        tintHighlightsIntensityFactor: gl.getUniformLocation(shaderProgram, 'u_tintHighlightsIntensityFactor'),
        tintHighlightsSaturationValue: gl.getUniformLocation(shaderProgram, 'u_tintHighlightsSaturationValue'),
        selectedColorTargetIndex: gl.getUniformLocation(shaderProgram, 'u_selectedColorTargetIndex'),
        hueAdjustment: gl.getUniformLocation(shaderProgram, 'u_hueAdjustment'),
        saturationAdjustment: gl.getUniformLocation(shaderProgram, 'u_saturationAdjustment'),
        luminanceAdjustment: gl.getUniformLocation(shaderProgram, 'u_luminanceAdjustment'),
        vignetteIntensity: gl.getUniformLocation(shaderProgram, 'u_vignetteIntensity'),
        grainIntensity: gl.getUniformLocation(shaderProgram, 'u_grainIntensity'),
        sharpness: gl.getUniformLocation(shaderProgram, 'u_sharpness'),
        resolution: gl.getUniformLocation(shaderProgram, 'u_resolution'),
      },
    };
    // console.log('Shader program linked. Attrib locations:', progInfo.attribLocations, 'Uniform locations:', progInfo.uniformLocations);
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) { console.error('Failed to create position buffer'); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0, 1.0, 1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error('Failed to create texture coordinate buffer'); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, null); // Unbind buffer
    // console.log('Buffers initialized.');
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    const texture = gl.createTexture();
    if (!texture) { console.error('Failed to create texture object.'); return null; }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // console.log('Texture loaded successfully from image.');
    } catch (e) {
      console.error('Error during texImage2D for main texture:', e);
      gl.deleteTexture(texture); return null;
    }
    if (checkGLError(gl, 'loadTexture - after texImage2D')) {
        gl.deleteTexture(texture); return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, null); // Unbind texture
    return texture;
  }, [checkGLError]);

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;
    const currentSettings = settings; // Use the latest settings from context

    if (!gl || !programInfo || !currentBuffers || !canvas || !isInitializedRef.current) {
      // console.warn('drawScene: Not all WebGL resources are initialized. Aborting draw.');
      return;
    }
    
    if (!originalImage || !currentTexture) {
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Match background color
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;

    // Calculate base canvas dimensions respecting aspect ratio and MAX limits
    // These dimensions are for the full quality preview (isPreviewing=false)
    // They are NOT affected by cropZoom here; cropZoom is handled by shader uniforms
    let baseCanvasWidth: number;
    let baseCanvasHeight: number;
    const imgAspectRatio = imgNatWidth / imgNatHeight;

    if (imgAspectRatio > 1) { // Landscape or square
        baseCanvasWidth = Math.min(imgNatWidth, (imgAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        baseCanvasHeight = baseCanvasWidth / imgAspectRatio;
    } else { // Portrait
        baseCanvasHeight = Math.min(imgNatHeight, MAX_PHYSICAL_HEIGHT_CAP);
        baseCanvasWidth = baseCanvasHeight * imgAspectRatio;
        if (baseCanvasWidth > MAX_WIDTH_STANDARD_RATIO) {
            baseCanvasWidth = MAX_WIDTH_STANDARD_RATIO;
            baseCanvasHeight = baseCanvasWidth / imgAspectRatio;
        }
    }
    baseCanvasWidth = Math.max(1, Math.round(baseCanvasWidth));
    baseCanvasHeight = Math.max(1, Math.round(baseCanvasHeight));

    // Determine final canvas buffer dimensions, swapping if rotated by 90/270
    let finalCanvasWidth = baseCanvasWidth;
    let finalCanvasHeight = baseCanvasHeight;
    if (currentSettings.rotation === 90 || currentSettings.rotation === 270) {
        [finalCanvasWidth, finalCanvasHeight] = [baseCanvasHeight, baseCanvasWidth];
    }
    
    // This comparison should only trigger if essential dimensions change (new image, rotation)
    if (canvas.width !== finalCanvasWidth || canvas.height !== finalCanvasHeight || !initialCanvasSetupDoneRef.current ) {
        canvas.width = finalCanvasWidth > 0 ? finalCanvasWidth : 1;
        canvas.height = finalCanvasHeight > 0 ? finalCanvasHeight : 1;
        initialCanvasSetupDoneRef.current = true; // Signal that canvas dimensions are set for current image/rotation
        // console.log(`Canvas dimensions set to: ${canvas.width}x${canvas.height}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.188, 0.188, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, 'drawScene - after clear');

    gl.useProgram(programInfo.program);
    checkGLError(gl, 'drawScene - after useProgram');

    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, 'drawScene - after position attribute setup');

    // Texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, 'drawScene - after texCoord attribute setup');

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    checkGLError(gl, 'drawScene - after texture binding');
    
    const settingsToApply = currentSettings.isViewingOriginal
    ? { 
        ...initialImageSettings, 
        // Preserve transforms for consistent framing when viewing original
        rotation: currentSettings.rotation, 
        scaleX: currentSettings.scaleX, 
        scaleY: currentSettings.scaleY,
        cropZoom: currentSettings.cropZoom, 
        cropOffsetX: currentSettings.cropOffsetX, 
        cropOffsetY: currentSettings.cropOffsetY,
        // Ensure these are also reset to initial if they affect color/tone
        selectiveColors: JSON.parse(JSON.stringify(initialImageSettings.selectiveColors)),
        tintShadowsColor: initialImageSettings.tintShadowsColor,
        tintShadowsIntensity: initialImageSettings.tintShadowsIntensity,
        tintShadowsSaturation: initialImageSettings.tintShadowsSaturation,
        tintHighlightsColor: initialImageSettings.tintHighlightsColor,
        tintHighlightsIntensity: initialImageSettings.tintHighlightsIntensity,
        tintHighlightsSaturation: initialImageSettings.tintHighlightsSaturation,
      }
    : currentSettings;

    // Pass transform uniforms
    let rotationInRadians = 0;
    switch (settingsToApply.rotation) { // Use settingsToApply for transforms if isViewingOriginal is true
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settingsToApply.scaleX, settingsToApply.scaleY);

    // Crop and Pan uniforms
    const totalEffectiveZoom = settingsToApply.cropZoom; // No auto-zoom for tilt as it's removed
    const u_crop_tex_scale_val: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    // maxTexOffset defines how far (0 to 0.5 in texture space) the center of the crop can move from the center of the image
    const maxTexOffset = (1.0 - (1.0 / totalEffectiveZoom)) / 2.0; 
    let texOffsetX = settingsToApply.cropOffsetX * maxTexOffset; // cropOffsetX is -1 to 1
    let texOffsetY = settingsToApply.cropOffsetY * maxTexOffset * -1.0; // Invert Y for intuitive UI control (up is positive)

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, u_crop_tex_scale_val);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, [texOffsetX, texOffsetY]);


    // Pass visual effect uniforms (use settingsToApply)
    if (programInfo.uniformLocations.brightness) gl.uniform1f(programInfo.uniformLocations.brightness, settingsToApply.brightness);
    if (programInfo.uniformLocations.contrast) gl.uniform1f(programInfo.uniformLocations.contrast, settingsToApply.contrast);
    if (programInfo.uniformLocations.saturation) gl.uniform1f(programInfo.uniformLocations.saturation, settingsToApply.saturation);
    if (programInfo.uniformLocations.vibrance) gl.uniform1f(programInfo.uniformLocations.vibrance, settingsToApply.vibrance);
    if (programInfo.uniformLocations.exposure) gl.uniform1f(programInfo.uniformLocations.exposure, settingsToApply.exposure);
    if (programInfo.uniformLocations.highlights) gl.uniform1f(programInfo.uniformLocations.highlights, settingsToApply.highlights);
    if (programInfo.uniformLocations.shadows) gl.uniform1f(programInfo.uniformLocations.shadows, settingsToApply.shadows);
    if (programInfo.uniformLocations.whites) gl.uniform1f(programInfo.uniformLocations.whites, settingsToApply.whites);
    if (programInfo.uniformLocations.blacks) gl.uniform1f(programInfo.uniformLocations.blacks, settingsToApply.blacks);
    
    if (programInfo.uniformLocations.hueValue) gl.uniform1f(programInfo.uniformLocations.hueValue, (settingsToApply.hueRotate / 360.0));
    if (programInfo.uniformLocations.temperatureShift) gl.uniform1f(programInfo.uniformLocations.temperatureShift, (settingsToApply.colorTemperature / 200.0));

    const shadowRgb = hexToRgbNormalizedArray(settingsToApply.tintShadowsColor);
    if (programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    else if (programInfo.uniformLocations.tintShadowsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, [0.5, 0.5, 0.5]); // Default gray if color is invalid
    if (programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintShadowsIntensityFactor, settingsToApply.tintShadowsIntensity);
    if (programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintShadowsSaturationValue, settingsToApply.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(settingsToApply.tintHighlightsColor);
    if (programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    else if (programInfo.uniformLocations.tintHighlightsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, [0.5, 0.5, 0.5]); // Default gray
    if (programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintHighlightsIntensityFactor, settingsToApply.tintHighlightsIntensity);
    if (programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintHighlightsSaturationValue, settingsToApply.tintHighlightsSaturation);
    
    // Selective Color
    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settingsToApply.activeSelectiveColorTarget);
    if (programInfo.uniformLocations.selectedColorTargetIndex != null) { // Check against null explicitly
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1); // Send -1 if no target
    }
    const currentSelective = settingsToApply.selectiveColors[settingsToApply.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue); // Shader expects -0.5 to 0.5
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation); // Shader expects -1.0 to 1.0
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance); // Shader expects -1.0 to 1.0
    
    // Effects
    if (programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(programInfo.uniformLocations.vignetteIntensity, settingsToApply.vignetteIntensity);
    if (programInfo.uniformLocations.grainIntensity) gl.uniform1f(programInfo.uniformLocations.grainIntensity, settingsToApply.grainIntensity); // Preview intensity handled by shader logic or separate uniform if needed
    if (programInfo.uniformLocations.sharpness) gl.uniform1f(programInfo.uniformLocations.sharpness, settingsToApply.sharpness);
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    
    checkGLError(gl, 'drawScene - after setting uniforms');
    gl.drawArrays(gl.TRIANGLES, 0, 6); // Draw the quad
    checkGLError(gl, 'drawScene - after drawArrays');

  }, [originalImage, settings, canvasRef, checkGLError, initShaderProgram, initBuffers, loadTexture]); // Added missing dependencies


  // One-time WebGL setup: context, shaders, program, buffers
  useEffect(() => {
    // console.log("ImageCanvas: Initializing WebGL setup effect");
    const canvas = canvasRef.current;
    if (!canvas) {
      // console.warn("ImageCanvas: Canvas ref is not yet available for WebGL setup.");
      return;
    }
    if (isInitializedRef.current) {
      // console.log("ImageCanvas: WebGL already initialized.");
      return;
    }

    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      console.error('ImageCanvas: Unable to initialize WebGL context.');
      return;
    }
    glRef.current = gl;
    // console.log("WebGL context successfully stored in glRef.");

    const pInfo = initShaderProgram(gl);
    if (!pInfo) {
      console.error("ImageCanvas: Shader program initialization failed.");
      glRef.current = null; // Clean up gl context if program fails
      return;
    }
    programInfoRef.current = pInfo;
    // console.log("Shader program successfully stored in programInfoRef.");

    const bInfo = initBuffers(gl);
    if (!bInfo) {
      console.error("ImageCanvas: Buffer initialization failed.");
      glRef.current = null; // Clean up
      programInfoRef.current = null;
      return;
    }
    buffersRef.current = bInfo;
    // console.log("Buffers successfully stored in buffersRef.");

    isInitializedRef.current = true;
    // console.log("ImageCanvas: WebGL initialized. Requesting initial draw.");
    requestAnimationFrame(drawScene); 
    
  }, [canvasRef, initShaderProgram, initBuffers, loadShader, drawScene]); // drawScene added back if it's stable and needed for an initial clear/draw

  // Load texture when originalImage changes or WebGL becomes initialized
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) {
      // console.log("LoadTexture Effect: GL not ready or not initialized. Waiting.");
      return;
    }

    if (originalImage) {
      const imageElement = originalImage;
      // console.log("LoadTexture Effect: Original image present. Attempting to load texture.");

      const handleLoadOrComplete = () => {
        // console.log("LoadTexture Effect: Image is complete or loaded.");
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          textureRef.current = null;
          // console.log("LoadTexture Effect: Deleted old texture.");
        }
        const newTexture = loadTexture(gl, imageElement);
        if (newTexture) {
          textureRef.current = newTexture;
          // console.log("LoadTexture Effect: New texture loaded and stored in textureRef. Requesting draw.");
        } else {
          console.error("LoadTexture Effect: Failed to load new texture from image.");
          textureRef.current = null;
        }
        requestAnimationFrame(drawScene); // Redraw after texture is set or if it failed
      };

      if (imageElement.complete && imageElement.naturalWidth > 0) {
        // console.log("LoadTexture Effect: Image already complete.");
        handleLoadOrComplete();
      } else if (imageElement.src) { // Check if src is set, otherwise onload might not fire
        // console.log("LoadTexture Effect: Image not complete, attaching onload listener.");
        imageElement.onload = handleLoadOrComplete;
        imageElement.onerror = () => {
          console.error("LoadTexture Effect: Image onerror event triggered.");
          if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
          requestAnimationFrame(drawScene); // Attempt to clear or draw placeholder
        };
      } else {
         // console.warn("LoadTexture Effect: OriginalImage exists but has no src. Clearing texture.");
         if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
         requestAnimationFrame(drawScene); // Clear canvas
      }
    } else { // No originalImage
        // console.log("LoadTexture Effect: No original image. Clearing texture and requesting draw.");
        if (textureRef.current) {
            gl.deleteTexture(textureRef.current);
            textureRef.current = null;
        }
        requestAnimationFrame(drawScene); // Clear the canvas if no image
    }
  }, [originalImage, isInitializedRef, loadTexture, drawScene]); // drawScene is a dependency here

  // Effect for re-drawing when settings (uniforms) change OR for grain animation (if any)
  useEffect(() => {
    if (!isInitializedRef.current || !glRef.current ) { 
      return;
    }
    // Only redraw if an image (and thus texture) is expected or present
    if (originalImage && !textureRef.current) {
        // console.log("Settings/Animation Effect: Image present but texture not ready. Skipping draw.");
        return; // Texture might still be loading
    }
    // console.log("Settings/Animation Effect: Settings changed or animation tick. Requesting draw.");
    requestAnimationFrame(drawScene);
    
  }, [settings, originalImage, drawScene]); // Only drawScene if you want to redraw if its definition changes (due to settings)

  // Effect for noise ImageData generation
  useEffect(() => {
    if (!noiseImageDataRef.current) {
      try {
        const tempNoiseCanvas = document.createElement('canvas');
        tempNoiseCanvas.width = NOISE_CANVAS_SIZE;
        tempNoiseCanvas.height = NOISE_CANVAS_SIZE;
        const noiseCtx = tempNoiseCanvas.getContext('2d');

        if (noiseCtx) {
            const data = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            const buffer = data.data;
            for (let i = 0; i < buffer.length; i += 4) {
              const rand = Math.floor(Math.random() * 256);
              buffer[i] = rand; 
              buffer[i + 1] = rand; 
              buffer[i + 2] = rand; 
              buffer[i + 3] = 255; // Alpha
            }
            noiseImageDataRef.current = data;
            // console.log("SUCCESS: Noise ImageData (" + NOISE_CANVAS_SIZE + "x" + NOISE_CANVAS_SIZE + ") created and stored in context ref.");
        } else {
             console.error("FAILURE: Could not get 2D context for noise ImageData generation (tempNoiseCanvas).");
        }
      } catch (error) {
        console.error("Error creating noise ImageData:", error);
      }
    }
  }, [noiseImageDataRef]);


  // Cleanup WebGL resources
  useEffect(() => {
    return () => {
      // console.log("ImageCanvas: Cleaning up WebGL resources.");
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      const gl = glRef.current;
      if (gl) {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          // console.log("Cleaned up main texture.");
        }
        const pInfo = programInfoRef.current;
        if (pInfo && pInfo.program) {
            const attachedShaders = gl.getAttachedShaders(pInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => { 
                    if (shader) { gl.detachShader(pInfo.program, shader); gl.deleteShader(shader); }
                });
            }
            gl.deleteProgram(pInfo.program);
            // console.log("Cleaned up shader program and attached shaders.");
        }
        const bInfo = buffersRef.current;
        if (bInfo) {
          if(bInfo.position) gl.deleteBuffer(bInfo.position);
          if(bInfo.textureCoord) gl.deleteBuffer(bInfo.textureCoord);
          // console.log("Cleaned up buffers.");
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
      initialCanvasSetupDoneRef.current = false;
      // console.log("ImageCanvas: WebGL resources cleanup complete.");
    };
  }, []);


  if (!originalImage) {
    return (
      <Card className="w-full h-full flex items-center justify-center bg-muted/50 border-dashed">
        {/* Canvas for placeholder or to keep ref alive if needed, but hidden */}
        {/* <canvas ref={canvasRef} style={{ display: 'none' }}></canvas> */}
        <p className="text-muted-foreground">Upload an image to start editing</p>
      </Card>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full rounded-md shadow-lg" // Removed object-contain
      // style={{ imageRendering: 'auto' }} // Keep image-rendering: auto for now
    />
  );
}

    