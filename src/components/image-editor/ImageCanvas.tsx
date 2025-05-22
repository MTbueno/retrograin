
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Vertex Shader - Using standard string concatenation
const vsSource =
  'attribute vec4 a_position;' + '\n' +
  'attribute vec2 a_texCoord;' + '\n' +
  'uniform float u_rotationAngle;' + '\n' + // For 90-degree rotations
  'uniform vec2 u_scale;' + '\n' + // For flips
  'uniform vec2 u_crop_tex_scale;' + '\n' + // For zoom
  'uniform vec2 u_crop_tex_offset;' + '\n' + // For pan
  'varying highp vec2 v_textureCoord;' + '\n' +
  'void main(void) {' + '\n' +
  '  gl_Position = a_position;' + '\n' +
  '  vec2 texCoord = a_texCoord;' + '\n' +
  '  texCoord -= 0.5;' + '\n' + // Center to origin
  '  texCoord *= u_scale;' + '\n' + // Apply flip
  '  float c90 = cos(u_rotationAngle);' + '\n' +
  '  float s90 = sin(u_rotationAngle);' + '\n' +
  '  mat2 rotation90Matrix = mat2(c90, -s90, s90, c90);' + '\n' + 
  '  texCoord = rotation90Matrix * texCoord;' + '\n' + // Apply 90-degree rotation
  '  texCoord *= u_crop_tex_scale;' + '\n' + // Apply zoom
  '  texCoord += u_crop_tex_offset;' + '\n' + // Apply pan
  '  texCoord += 0.5;' + '\n' + // Uncenter
  '  v_textureCoord = texCoord;' + '\n' +
  '}';

// Fragment Shader - Using standard string concatenation
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
  'uniform vec2 u_resolution;' + '\n' + // Canvas resolution for effects like grain
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
  '  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);' + '\n' +
  '}' + '\n' +

  // Hue ranges for selective color (0-1)
  'const float HUE_RED_MAX = 0.05;' + '\n' +
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
  '  if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {' + '\n' +
  '    discard;' + '\n' +
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
  // Clamp after exposure
  '  float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
  '  color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial));' + '\n' +
  // Clamp after shadows
  '  float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));' + '\n' +
  '  color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);' + '\n' +
  // Clamp after highlights
  '  float black_point_adjust = u_blacks * 0.15;' + '\n' +
  '  float white_point_adjust = 1.0 + u_whites * 0.15;' + '\n' +
  '  white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001);' + '\n' +
  '  color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);' + '\n' +
  // Clamp after levels

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
  // Clamp after temperature

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
  // Clamp after tint

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
  // Clamp after selective color

  // Effects
  '  if (u_vignetteIntensity > 0.001) {' + '\n' +
  '      float vignetteRadius = 0.7;' + '\n' +
  '      float vignetteSoftness = 0.6;' + '\n' +
  '      float dist_vignette = distance(v_textureCoord, vec2(0.5));' + '\n' +
  '      float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);' + '\n' +
  '      color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);' + '\n' +
  '  }' + '\n' +

  '  if (u_grainIntensity > 0.001) {' + '\n' +
  '    float grain_scale_factor = u_resolution.x > 0.0 ? 50.0 / u_resolution.x : 1.0;' + '\n' + // Scale factor for grain size (using width for consistency)
  '    vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor;' + '\n' +
  '    float grain_noise = (random(grainCoord) - 0.5) * 0.15;' + '\n' + // Static grain based on texture coord
  '    color.rgb += grain_noise * u_grainIntensity;' + '\n' +
  '  }' + '\n' +

  '  gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);' + '\n' + // Final clamp
  '}';


