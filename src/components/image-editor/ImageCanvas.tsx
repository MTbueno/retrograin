
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor, type ImageSettings, type SelectiveColorTarget, SELECTIVE_COLOR_TARGETS } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Vertex shader program
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
  // uniform float u_tiltAngle;  // REMOVED
  uniform vec2 u_crop_tex_scale; // zoom
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
    mat2 rotation90Matrix = mat2(c90, -s90, s90, c90); 
    texCoord = rotation90Matrix * texCoord;

    // Apply zoom (scale texture coordinates for overall zoom)
    texCoord *= u_crop_tex_scale; 

    // Apply pan (offset texture coordinates)
    texCoord += u_crop_tex_offset;
    
    texCoord += 0.5; // Move back to 0,1 range
    v_textureCoord = texCoord;
  }
`;

// Fragment shader program
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
  uniform float u_hueValue;          
  uniform float u_temperatureShift;  

  // Tint Adjustments
  uniform vec3 u_tintShadowsColorRGB;
  uniform float u_tintShadowsIntensityFactor;
  uniform float u_tintShadowsSaturationValue;

  uniform vec3 u_tintHighlightsColorRGB;
  uniform float u_tintHighlightsIntensityFactor;
  uniform float u_tintHighlightsSaturationValue;
  
  // Effects
  uniform float u_vignetteIntensity; 
  uniform float u_grainIntensity;    
  uniform float u_time;              
  uniform vec2 u_resolution;

  // Selective Color
  uniform int u_selectedColorTargetIndex; // 0:reds, 1:oranges, ..., 7:magentas
  uniform float u_hueAdjustment;          // -0.5 to 0.5
  uniform float u_saturationAdjustment;   // -1.0 to 1.0
  uniform float u_luminanceAdjustment;    // -1.0 to 1.0 (applied to V in HSV)

  // HSV Conversion functions
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

  // Desaturate color (used for tint color saturation)
  vec3 desaturate(vec3 color, float saturationFactor) {
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(luma), color, saturationFactor);
  }

  // Pseudo-random generator for grain
  float random(vec2 st) {
      vec2 st_anim = st + u_time * 0.01; 
      return fract(sin(dot(st_anim.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // Hue ranges (normalized 0-1, approximate)
  // These might need fine-tuning for better selectivity
  const float HUE_RED_MAX = 0.05;      // around 18 degrees
  const float HUE_RED_MIN = 0.95;      // around 342 degrees (wraps around)
  const float HUE_ORANGE_MIN = 0.05;
  const float HUE_ORANGE_MAX = 0.12;   // ~18 to 43 degrees
  const float HUE_YELLOW_MIN = 0.12;
  const float HUE_YELLOW_MAX = 0.20;   // ~43 to 72 degrees
  const float HUE_GREEN_MIN = 0.20;
  const float HUE_GREEN_MAX = 0.45;    // ~72 to 162 degrees
  const float HUE_CYAN_MIN = 0.45;
  const float HUE_CYAN_MAX = 0.55;     // ~162 to 198 degrees
  const float HUE_BLUE_MIN = 0.55;
  const float HUE_BLUE_MAX = 0.70;     // ~198 to 252 degrees
  const float HUE_PURPLE_MIN = 0.70;   // Using "Purple" for violet/purple range
  const float HUE_PURPLE_MAX = 0.80;   // ~252 to 288 degrees
  const float HUE_MAGENTA_MIN = 0.80;
  const float HUE_MAGENTA_MAX = 0.95;  // ~288 to 342 degrees


  void main(void) {
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // --- Basic Adjustments ---
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
    float white_point_adjust = u_whites * 0.15; 
    color -= black_point_adjust;
    float range = 1.0 + white_point_adjust - black_point_adjust;
    if (range <= 0.0) range = 0.001;
    color /= range;
    color = clamp(color, 0.0, 1.0);

    // --- Color Adjustments ---
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

    // --- Tinting ---
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

    // --- Selective Color ---
    if (u_hueAdjustment != 0.0 || u_saturationAdjustment != 0.0 || u_luminanceAdjustment != 0.0) {
        vec3 hsv_selective = rgbToHsv(color);
        bool colorMatch = false;

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
            hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0);
            hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0);
            hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0);
            color = hsvToRgb(hsv_selective);
        }
    }
   
    // --- Effects ---
    if (u_vignetteIntensity > 0.001) {
        float vignetteRadius = 0.7; 
        float vignetteSoftness = 0.6;
        float dist_vignette = distance(v_textureCoord, vec2(0.5));
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);
    }

    if (u_grainIntensity > 0.001) {
        vec2 grainCoord = (v_textureCoord * u_resolution.x / 50.0 ) + u_time * 0.1; // Adjusted grain scale and animation speed
        float noise = (random(grainCoord) - 0.5) * 0.15; 
        color.rgb += noise * u_grainIntensity;
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
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    vibrance: WebGLUniformLocation | null;
    exposure: WebGLUniformLocation | null;
    highlights: WebGLUniformLocation | null;
    shadows: WebGLUniformLocation | null;
    whites: WebGLUniformLocation | null;
    blacks: WebGLUniformLocation | null;
    hueValue: WebGLUniformLocation | null;
    temperatureShift: WebGLUniformLocation | null;
    tintShadowsColorRGB: WebGLUniformLocation | null;
    tintShadowsIntensityFactor: WebGLUniformLocation | null;
    tintShadowsSaturationValue: WebGLUniformLocation | null;
    tintHighlightsColorRGB: WebGLUniformLocation | null;
    tintHighlightsIntensityFactor: WebGLUniformLocation | null;
    tintHighlightsSaturationValue: WebGLUniformLocation | null;
    vignetteIntensity: WebGLUniformLocation | null;
    grainIntensity: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    rotationAngle: WebGLUniformLocation | null; 
    scale: WebGLUniformLocation | null;          
    cropTexScale: WebGLUniformLocation | null;   
    cropTexOffset: WebGLUniformLocation | null;
    // Selective Color Uniforms
    selectedColorTargetIndex: WebGLUniformLocation | null;
    hueAdjustment: WebGLUniformLocation | null;
    saturationAdjustment: WebGLUniformLocation | null;
    luminanceAdjustment: WebGLUniformLocation | null;
  };
}

interface Buffers {
  position: WebGLBuffer | null;
  textureCoord: WebGLBuffer | null;
}

const MAX_WIDTH_STANDARD_RATIO = 800;
const MAX_WIDTH_WIDE_RATIO = 960;
const MAX_PHYSICAL_HEIGHT_CAP = 1000;

const PREVIEW_SCALE_FACTOR = 0.5;

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const lastRenderedSettingsRef = useRef<string | null>(null);


  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string): boolean => {
    if (!glContext) {
      console.error(`WebGL context not available for operation: ${operation}`);
      return true;
    }
    let errorFound = false;
    let error = glContext.getError();
    while (error !== glContext.NO_ERROR) {
      errorFound = true;
      let errorMsg = "WebGL Error: Unknown error";
      switch (error) {
        case glContext.INVALID_ENUM: errorMsg = "INVALID_ENUM"; break;
        case glContext.INVALID_VALUE: errorMsg = "INVALID_VALUE"; break;
        case glContext.INVALID_OPERATION: errorMsg = "INVALID_OPERATION"; break;
        case glContext.OUT_OF_MEMORY: errorMsg = "OUT_OF_MEMORY"; break;
        case glContext.CONTEXT_LOST_WEBGL: errorMsg = "CONTEXT_LOST_WEBGL"; break;
        default: errorMsg = `Unknown error code: ${error}`; break;
      }
      console.error(`WebGL Error (${operation}): ${errorMsg} (Code: ${error})`);
      error = glContext.getError();
    }
    return errorFound;
  }, []);

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error("Failed to create shader object.");
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(`An error occurred compiling the shader (${type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment'}): ${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, []); 

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    if (!vertexShader || !fragmentShader) {
      console.error("Shader compilation failed. Cannot create program.");
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
      return null;
    }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) {
        console.error("Failed to create shader program.");
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return null;
    }
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
      gl.deleteProgram(shaderProgram);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }
    
    const progInfo: ProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord'),
      },
      uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'u_sampler'),
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
        vignetteIntensity: gl.getUniformLocation(shaderProgram, 'u_vignetteIntensity'),
        grainIntensity: gl.getUniformLocation(shaderProgram, 'u_grainIntensity'),
        time: gl.getUniformLocation(shaderProgram, 'u_time'),
        resolution: gl.getUniformLocation(shaderProgram, 'u_resolution'),
        rotationAngle: gl.getUniformLocation(shaderProgram, 'u_rotationAngle'),
        scale: gl.getUniformLocation(shaderProgram, 'u_scale'),
        cropTexScale: gl.getUniformLocation(shaderProgram, 'u_crop_tex_scale'),
        cropTexOffset: gl.getUniformLocation(shaderProgram, 'u_crop_tex_offset'),
        selectedColorTargetIndex: gl.getUniformLocation(shaderProgram, 'u_selectedColorTargetIndex'),
        hueAdjustment: gl.getUniformLocation(shaderProgram, 'u_hueAdjustment'),
        saturationAdjustment: gl.getUniformLocation(shaderProgram, 'u_saturationAdjustment'),
        luminanceAdjustment: gl.getUniformLocation(shaderProgram, 'u_luminanceAdjustment'),
      },
    };
    // console.log("Shader Program Initialized. Locations verified.");
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) { console.error("Failed to create position buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]; 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error("Failed to create texture coordinate buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]; 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      console.warn("loadTexture: Image not yet complete or has no dimensions. src:", image.src.substring(0,100));
      return null;
    }
    const texture = gl.createTexture();
    if (!texture) {
        console.error("Failed to create texture object.");
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (checkGLError(gl, "loadTexture - after bindTexture")) return null;
    
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
    if (checkGLError(gl, "loadTexture - after pixelStorei UNPACK_FLIP_Y_WEBGL")) return null;
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (checkGLError(gl, "loadTexture - after texParameteri")) return null;
    
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // console.log("Texture loaded into GPU via texImage2D for image:", image.src.substring(0, 50));
    } catch (e) {
      console.error("Error during texImage2D:", e);
      gl.deleteTexture(texture);
      return null;
    }
    
    if (checkGLError(gl, "loadTexture - after texImage2D")) {
        gl.deleteTexture(texture);
        return null;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
  }, [checkGLError]);

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;

    if (!gl || !programInfo || !currentBuffers || !canvas || !isInitializedRef.current) {
      // console.warn("drawScene: WebGL not fully initialized or canvas not available.");
      return;
    }
    
    if (!originalImage || !currentTexture) {
      gl.clearColor(0.188, 0.188, 0.188, 1.0); 
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      checkGLError(gl, "drawScene - clear after no image/texture");
      return;
    }

    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;
    
    let baseCanvasWidth: number;
    let baseCanvasHeight: number;
    const contentAspectRatio = imgNatWidth / imgNatHeight;

    if (contentAspectRatio > 1) { 
        baseCanvasWidth = Math.min(imgNatWidth, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        baseCanvasHeight = baseCanvasWidth / contentAspectRatio;
    } else { 
        baseCanvasHeight = Math.min(imgNatHeight, MAX_PHYSICAL_HEIGHT_CAP);
        baseCanvasWidth = baseCanvasHeight * contentAspectRatio;
        if (baseCanvasWidth > MAX_WIDTH_STANDARD_RATIO) {
            baseCanvasWidth = MAX_WIDTH_STANDARD_RATIO;
            baseCanvasHeight = baseCanvasWidth / contentAspectRatio;
        }
    }
    baseCanvasWidth = Math.max(1, Math.round(baseCanvasWidth));
    baseCanvasHeight = Math.max(1, Math.round(baseCanvasHeight));
    
    let finalCanvasWidth = baseCanvasWidth;
    let finalCanvasHeight = baseCanvasHeight;

    if (settings.rotation === 90 || settings.rotation === 270) {
        const temp = finalCanvasWidth;
        finalCanvasWidth = finalCanvasHeight;
        finalCanvasHeight = temp;
    }

    const currentPreviewFactor = isPreviewing ? PREVIEW_SCALE_FACTOR : 1.0;
    const effectiveCanvasWidth = Math.round(finalCanvasWidth * currentPreviewFactor);
    const effectiveCanvasHeight = Math.round(finalCanvasHeight * currentPreviewFactor);
    
    if (canvas.width !== effectiveCanvasWidth || canvas.height !== effectiveCanvasHeight) {
        canvas.width = effectiveCanvasWidth > 0 ? effectiveCanvasWidth : 1;
        canvas.height = effectiveCanvasHeight > 0 ? effectiveCanvasHeight : 1;
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "drawScene - after viewport");

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, "drawScene - after clear");

    gl.useProgram(programInfo.program);
    checkGLError(gl, "drawScene - after useProgram");

    if (currentBuffers.position && programInfo.attribLocations.vertexPosition !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
        gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    } else { console.warn("drawScene: Position buffer or attrib location missing"); }


    if (currentBuffers.textureCoord && programInfo.attribLocations.textureCoord !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    } else { console.warn("drawScene: Texture coord buffer or attrib location missing"); }


    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) {
        gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    } else { console.warn("drawScene: Sampler uniform location missing"); }

    // --- Pass all settings to uniforms ---
    if (programInfo.uniformLocations.brightness) gl.uniform1f(programInfo.uniformLocations.brightness, settings.brightness);
    if (programInfo.uniformLocations.contrast) gl.uniform1f(programInfo.uniformLocations.contrast, settings.contrast);
    if (programInfo.uniformLocations.saturation) gl.uniform1f(programInfo.uniformLocations.saturation, settings.saturation);
    if (programInfo.uniformLocations.vibrance) gl.uniform1f(programInfo.uniformLocations.vibrance, settings.vibrance);
    if (programInfo.uniformLocations.exposure) gl.uniform1f(programInfo.uniformLocations.exposure, settings.exposure);
    if (programInfo.uniformLocations.highlights) gl.uniform1f(programInfo.uniformLocations.highlights, settings.highlights);
    if (programInfo.uniformLocations.shadows) gl.uniform1f(programInfo.uniformLocations.shadows, settings.shadows);
    if (programInfo.uniformLocations.whites) gl.uniform1f(programInfo.uniformLocations.whites, settings.whites);
    if (programInfo.uniformLocations.blacks) gl.uniform1f(programInfo.uniformLocations.blacks, settings.blacks);
    
    if (programInfo.uniformLocations.hueValue) gl.uniform1f(programInfo.uniformLocations.hueValue, (settings.hueRotate ?? 0) / 360.0);
    if (programInfo.uniformLocations.temperatureShift) gl.uniform1f(programInfo.uniformLocations.temperatureShift, (settings.colorTemperature ?? 0) / 200.0);

    const shadowRgb = hexToRgbNormalizedArray(settings.tintShadowsColor);
    if (programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    if (programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintShadowsIntensityFactor, settings.tintShadowsIntensity);
    if (programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintShadowsSaturationValue, settings.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(settings.tintHighlightsColor);
    if (programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    if (programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintHighlightsIntensityFactor, settings.tintHighlightsIntensity);
    if (programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintHighlightsSaturationValue, settings.tintHighlightsSaturation);

    if (programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(programInfo.uniformLocations.vignetteIntensity, settings.vignetteIntensity);
    if (programInfo.uniformLocations.grainIntensity) gl.uniform1f(programInfo.uniformLocations.grainIntensity, settings.grainIntensity);
    if (programInfo.uniformLocations.time) gl.uniform1f(programInfo.uniformLocations.time, performance.now() / 5000.0); 
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);

    let rotationInRadians = 0;
    switch (settings.rotation) {
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settings.scaleX, settings.scaleY);
    
    const totalEffectiveZoom = settings.cropZoom; 
    const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0); 
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset * -1.0; 
    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);

    // Selective Color Uniforms
    const targetIndex = SELECTIVE_COLOR_TARGETS.indexOf(settings.activeSelectiveColorTarget);
    if (programInfo.uniformLocations.selectedColorTargetIndex) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex);
    }
    const currentSelective = settings.selectiveColors[settings.activeSelectiveColorTarget];
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);


    checkGLError(gl, "drawScene - before drawArrays after setting uniforms");
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, settings, canvasRef, isPreviewing, checkGLError]); // Removed loadTexture, initShaderProgram, initBuffers


  useEffect(() => {
    if (!canvasRef.current) {
      // console.log("ImageCanvas: Mount, canvasRef not ready yet.");
      return;
    }
    // console.log("ImageCanvas: Mount, canvasRef IS ready.");
    
    let context = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true });
    if (!context) {
      context = canvasRef.current.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    }
    
    if (!context) {
      console.error("ImageCanvas: Unable to initialize WebGL context.");
      isInitializedRef.current = false;
      return;
    }
    glRef.current = context;
    // console.log("WebGL context successfully stored in glRef.");

    const pInfo = initShaderProgram(glRef.current);
    if (pInfo) {
      programInfoRef.current = pInfo;
      // console.log("Shader program initialized and stored in programInfoRef.");
    } else {
      console.error("ImageCanvas: Shader program initialization failed.");
      glRef.current = null; 
      isInitializedRef.current = false;
      return;
    }

    const bInfo = initBuffers(glRef.current);
    if (bInfo) {
      buffersRef.current = bInfo;
      // console.log("WebGL buffers initialized and stored in buffersRef.");
    } else {
      console.error("ImageCanvas: WebGL buffer initialization failed.");
      glRef.current = null; 
      programInfoRef.current = null;
      isInitializedRef.current = false;
      return;
    }
    isInitializedRef.current = true;
    // console.log("ImageCanvas: WebGL initialized successfully (isInitializedRef = true). Requesting initial draw.");
    requestAnimationFrame(drawScene); 
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]); 


  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) {
      // console.log("TextureLoad Effect: GL or initialization not ready.");
      return;
    }

    if (originalImage) {
      const imageElement = originalImage;
      // console.log("TextureLoad Effect: originalImage present. Image complete:", imageElement.complete, "naturalWidth:", imageElement.naturalWidth);

      const attemptLoadFullTexture = () => {
        if (textureRef.current) {
            // console.log("TextureLoad Effect: Deleting old texture.");
            gl.deleteTexture(textureRef.current);
            textureRef.current = null;
        }
        // console.log("TextureLoad Effect: Calling loadTexture().");
        const newTexture = loadTexture(gl, imageElement);
        if (newTexture) {
            textureRef.current = newTexture;
            // console.log("TextureLoad Effect: New texture loaded and set. Requesting draw.");
            requestAnimationFrame(drawScene); 
        } else {
            console.error("TextureLoad Effect: loadTexture() returned null.");
            textureRef.current = null; 
            requestAnimationFrame(drawScene); // Draw to clear canvas if texture failed
        }
      };

      if (imageElement.complete && imageElement.naturalWidth > 0) {
          // console.log("TextureLoad Effect: Image already complete, attempting to load texture directly.");
          attemptLoadFullTexture();
      } else {
          // console.log("TextureLoad Effect: Image not complete, adding event listeners.");
          const handleLoad = () => {
              // console.log("TextureLoad Effect: Image onload event fired.");
              attemptLoadFullTexture();
              imageElement.removeEventListener('load', handleLoad);
              imageElement.removeEventListener('error', handleError);
          };
          const handleError = () => {
              console.error("TextureLoad Effect: Image onerror event fired for src:", imageElement.src.substring(0,100));
              imageElement.removeEventListener('load', handleLoad);
              imageElement.removeEventListener('error', handleError);
              if (textureRef.current) { 
                  gl.deleteTexture(textureRef.current);
                  textureRef.current = null;
              }
              requestAnimationFrame(drawScene); // Draw to clear canvas
          };
          imageElement.addEventListener('load', handleLoad);
          imageElement.addEventListener('error', handleError);
          
          // If src is already set and image is somehow broken or loading state is stuck
          if (imageElement.src && (imageElement.complete || (imageElement as any).error)){
            if (imageElement.complete && imageElement.naturalWidth > 0) {
                // console.log("TextureLoad Effect: Image was already complete (race condition?). Calling handleLoad.");
                handleLoad();
            } else if ((imageElement as any).error) {
                // console.log("TextureLoad Effect: Image had an error (race condition?). Calling handleError.");
                handleError();
            }
          } else if (!imageElement.src) {
            // console.warn("TextureLoad Effect: originalImage has no src. This shouldn't happen.");
          }
      }
    } else { 
      // console.log("TextureLoad Effect: originalImage is null. Clearing texture and requesting draw.");
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      requestAnimationFrame(drawScene); 
    }
  }, [originalImage, loadTexture, drawScene, isInitializedRef]);


   useEffect(() => {
    if (!isInitializedRef.current || !glRef.current) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    // Optimization: Only re-render if settings actually change.
    const currentSettingsString = JSON.stringify(settings);
    if (lastRenderedSettingsRef.current === currentSettingsString && !(settings.grainIntensity > 0.001)) {
      // If only grain is active, we need the animation loop. Otherwise, if settings haven't changed, don't redraw.
      // return;
    }
    lastRenderedSettingsRef.current = currentSettingsString;


    let active = true;
    const renderLoop = () => {
      if (!active || !glRef.current) {
        animationFrameIdRef.current = null;
        return;
      }
      drawScene();
      // Only continue loop if grain is active, for animation
      if (settings.grainIntensity > 0.001 ) { 
        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
      } else {
        animationFrameIdRef.current = null; // Stop loop if grain is off
      }
    };
    
    // Initial draw for current settings or if grain animation needs to start/stop
    requestAnimationFrame(drawScene); // Ensure at least one draw for new settings

    if (settings.grainIntensity > 0.001) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); // Clear any existing loop
        animationFrameIdRef.current = requestAnimationFrame(renderLoop); // Start new loop
    } else { 
        // If grain is turned off, ensure the animation loop stops
        if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
    }
    
    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [settings, originalImage, drawScene, isInitializedRef]); // drawScene might change if its deps change, but it's memoized by useCallback


  useEffect(() => {
    return () => {
      // console.log("ImageCanvas: Unmounting. Cleaning up WebGL resources.");
      const gl = glRef.current;
      const pInfo = programInfoRef.current;
      const bInfo = buffersRef.current;
      const texInfo = textureRef.current;
      const animId = animationFrameIdRef.current;

      if (animId) cancelAnimationFrame(animId);
      
      if (gl) {
        if (texInfo) gl.deleteTexture(texInfo);
        if (pInfo && pInfo.program) {
            const attachedShaders = gl.getAttachedShaders(pInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => {
                    gl.detachShader(pInfo.program, shader);
                    gl.deleteShader(shader);
                });
            }
            gl.deleteProgram(pInfo.program);
        }
        if (bInfo) {
          if(bInfo.position) gl.deleteBuffer(bInfo.position);
          if(bInfo.textureCoord) gl.deleteBuffer(bInfo.textureCoord);
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
      // console.log("ImageCanvas: WebGL resources cleaned up.");
    };
  }, []);


  if (!originalImage) {
    return (
      <Card className="w-full h-full flex items-center justify-center bg-muted/50 border-dashed">
        <p className="text-muted-foreground">Upload an image to start editing</p>
      </Card>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full rounded-md shadow-lg" 
      style={{ 
        touchAction: 'none',
        imageRendering: isPreviewing ? 'pixelated' : 'auto' 
      }} 
    />
  );
}
