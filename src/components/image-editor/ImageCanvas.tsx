
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Vertex Shader
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
  // uniform float u_tiltAngle; // REMOVED - Tilt functionality was removed
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
    mat2 rotation90Matrix = mat2(c90, s90, -s90, c90); // CCW point rotation
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
  uniform float u_hueValue;          // Normalized 0-1 for 0-360 degrees
  uniform float u_temperatureShift;  // Normalized -0.5 to 0.5 for -100 to 100

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
  uniform vec2 u_resolution; // Canvas resolution for aspect-correct effects

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
      // Animate grain slightly by adding time to the coordinates
      vec2 st_anim = st + u_time * 0.01; // Adjust 0.01 to change animation speed
      return fract(sin(dot(st_anim.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // Hue ranges (normalized 0-1, approximate)
  const float HUE_RED_MAX = 0.05;      // ~18 degrees
  const float HUE_RED_MIN = 0.95;      // ~342 degrees (wraps around)
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

    if (u_vibrance != 0.0) { // u_vibrance ranges from -1 to 1
        vec3 vibrance_input_color = color; 
        float luma_vib = dot(vibrance_input_color, vec3(0.299, 0.587, 0.114));
        float Cmax = max(vibrance_input_color.r, max(vibrance_input_color.g, vibrance_input_color.b));
        float Cmin = min(vibrance_input_color.r, min(vibrance_input_color.g, vibrance_input_color.b));
        float current_pixel_saturation_metric = Cmax - Cmin; // How saturated is this pixel already?
        
        float vibrance_effect_strength = u_vibrance * 1.2; // Amplify effect slightly
        if (vibrance_effect_strength > 0.0) {
          // Increase saturation, more for less saturated colors
          color = mix(vec3(luma_vib), vibrance_input_color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));
        } else {
          // Decrease saturation (more uniformly than negative saturation)
          color = mix(vibrance_input_color, vec3(luma_vib), -vibrance_effect_strength); // vibrance_effect_strength is negative
        }
    }
    
    color *= pow(2.0, u_exposure); // u_exposure from -0.5 to 0.5
    
    // Must clamp after exposure to avoid negative colors affecting luma calculation for shadows/highlights
    color = clamp(color, 0.0, 1.0); 
    
    if (u_shadows != 0.0) { // u_shadows from -1 to 1
        float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
        // Positive shadows lift, negative shadows darken
        color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
    }
    color = clamp(color, 0.0, 1.0); // Clamp again after shadows
    
    if (u_highlights != 0.0) { // u_highlights from -1 to 1
        float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));
        // Negative highlights recover, positive highlights brighten
        color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);
    }
    color = clamp(color, 0.0, 1.0); // Clamp again after highlights

    // Whites and Blacks (Levels adjustment)
    // u_blacks: positive lifts blacks, negative crushes blacks
    // u_whites: positive clips whites, negative pulls whites down
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_adjust = 1.0 + u_whites * 0.15; 
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001); // Ensure white > black

    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);
    color = clamp(color, 0.0, 1.0);


    // --- Color Adjustments ---
    if (u_hueValue != 0.0) { // u_hueValue is 0-1 for 0-360 degrees
        vec3 hsv_hue = rgbToHsv(color);
        hsv_hue.x = mod(hsv_hue.x + u_hueValue, 1.0);
        color = hsvToRgb(hsv_hue);
    }

    if (u_temperatureShift != 0.0) { // u_temperatureShift from -0.5 to 0.5
        float temp_strength = u_temperatureShift * 0.3; // Modulate strength
        color.r += temp_strength;
        color.b -= temp_strength;
    }

    // --- Tinting ---
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Luminance for tint masking
    // Shadow Tint
    if (u_tintShadowsIntensityFactor > 0.001) {
      vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
      float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); // Adjust smoothstep for mask range
      color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }
    // Highlight Tint
    if (u_tintHighlightsIntensityFactor > 0.001) {
      vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
      float highlightMask = smoothstep(0.55, 1.0, luma_tint); // Adjust smoothstep for mask range
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
    // Vignette
    if (u_vignetteIntensity > 0.001) { // u_vignetteIntensity is 0 to 1
        float vignetteRadius = 0.7; 
        float vignetteSoftness = 0.6;
        // v_textureCoord is from 0,0 (bottom-left) to 1,1 (top-right)
        float dist_vignette = distance(v_textureCoord, vec2(0.5)); // Distance from center
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        // Apply vignette by darkening towards edges
        color.rgb *= mix(vignetteFactor, 1.0, 1.0 - (u_vignetteIntensity * 1.5) ); // Stronger effect
    }

    // Grain
    if (u_grainIntensity > 0.001) { // u_grainIntensity is 0 to 1
        // Scale grain coordinates by canvas width to make grain size somewhat consistent
        // Animate by adding u_time
        vec2 grainCoord = (v_textureCoord * u_resolution.x / 50.0 ) + u_time * 0.1; // Adjusted grain scale and animation speed
        float noise = (random(grainCoord) - 0.5) * 0.15; // Noise range approx -0.075 to 0.075
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
    rotationAngle: WebGLUniformLocation | null; // For 90-degree rotations
    scale: WebGLUniformLocation | null;          // For flipX, flipY
    cropTexScale: WebGLUniformLocation | null;   // For zoom
    cropTexOffset: WebGLUniformLocation | null;  // For pan
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

// Constants for canvas size limits
const MAX_WIDTH_STANDARD_RATIO = 800; // For aspect ratios <= 1.6 (e.g., 4:3, 1:1, 3:4)
const MAX_WIDTH_WIDE_RATIO = 960;     // For aspect ratios > 1.6 (e.g., 16:9)
const MAX_PHYSICAL_HEIGHT_CAP = 1000; // Absolute cap for portrait images

const PREVIEW_SCALE_FACTOR = 0.5; // For rendering preview quickly.
const NOISE_CANVAS_SIZE = 250; // Increased from 100 for less repetition

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing, noiseImageDataRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string): boolean => {
    if (!glContext) return true; // Indicate error if context is null
    let errorFound = false;
    let error = glContext.getError();
    while (error !== glContext.NO_ERROR) {
      errorFound = true;
      let errorMsg = "WebGL Error";
      switch (error) {
        case glContext.INVALID_ENUM: errorMsg = "INVALID_ENUM"; break;
        case glContext.INVALID_VALUE: errorMsg = "INVALID_VALUE"; break;
        case glContext.INVALID_OPERATION: errorMsg = "INVALID_OPERATION"; break;
        case glContext.OUT_OF_MEMORY: errorMsg = "OUT_OF_MEMORY"; break;
        case glContext.CONTEXT_LOST_WEBGL: errorMsg = "CONTEXT_LOST_WEBGL"; break;
        default: errorMsg = `Unknown error code: ${error}`; break;
      }
      console.error(`WebGL Error (${operation}): ${errorMsg} (Code: ${error})`);
      error = glContext.getError(); // Get next error
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
      const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
      console.error(`An error occurred compiling the ${shaderType} shader: ${gl.getShaderInfoLog(shader)}`);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    if (!vertexShader) return null;
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!fragmentShader) {
      gl.deleteShader(vertexShader);
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
      if (canvas && gl) { 
        gl.clearColor(0.188, 0.188, 0.188, 1.0); 
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      }
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

    let baseCanvasWidth = imgNatWidth;
    let baseCanvasHeight = imgNatHeight;
    const imageAspectRatio = imgNatWidth / imgNatHeight;

    if (imageAspectRatio > 1) { 
        baseCanvasWidth = Math.min(baseCanvasWidth, (imageAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        baseCanvasHeight = baseCanvasWidth / imageAspectRatio;
    } else { 
        baseCanvasHeight = Math.min(baseCanvasHeight, MAX_PHYSICAL_HEIGHT_CAP);
        baseCanvasWidth = baseCanvasHeight * imageAspectRatio;
        if (baseCanvasWidth > MAX_WIDTH_STANDARD_RATIO) { 
            baseCanvasWidth = MAX_WIDTH_STANDARD_RATIO;
            baseCanvasHeight = baseCanvasWidth / imageAspectRatio;
        }
    }
    
    let targetFullResWidth = Math.max(1, Math.round(baseCanvasWidth));
    let targetFullResHeight = Math.max(1, Math.round(baseCanvasHeight));
    
    if (settings.rotation === 90 || settings.rotation === 270) {
        [targetFullResWidth, targetFullResHeight] = [targetFullResHeight, targetFullResWidth];
    }
    
    let currentRenderWidth = targetFullResWidth;
    let currentRenderHeight = targetFullResHeight;

    if (isPreviewing) {
        currentRenderWidth = Math.max(1, Math.round(targetFullResWidth * PREVIEW_SCALE_FACTOR));
        // Maintain aspect ratio for preview height
        if (targetFullResWidth > 0 && targetFullResHeight > 0) { // Avoid division by zero
             currentRenderHeight = Math.max(1, Math.round(currentRenderWidth / (targetFullResWidth / targetFullResHeight) ));
        } else {
             currentRenderHeight = Math.max(1, Math.round(targetFullResHeight * PREVIEW_SCALE_FACTOR)); // Fallback
        }
    }
    
    if (canvas.width !== currentRenderWidth || canvas.height !== currentRenderHeight) {
        canvas.width = currentRenderWidth;
        canvas.height = currentRenderHeight;
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
    }

    if (currentBuffers.textureCoord && programInfo.attribLocations.textureCoord !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) {
        gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    }

    // Pass all settings to uniforms
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
    
    const totalEffectiveZoom = settings.cropZoom; // No auto-zoom for tilt as tilt is removed
    const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    
    const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0); 
    
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset * -1.0; 

    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);

    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settings.activeSelectiveColorTarget);
    
    if (programInfo.uniformLocations.selectedColorTargetIndex && targetIndex !== -1) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex);
    } else if (programInfo.uniformLocations.selectedColorTargetIndex) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, -1); 
    }

    const currentSelective = settings.selectiveColors[settings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

    checkGLError(gl, "drawScene - before drawArrays after setting uniforms");
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, settings, canvasRef, isPreviewing, checkGLError]); // Added isPreviewing


  // Initialize WebGL context, shaders, program, buffers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isInitializedRef.current) {
      if (originalImage) requestAnimationFrame(drawScene);
      return;
    }
    
    let context = canvas.getContext('webgl', { preserveDrawingBuffer: true });
    if (!context) {
      context = canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    }
    if (!context) {
      console.error("ImageCanvas: Unable to initialize WebGL context.");
      isInitializedRef.current = false;
      return;
    }
    glRef.current = context;

    const pInfo = initShaderProgram(glRef.current);
    if (pInfo) {
      programInfoRef.current = pInfo;
    } else {
      console.error("ImageCanvas: Shader program initialization failed.");
      glRef.current = null; 
      isInitializedRef.current = false;
      return;
    }

    const bInfo = initBuffers(glRef.current);
    if (bInfo) {
      buffersRef.current = bInfo;
    } else {
      console.error("ImageCanvas: WebGL buffer initialization failed.");
      glRef.current = null; 
      programInfoRef.current = null;
      isInitializedRef.current = false;
      return;
    }
    isInitializedRef.current = true;
    requestAnimationFrame(drawScene); 
  }, [canvasRef, initShaderProgram, initBuffers, drawScene, originalImage]);


  // Load texture when originalImage changes or WebGL becomes initialized
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) return;

    if (originalImage) {
      const imageElement = originalImage;
      
      const attemptLoad = () => {
        if (textureRef.current) {
            gl.deleteTexture(textureRef.current); 
            textureRef.current = null;
        }
        const newTexture = loadTexture(gl, imageElement);
        if (newTexture) {
            textureRef.current = newTexture;
            requestAnimationFrame(drawScene); 
        } else {
            textureRef.current = null; 
            requestAnimationFrame(drawScene);
        }
      };

      if (imageElement.complete && imageElement.naturalWidth > 0) {
        attemptLoad();
      } else {
        const handleLoad = () => {
          attemptLoad();
          imageElement.removeEventListener('load', handleLoad);
          imageElement.removeEventListener('error', handleError);
        };
        const handleError = () => {
          console.error("TextureLoad Effect: Image onerror event for src:", imageElement.src.substring(0,100));
          imageElement.removeEventListener('load', handleLoad);
          imageElement.removeEventListener('error', handleError);
          if (textureRef.current) { 
              gl.deleteTexture(textureRef.current);
              textureRef.current = null;
          }
          requestAnimationFrame(drawScene); 
        };
        imageElement.addEventListener('load', handleLoad);
        imageElement.addEventListener('error', handleError);
        
        if (imageElement.src && (imageElement.complete || (imageElement as any).error)){
          if (imageElement.complete && imageElement.naturalWidth > 0) {
              handleLoad(); 
          } else if ((imageElement as any).error) {
              handleError(); 
          }
        } else if (!imageElement.src) {
             console.warn("TextureLoad Effect: originalImage has no src.");
        }
      }
    } else { 
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      requestAnimationFrame(drawScene); 
    }
  }, [originalImage, isInitializedRef, loadTexture, drawScene]); 


  // Animation loop for effects like grain
   useEffect(() => {
    if (!isInitializedRef.current || !glRef.current || !originalImage || !textureRef.current) {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return;
    }

    let active = true;
    const renderLoop = () => {
      if (!active || !glRef.current) { 
        animationFrameIdRef.current = null;
        return;
      }
      drawScene();
      if (settings.grainIntensity > 0.001 ) { 
        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
      } else {
        animationFrameIdRef.current = null; 
      }
    };
    
    requestAnimationFrame(drawScene); 

    if (settings.grainIntensity > 0.001) { 
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current); 
        animationFrameIdRef.current = requestAnimationFrame(renderLoop); 
    } else { 
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
  }, [settings, originalImage, drawScene, isInitializedRef]); 


  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
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
        const loseContextExt = gl.getExtension('WEBGL_lose_context');
        if (loseContextExt) {
            loseContextExt.loseContext();
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
    };
  }, []);

  // Effect for noise ImageData generation
  useEffect(() => {
    if (!noiseImageDataRef.current) {
      try {
        const noiseCv = document.createElement('canvas');
        noiseCv.width = NOISE_CANVAS_SIZE;
        noiseCv.height = NOISE_CANVAS_SIZE;
        const noiseCtx = noiseCv.getContext('2d', { willReadFrequently: true });

        if (noiseCtx) {
          const imageData = noiseCtx.createImageData(NOISE_CANVAS_SIZE, NOISE_CANVAS_SIZE);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const rand = Math.floor(Math.random() * 256); // Full range noise
            data[i] = rand;     // Red
            data[i + 1] = rand; // Green
            data[i + 2] = rand; // Blue
            data[i + 3] = 255;  // Alpha
          }
          noiseImageDataRef.current = imageData;
        } else {
          console.warn("Could not get 2D context for noise ImageData generation for grain.");
        }
      } catch (error) {
        console.error("Error creating noise ImageData for grain:", error);
      }
    }
  }, [noiseImageDataRef]);


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
      // style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }} // This line was causing jiggle
      style={{ imageRendering: 'auto' }}
    />
  );
}

