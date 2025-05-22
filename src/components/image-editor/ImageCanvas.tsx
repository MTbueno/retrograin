
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

  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_vibrance;
  uniform float u_exposure;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;
  
  uniform float u_hueValue; // Normalized 0-1, where 0.5 is no change
  uniform float u_temperatureShift; // Normalized -0.5 to 0.5

  uniform vec3 u_tintShadowsColorRGB;
  uniform float u_tintShadowsIntensityFactor;
  uniform float u_tintShadowsSaturationValue;
  uniform vec3 u_tintHighlightsColorRGB;
  uniform float u_tintHighlightsIntensityFactor;
  uniform float u_tintHighlightsSaturationValue;

  uniform float u_vignetteIntensity;
  uniform float u_grainIntensity;
  uniform float u_sharpness;
  uniform vec2 u_resolution; // For grain and sharpness

  // Selective Color Uniforms
  uniform int u_selectedColorTargetIndex; // 0:reds, 1:oranges, ..., 7:magentas, -1:none
  uniform float u_hueAdjustment;         // For selective color, e.g., -0.1 to 0.1 (shader uses -0.5 to 0.5)
  uniform float u_saturationAdjustment;  // For selective color, e.g., -0.5 to 0.5
  uniform float u_luminanceAdjustment;   // For selective color, e.g., -0.5 to 0.5


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
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0); // Transparent for out-of-bounds
        return;
    }
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // Basic Adjustments
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

    // Color Adjustments
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

    // Tinting
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

    // Selective Color
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

    // Effects
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
      float grain_noise = (random(grainCoord) - 0.5) * 0.15; 
      color.rgb += grain_noise * u_grainIntensity;
    }

    // Sharpness
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
    sharpness: WebGLUniformLocation | null;
    resolution: WebGLUniformLocation | null;
    rotationAngle: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
    cropTexScale: WebGLUniformLocation | null;
    cropTexOffset: WebGLUniformLocation | null;
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

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, noiseImageDataRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const isInitializedRef = useRef(false);
  const animationFrameIdRef = useRef<number | null>(null);
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
        sharpness: gl.getUniformLocation(shaderProgram, 'u_sharpness'),
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
    
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
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
    } catch (e) {
      console.error('Error during texImage2D for main texture:', e);
      gl.deleteTexture(texture); return null;
    }
    if (checkGLError(gl, 'loadTexture - after texImage2D')) {
        gl.deleteTexture(texture); return null;
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
    const currentSettings = settings; // Use the latest settings from context

    if (!gl || !programInfo || !currentBuffers || !canvas || !isInitializedRef.current) {
      return;
    }
    
    if (!originalImage || !currentTexture) {
        gl.clearColor(0.188, 0.188, 0.188, 1.0); 
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;

    let sWidth = imgNatWidth; // Source width from original image
    let sHeight = imgNatHeight; // Source height from original image

    let baseCanvasWidth, baseCanvasHeight;
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
    
    let finalCanvasWidth = baseCanvasWidth;
    let finalCanvasHeight = baseCanvasHeight;

    if (currentSettings.rotation === 90 || currentSettings.rotation === 270) {
        [finalCanvasWidth, finalCanvasHeight] = [finalCanvasHeight, finalCanvasWidth];
    }
    
    // This comparison should only trigger if essential dimensions change (new image, rotation)
    if (canvas.width !== finalCanvasWidth || canvas.height !== finalCanvasHeight) {
        canvas.width = finalCanvasWidth;
        canvas.height = finalCanvasHeight;
        initialCanvasSetupDoneRef.current = true; // Signal that canvas dimensions are set for current image/rotation
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.188, 0.188, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, 'drawScene - after clear');

    gl.useProgram(programInfo.program);
    checkGLError(gl, 'drawScene - after useProgram');

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, 'drawScene - after position attribute setup');

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, 'drawScene - after texCoord attribute setup');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    checkGLError(gl, 'drawScene - after texture binding');
    
    const settingsToApply = currentSettings.isViewingOriginal
    ? { 
        ...initialImageSettings, 
        rotation: currentSettings.rotation, scaleX: currentSettings.scaleX, scaleY: currentSettings.scaleY,
        cropZoom: currentSettings.cropZoom, cropOffsetX: currentSettings.cropOffsetX, cropOffsetY: currentSettings.cropOffsetY,
        selectiveColors: JSON.parse(JSON.stringify(initialImageSettings.selectiveColors)),
        tintShadowsColor: initialImageSettings.tintShadowsColor,
        tintShadowsIntensity: initialImageSettings.tintShadowsIntensity,
        tintShadowsSaturation: initialImageSettings.tintShadowsSaturation,
        tintHighlightsColor: initialImageSettings.tintHighlightsColor,
        tintHighlightsIntensity: initialImageSettings.tintHighlightsIntensity,
        tintHighlightsSaturation: initialImageSettings.tintHighlightsSaturation,
      }
    : currentSettings;

    // Pass visual effect uniforms
    if (programInfo.uniformLocations.brightness) gl.uniform1f(programInfo.uniformLocations.brightness, settingsToApply.brightness);
    if (programInfo.uniformLocations.contrast) gl.uniform1f(programInfo.uniformLocations.contrast, settingsToApply.contrast);
    if (programInfo.uniformLocations.saturation) gl.uniform1f(programInfo.uniformLocations.saturation, settingsToApply.saturation);
    if (programInfo.uniformLocations.vibrance) gl.uniform1f(programInfo.uniformLocations.vibrance, settingsToApply.vibrance);
    if (programInfo.uniformLocations.exposure) gl.uniform1f(programInfo.uniformLocations.exposure, settingsToApply.exposure);
    if (programInfo.uniformLocations.highlights) gl.uniform1f(programInfo.uniformLocations.highlights, settingsToApply.highlights);
    if (programInfo.uniformLocations.shadows) gl.uniform1f(programInfo.uniformLocations.shadows, settingsToApply.shadows);
    if (programInfo.uniformLocations.whites) gl.uniform1f(programInfo.uniformLocations.whites, settingsToApply.whites);
    if (programInfo.uniformLocations.blacks) gl.uniform1f(programInfo.uniformLocations.blacks, settingsToApply.blacks);
    if (programInfo.uniformLocations.sharpness) gl.uniform1f(programInfo.uniformLocations.sharpness, settingsToApply.sharpness);
    
    if (programInfo.uniformLocations.hueValue) gl.uniform1f(programInfo.uniformLocations.hueValue, (settingsToApply.hueRotate / 360.0));
    if (programInfo.uniformLocations.temperatureShift) gl.uniform1f(programInfo.uniformLocations.temperatureShift, (settingsToApply.colorTemperature / 200.0));

    const shadowRgb = hexToRgbNormalizedArray(settingsToApply.tintShadowsColor);
    if (programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    else if (programInfo.uniformLocations.tintShadowsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, [0.5, 0.5, 0.5]);
    if (programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintShadowsIntensityFactor, settingsToApply.tintShadowsIntensity);
    if (programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintShadowsSaturationValue, settingsToApply.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(settingsToApply.tintHighlightsColor);
    if (programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    else if (programInfo.uniformLocations.tintHighlightsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, [0.5, 0.5, 0.5]);
    if (programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintHighlightsIntensityFactor, settingsToApply.tintHighlightsIntensity);
    if (programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintHighlightsSaturationValue, settingsToApply.tintHighlightsSaturation);
    
    if (programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(programInfo.uniformLocations.vignetteIntensity, settingsToApply.vignetteIntensity);
    if (programInfo.uniformLocations.grainIntensity) gl.uniform1f(programInfo.uniformLocations.grainIntensity, settingsToApply.grainIntensity);
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    
    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settingsToApply.activeSelectiveColorTarget);
    if (programInfo.uniformLocations.selectedColorTargetIndex != null) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
    }
    const currentSelective = settingsToApply.selectiveColors[settingsToApply.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

    // Transform uniforms
    let rotationInRadians = 0;
    switch (currentSettings.rotation) { // Use currentSettings for actual transforms
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, currentSettings.scaleX, currentSettings.scaleY);

    const totalEffectiveZoom = currentSettings.cropZoom;
    const u_crop_tex_scale_val: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    const maxTexOffset = Math.max(0, (totalEffectiveZoom - 1.0) / (2.0 * totalEffectiveZoom) );
    let texOffsetX = currentSettings.cropOffsetX * maxTexOffset;
    let texOffsetY = currentSettings.cropOffsetY * maxTexOffset * -1.0; 

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, u_crop_tex_scale_val);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, [texOffsetX, texOffsetY]);

    checkGLError(gl, 'drawScene - after setting uniforms');
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    checkGLError(gl, 'drawScene - after drawArrays');

  }, [originalImage, settings, canvasRef, checkGLError, noiseImageDataRef]); 


  // One-time WebGL setup: context, shaders, program, buffers
  useEffect(() => {
    if (!canvasRef.current || isInitializedRef.current) {
      return;
    }
    const gl = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      console.error('ImageCanvas: Unable to initialize WebGL context.');
      return;
    }
    glRef.current = gl;

    const pInfo = initShaderProgram(gl);
    if (!pInfo) {
      console.error("WebGL Init: Shader program initialization failed.");
      glRef.current = null;
      return;
    }
    programInfoRef.current = pInfo;

    const bInfo = initBuffers(gl);
    if (!bInfo) {
      console.error("WebGL Init: Buffer initialization failed.");
      glRef.current = null;
      programInfoRef.current = null;
      return;
    }
    buffersRef.current = bInfo;

    isInitializedRef.current = true;
    requestAnimationFrame(drawScene); 
    
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]); 

  // Effect for loading/updating the main image texture AND setting canvas dimensions
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) return;

    if (originalImage) {
        const imageElement = originalImage;
        const handleLoadOrComplete = () => {
            if (textureRef.current) {
                gl.deleteTexture(textureRef.current);
                textureRef.current = null;
            }
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                textureRef.current = newTexture;
            } else {
                console.error("Texture Load: Failed to load new texture.");
                textureRef.current = null;
            }
            requestAnimationFrame(drawScene); // Redraw after texture is set or if it failed
        };

        if (imageElement.complete && imageElement.naturalWidth > 0) {
            handleLoadOrComplete();
        } else if (imageElement.src) {
            imageElement.onload = handleLoadOrComplete;
            imageElement.onerror = () => {
                console.error("Texture Load: Image onerror event triggered.");
                if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
                requestAnimationFrame(drawScene);
            };
        } else {
             if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
             requestAnimationFrame(drawScene);
        }
    } else { 
        if (textureRef.current) {
            gl.deleteTexture(textureRef.current);
            textureRef.current = null;
        }
        requestAnimationFrame(drawScene); 
    }
  }, [originalImage, isInitializedRef, loadTexture, drawScene, settings.rotation, settings.cropZoom]); // Add settings.rotation and settings.cropZoom for canvas resize

  // Effect for re-drawing when settings (uniforms) change OR for grain animation
  useEffect(() => {
    if (!isInitializedRef.current || !glRef.current || !textureRef.current ) { // Only draw if texture is ready
      if(!originalImage && isInitializedRef.current && glRef.current) { // If no image, but GL is init, clear canvas
         requestAnimationFrame(drawScene);
      }
      return;
    }
    
    requestAnimationFrame(drawScene);
    
  }, [settings, drawScene, originalImage]); 


  // Effect for noise ImageData generation
  useEffect(() => {
    if (!noiseImageDataRef.current) {
      try {
        let imageData: ImageData | null = null;
        try {
            imageData = new ImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
        } catch (directError) {
            const noiseCv = document.createElement('canvas');
            noiseCv.width = NOISE_CANVAS_SIZE;
            noiseCv.height = NOISE_CANVAS_SIZE;
            const noiseCtx = noiseCv.getContext('2d');
            if (noiseCtx) {
                imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
            } else {
                 console.error("FAILURE: Could not get 2D context for noise ImageData generation fallback.");
            }
        }

        if (imageData) {
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
              const rand = Math.floor(Math.random() * 256);
              data[i] = rand; data[i + 1] = rand; data[i + 2] = rand; data[i + 3] = 255;
            }
            noiseImageDataRef.current = imageData;
            console.log(`SUCCESS: Noise ImageData (${NOISE_CANVAS_SIZE}x${NOISE_CANVAS_SIZE}) created.`);
        } else {
            console.error("FAILURE: Could not create ImageData for noise pattern.");
        }
      } catch (error) {
        console.error("Error creating noise ImageData:", error);
      }
    }
  }, [noiseImageDataRef]);


  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      const gl = glRef.current;
      if (gl) {
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        const pInfo = programInfoRef.current;
        if (pInfo && pInfo.program) {
            const attachedShaders = gl.getAttachedShaders(pInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => { 
                    if (shader) { gl.detachShader(pInfo.program, shader); gl.deleteShader(shader); }
                });
            }
            gl.deleteProgram(pInfo.program);
        }
        const bInfo = buffersRef.current;
        if (bInfo) {
          if(bInfo.position) gl.deleteBuffer(bInfo.position);
          if(bInfo.textureCoord) gl.deleteBuffer(bInfo.textureCoord);
        }
      }
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
    />
  );
}