// Constants for canvas size limits
const MAX_WIDTH_STANDARD_RATIO = 800;
const MAX_WIDTH_WIDE_RATIO = 960;
const MAX_PHYSICAL_HEIGHT_CAP = 1000;
// const PREVIEW_SCALE_FACTOR = 0.5; // No longer used to scale canvas buffer directly

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
    resolution: WebGLUniformLocation | null;
    rotationAngle: WebGLUniformLocation | null;
    scale: WebGLUniformLocation | null;
    cropTexScale: WebGLUniformLocation | null;
    cropTexOffset: WebGLUniformLocation | null;
    selectedColorTargetIndex: WebGLUniformLocation | null;
    hueAdjustment: WebGLUniformLocation | null;
    saturationAdjustment: WebGLUniformLocation | null;
    luminanceAdjustment: WebGLUniformLocation | null;
    // u_time removed
  };
}

interface Buffers {
  position: WebGLBuffer | null;
  textureCoord: WebGLBuffer | null;
}

export function ImageCanvas() {
  const { originalImage, settings, canvasRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const isInitializedRef = useRef(false);
  // const animationFrameIdRef = useRef<number | null>(null); // No longer needed for grain animation

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
      const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
      console.error('An error occurred compiling the ' + shaderType + ' shader: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
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
    console.log('Shader program linked successfully.');

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
    Object.keys(progInfo.uniformLocations).forEach(key => {
      if (progInfo.uniformLocations[key as keyof ProgramInfo['uniformLocations']] === null || progInfo.uniformLocations[key as keyof ProgramInfo['uniformLocations']] === -1) {
         // console.warn('Uniform location for ' + key + ' not found or invalid (this is expected for u_time if removed).');
      }
    });
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
    const textureCoordinates = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
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
      // console.log('Texture loaded successfully into WebGL.');
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

    if (!gl || !programInfo || !currentBuffers || !canvas || !isInitializedRef.current) {
      // console.warn('drawScene: WebGL not fully initialized or canvas not ready.');
      if (canvas && gl) { // Attempt to clear if possible
          gl.clearColor(0.188, 0.188, 0.188, 1.0); 
          gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }
    
    if (!originalImage || !currentTexture) {
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Dark gray background
        gl.clear(gl.COLOR_BUFFER_BIT);
        // console.log("drawScene: No original image or texture to draw, cleared canvas.");
        return;
    }

    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;
    let contentAspectRatio = imgNatWidth / imgNatHeight;

    let baseCanvasWidth: number;
    let baseCanvasHeight: number;

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
        [finalCanvasWidth, finalCanvasHeight] = [finalCanvasHeight, finalCanvasWidth];
    }

    // This defines the drawing buffer size
    if (canvas.width !== finalCanvasWidth || canvas.height !== finalCanvasHeight) {
        canvas.width = finalCanvasWidth;
        canvas.height = finalCanvasHeight;
        // console.log(`Resized canvas to: ${finalCanvasWidth}x${finalCanvasHeight}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.188, 0.188, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, 'drawScene - after clear');

    gl.useProgram(programInfo.program);
    checkGLError(gl, 'drawScene - after useProgram');

    // Set vertex positions
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, 'drawScene - after position attribute setup');

    // Set texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, 'drawScene - after texCoord attribute setup');

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    checkGLError(gl, 'drawScene - after texture binding');
    
    // Pass settings to uniforms
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
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

    let rotationInRadians = 0;
    switch (settings.rotation) {
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settings.scaleX, settings.scaleY);

    // Crop and Pan uniforms
    const totalEffectiveZoom = settings.cropZoom; 
    const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0);
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset * -1.0; 
    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);
    
    // Selective Color
    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settings.activeSelectiveColorTarget);
    if (programInfo.uniformLocations.selectedColorTargetIndex) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
    }
    const currentSelective = settings.selectiveColors[settings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

    checkGLError(gl, 'drawScene - after setting uniforms');
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    checkGLError(gl, 'drawScene - after drawArrays');

  }, [originalImage, settings, canvasRef, checkGLError]);


  // One-time WebGL setup: context, shaders, program, buffers
  useEffect(() => {
    if (!canvasRef.current || isInitializedRef.current) return;

    const gl = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) {
      console.error('ImageCanvas: Unable to initialize WebGL context.');
      return;
    }
    glRef.current = gl;
    // console.log('WebGL context successfully stored in glRef.');

    const pInfo = initShaderProgram(gl);
    if (!pInfo) {
      console.error('ImageCanvas: Shader program initialization failed.');
      glRef.current = null;
      return;
    }
    programInfoRef.current = pInfo;

    const bInfo = initBuffers(gl);
    if (!bInfo) {
      console.error('ImageCanvas: WebGL buffer initialization failed.');
      glRef.current = null;
      programInfoRef.current = null;
      return;
    }
    buffersRef.current = bInfo;

    isInitializedRef.current = true;
    requestAnimationFrame(drawScene); // Initial draw to clear or show placeholder
    
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]);


  // Effect for loading/updating the main image texture
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) {
        // console.log('TextureLoadEffect: GL not ready or not initialized.');
        return;
    }

    if (originalImage) {
        const imageElement = originalImage;
        const attemptLoadTexture = () => {
            // console.log('Attempting to load texture for:', imageElement.src.substring(0, 50));
            if (textureRef.current) {
                gl.deleteTexture(textureRef.current);
                textureRef.current = null;
            }
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                textureRef.current = newTexture;
                // console.log('New texture loaded, requesting drawScene.');
                requestAnimationFrame(drawScene);
            } else {
                textureRef.current = null; // Ensure it's null if loading failed
                console.error('Failed to load new main texture.');
                requestAnimationFrame(drawScene); // Still draw to clear canvas
            }
        };

        if (imageElement.complete && imageElement.naturalWidth > 0) {
            // console.log('Image is complete, loading texture.');
            attemptLoadTexture();
        } else if (imageElement.src) {
            // console.log('Image not complete, adding event listeners.');
            const handleLoad = () => {
                // console.log('Image onload event triggered.');
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
                attemptLoadTexture();
            };
            const handleError = (e: Event | string) => {
                console.error('Image onerror event triggered:', e);
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
                if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
                requestAnimationFrame(drawScene); // Clear canvas
            };
            imageElement.addEventListener('load', handleLoad);
            imageElement.addEventListener('error', handleError);
        } else {
            // console.log('No originalImage src. Clearing texture, requesting drawScene.');
            if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
            requestAnimationFrame(drawScene);
        }
    } else { // No originalImage
        // console.log('originalImage is null. Clearing texture, requesting drawScene.');
        if (textureRef.current) {
            gl.deleteTexture(textureRef.current);
            textureRef.current = null;
        }
        requestAnimationFrame(drawScene); // Ensure canvas is cleared
    }
  }, [originalImage, isInitializedRef, loadTexture, drawScene, glRef ]);


  // Effect for re-drawing when settings change (no animation loop for static grain)
  useEffect(() => {
    if (!isInitializedRef.current || !glRef.current) {
      return;
    }
    // console.log('Settings changed, requesting redraw.');
    requestAnimationFrame(drawScene);
  }, [settings, drawScene]); // Redraw whenever settings change


  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      const pInfo = programInfoRef.current;
      const bInfo = buffersRef.current;

      // if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);

      if (gl) {
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        if (pInfo && pInfo.program) {
            const attachedShaders = gl.getAttachedShaders(pInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => { 
                    if (shader) { // Check if shader is not null
                        gl.detachShader(pInfo.program, shader); 
                        gl.deleteShader(shader); 
                    }
                });
            }
            gl.deleteProgram(pInfo.program);
        }
        if (bInfo) {
          if(bInfo.position) gl.deleteBuffer(bInfo.position);
          if(bInfo.textureCoord) gl.deleteBuffer(bInfo.textureCoord);
        }
        const loseContextExt = gl.getExtension('WEBGL_lose_context');
        if (loseContextExt) {
          // loseContextExt.loseContext(); // Consider if really needed; can be aggressive
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
      // console.log("WebGL resources cleaned up on unmount.");
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
