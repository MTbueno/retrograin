
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor, type ImageSettings, initialImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Constants for canvas size limits for preview rendering
const MAX_WIDTH_STANDARD_RATIO = 720; // For aspect ratios <= 1.6 (e.g., 4:3, 1:1, 3:4)
const MAX_WIDTH_WIDE_RATIO = 800;     // For aspect ratios > 1.6 (e.g., 16:9)
const MAX_PHYSICAL_HEIGHT_CAP = 1000;  // Absolute cap on physical height for very tall images
const MAX_TEXTURE_DIMENSION = 4096; // Max dimension for textures sent to GPU


// Vertex Shader: Handles position, texture coordinates, and geometric transforms
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations (0, PI/2, PI, 3PI/2)
  uniform vec2 u_scale;          // flipX, flipY (e.g., [1,1], [-1,1])
  uniform vec2 u_crop_tex_scale; // zoom for crop (e.g., [1/zoom, 1/zoom])
  uniform vec2 u_crop_tex_offset;// pan for crop

  varying highp vec2 v_textureCoord;

  void main(void) {
    gl_Position = a_position; // Vertex position in clip space

    // Transform texture coordinates
    vec2 texCoord = a_texCoord;
    texCoord -= 0.5; // Center to origin (0,0)

    // 1. Apply flip (scale)
    texCoord *= u_scale;
    
    // 2. Apply 90-degree rotation
    float c90 = cos(u_rotationAngle);
    float s90 = sin(u_rotationAngle);
    mat2 rotation90Matrix = mat2(c90, s90, -s90, c90); // Rotates points CCW, effectively sampling texture CW
    texCoord = rotation90Matrix * texCoord;
    
    // 3. Apply zoom (scales the area of texture sampled)
    texCoord *= u_crop_tex_scale;

    // 4. Apply pan (offsets the sampled area)
    texCoord += u_crop_tex_offset;
    
    texCoord += 0.5; // Move origin back to bottom-left (0,0) for texture lookup
    v_textureCoord = texCoord;
  }
`;

// Fragment Shader: Applies all color adjustments and effects
const fsSource = `
  precision mediump float; // Necessary for WebGL
  varying highp vec2 v_textureCoord;
  
  uniform sampler2D u_sampler;    // The image texture
  uniform vec2 u_resolution;      // Canvas resolution for effects like grain

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
  uniform float u_hueValue;           // Normalized hue rotation (-0.5 to 0.5 for -180 to 180 deg)
  uniform float u_temperatureShift;   // Normalized temperature shift (-0.5 to 0.5)

  // Tinting
  uniform vec3 u_tintShadowsColorRGB;
  uniform float u_tintShadowsIntensityFactor;
  uniform float u_tintShadowsSaturationValue;
  uniform vec3 u_tintHighlightsColorRGB;
  uniform float u_tintHighlightsIntensityFactor;
  uniform float u_tintHighlightsSaturationValue;

  // Selective Color
  uniform int u_selectedColorTargetIndex; // 0-7 for Red, Orange, ..., Magenta; -1 for none
  uniform float u_hueAdjustment;          // For selective color hue shift (-0.5 to 0.5)
  uniform float u_saturationAdjustment;   // For selective color saturation change (-1.0 to 1.0)
  uniform float u_luminanceAdjustment;    // For selective color luminance (Value) change (-1.0 to 1.0)

  // Effects
  uniform float u_vignetteIntensity;
  uniform float u_grainIntensity;
  // uniform float u_sharpness; // Sharpness uniform (implementation pending if re-added)

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
  
  // Random function for grain
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
  }

  // Hue ranges for selective color (0-1 normalized hue from HSV)
  // Index: 0=R, 1=O, 2=Y, 3=G, 4=C, 5=B, 6=P, 7=M
  const float HUE_RED_MAX = 0.0416; // ~15 deg / 360
  const float HUE_RED_MIN = 0.9583; // ~345 deg / 360 (wraps around 0)
  const float HUE_ORANGE_MIN = 0.0416; // ~15 deg
  const float HUE_ORANGE_MAX = 0.1111; // ~40 deg
  const float HUE_YELLOW_MIN = 0.1111; // ~40 deg
  const float HUE_YELLOW_MAX = 0.1944; // ~70 deg
  const float HUE_GREEN_MIN = 0.1944; // ~70 deg
  const float HUE_GREEN_MAX = 0.4444; // ~160 deg
  const float HUE_CYAN_MIN = 0.4444; // ~160 deg
  const float HUE_CYAN_MAX = 0.5555; // ~200 deg
  const float HUE_BLUE_MIN = 0.5555; // ~200 deg
  const float HUE_BLUE_MAX = 0.7083; // ~255 deg
  const float HUE_PURPLE_MIN = 0.7083; // ~255 deg
  const float HUE_PURPLE_MAX = 0.8333; // ~300 deg
  const float HUE_MAGENTA_MIN = 0.8333; // ~300 deg
  const float HUE_MAGENTA_MAX = 0.9583; // ~345 deg
  
  // Effect constants
  const float VIGNETTE_RADIUS = 0.7;
  const float VIGNETTE_SOFTNESS = 0.6;
  const float GRAIN_BASE_STRENGTH = 0.5; // Increased from 0.25


  void main(void) {
    // Discard pixels outside the valid texture coordinate range (handles cropping/panning)
    if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {
        discard; 
        return;
    }
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // 1. Basic Adjustments (Brightness, Contrast, Saturation, Vibrance, Exposure)
    color *= u_brightness;
    color = (color - 0.5) * u_contrast + 0.5;
    
    float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma_sat), color, u_saturation);
  
    if (abs(u_vibrance) > 0.001) { // Apply vibrance if not zero
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
    
    // 2. Shadows & Highlights
    float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
    float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722)); 
    color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows); 
    
    // 3. Levels (Whites & Blacks)
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_adjust = 1.0 + u_whites * 0.15; 
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001); // ensure white > black
    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);

    // 4. Color Adjustments (Hue, Temperature)
    if (abs(u_hueValue) > 0.001) { // Apply if hue value is significant
        vec3 hsv_hue = rgbToHsv(color);
        hsv_hue.x = mod(hsv_hue.x + u_hueValue, 1.0);
        color = hsvToRgb(hsv_hue);
    }

    if (abs(u_temperatureShift) > 0.001) { // Apply if temperature shift is significant
        float temp_strength = u_temperatureShift * 0.3; // scale down for subtler effect
        color.r += temp_strength;
        color.b -= temp_strength;
    }

    // 5. Tinting (Shadows & Highlights)
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722)); 
    
    // Shadows Tint
    if (u_tintShadowsIntensityFactor > 0.001) {
        vec3 desaturate_temp_tint_color_shadows = vec3(dot(u_tintShadowsColorRGB, vec3(0.299, 0.587, 0.114)));
        vec3 finalShadowTintColor = mix(desaturate_temp_tint_color_shadows, u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
        float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); 
        color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }

    // Highlights Tint
    if (u_tintHighlightsIntensityFactor > 0.001) {
        vec3 desaturate_temp_tint_color_highlights = vec3(dot(u_tintHighlightsColorRGB, vec3(0.299, 0.587, 0.114)));
        vec3 finalHighlightTintColor = mix(desaturate_temp_tint_color_highlights, u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
        float highlightMask = smoothstep(0.55, 1.0, luma_tint); 
        color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
    }
    
    // 6. Selective Color
    if (u_selectedColorTargetIndex != -1 && (abs(u_hueAdjustment) > 0.001 || abs(u_saturationAdjustment) > 0.001 || abs(u_luminanceAdjustment) > 0.001 )) {
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
            hsv_selective.x = mod(hsv_selective.x + u_hueAdjustment, 1.0); // u_hueAdjustment is -0.5 to 0.5
            hsv_selective.y = clamp(hsv_selective.y + u_saturationAdjustment, 0.0, 1.0); // u_saturationAdjustment is -1.0 to 1.0
            hsv_selective.z = clamp(hsv_selective.z + u_luminanceAdjustment, 0.0, 1.0); // u_luminanceAdjustment is -1.0 to 1.0
            color = hsvToRgb(hsv_selective);
        }
    }

    // 7. Effects (Vignette, Grain)
    // Vignette
    float vignette_dist = distance(v_textureCoord, vec2(0.5));
    float vignetteEffectFactor = smoothstep(VIGNETTE_RADIUS, VIGNETTE_RADIUS - VIGNETTE_SOFTNESS, vignette_dist);
    // Apply vignette only if intensity is > 0 by mixing; u_vignetteIntensity comes from JS (0 to 1)
    color.rgb *= mix(1.0, vignetteEffectFactor, u_vignetteIntensity * 1.5);


    // Grain (u_grainIntensity from JS: 0 to 1 for preview, potentially higher for export)
    float grain_noise_value = (random(v_textureCoord * u_resolution.x / 50.0) - 0.5) * GRAIN_BASE_STRENGTH;
    color.rgb += grain_noise_value * u_grainIntensity;


    // Final Clamp
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
    resolution: WebGLUniformLocation | null;
    // Transforms
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
    // sharpness: WebGLUniformLocation | null; // Sharpness placeholder
  };
}

interface Buffers {
  position: WebGLBuffer | null;
  textureCoord: WebGLBuffer | null;
}

export function ImageCanvas() {
  const { 
    originalImage, 
    settings, 
    canvasRef,
    noiseImageDataRef, // Used to create pattern for grain
    // setIsPreviewing, // No longer used here, preview resolution handled differently
  } = useImageEditor();
  
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const isInitializedRef = useRef(false); // Tracks if WebGL basic setup (context, shaders, program, buffers) is done
  const [webGLError, setWebGLError] = useState<string | null>(null);

  // For ensuring canvas dimensions are set before first draw with texture
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
      // setWebGLError('WebGL Error (' + operation + '): ' + errorMsg + ' (Code: ' + error + ')');
      error = glContext.getError(); 
    }
    return errorFound;
  }, []);

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) { 
      console.error('Failed to create shader object.'); 
      setWebGLError('Failed to create shader object.');
      return null; 
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const shaderError = 'An error occurred compiling the shader: ' + gl.getShaderInfoLog(shader);
      console.error(shaderError);
      setWebGLError(shaderError);
      gl.deleteShader(shader); return null;
    }
    return shader;
  }, [setWebGLError]);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    if (!vertexShader) { console.error('Vertex shader compilation failed.'); return null; }
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!fragmentShader) { console.error('Fragment shader compilation failed.'); gl.deleteShader(vertexShader); return null; }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) { 
      console.error('Failed to create shader program.'); 
      setWebGLError('Failed to create shader program.');
      gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); return null; 
    }
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      const linkError = 'Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram);
      console.error(linkError);
      setWebGLError(linkError);
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
        resolution: gl.getUniformLocation(shaderProgram, 'u_resolution'),
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
        // sharpness: gl.getUniformLocation(shaderProgram, 'u_sharpness'),
      },
    };
    console.log('Shader program linked. Attribs:', progInfo.attribLocations, 'Uniforms:', progInfo.uniformLocations);
    return progInfo;
  }, [loadShader, setWebGLError]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) { console.error('Failed to create position buffer'); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Two triangles to form a quad: (-1,1) to (1,-1)
    const positions = [-1.0,  1.0,  1.0,  1.0, -1.0, -1.0, -1.0, -1.0,  1.0,  1.0,  1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error('Failed to create texture coordinate buffer'); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    // Texture coordinates for the quad
    const textureCoordinates = [0.0,  1.0, 1.0,  1.0, 0.0,  0.0, 0.0,  0.0, 1.0,  1.0, 1.0,  0.0,];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, null); 
    console.log('Buffers initialized.');
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    if (!image.complete || image.naturalWidth === 0 || image.naturalHeight === 0) {
      console.warn("loadTexture: Image not ready or zero dimensions. Will retry or wait for onload.");
      return null;
    }
    let imageToUse: TexImageSource = image;

    if (image.naturalWidth > MAX_TEXTURE_DIMENSION || image.naturalHeight > MAX_TEXTURE_DIMENSION) {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
            console.error("Could not get 2D context for downscaling texture.");
            setWebGLError("Could not get 2D context for downscaling texture.");
        } else {
            let { naturalWidth: width, naturalHeight: height } = image;
            const aspectRatio = width / height;

            if (width > height) {
                if (width > MAX_TEXTURE_DIMENSION) {
                    width = MAX_TEXTURE_DIMENSION;
                    height = Math.round(width / aspectRatio);
                }
            } else {
                if (height > MAX_TEXTURE_DIMENSION) {
                    height = MAX_TEXTURE_DIMENSION;
                    width = Math.round(height * aspectRatio);
                }
            }
            width = Math.max(1, Math.round(width)); // Ensure positive dimensions
            height = Math.max(1, Math.round(height));

            tempCanvas.width = width;
            tempCanvas.height = height;
            tempCtx.drawImage(image, 0, 0, width, height);
            imageToUse = tempCanvas;
            console.log("Texture source image downscaled to " + width + "x" + height + " for preview.");
        }
    }

    const texture = gl.createTexture();
    if (!texture) { 
      console.error('Failed to create texture object.'); 
      setWebGLError('Failed to create texture object.');
      return null; 
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y axis for correct image orientation in WebGL
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageToUse);
      console.log('Texture loaded successfully into WebGL from:', imageToUse instanceof HTMLImageElement ? 'HTMLImageElement' : 'HTMLCanvasElement (downscaled)');
    } catch (e: any) {
      console.error('Error during texImage2D for main texture:', e.message, e);
      setWebGLError('Error during texImage2D: ' + e.message);
      gl.deleteTexture(texture); return null;
    }
    if (checkGLError(gl, 'loadTexture - after texImage2D')) {
        gl.deleteTexture(texture); return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, null); // Unbind texture
    return texture;
  }, [checkGLError, setWebGLError]);


  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;
    const currentSettings = settings;

    if (!gl || !programInfo || !currentBuffers || !canvas || !isInitializedRef.current) {
      // console.warn('drawScene: WebGL not fully initialized or canvas not ready.');
      return;
    }
    
    if (!originalImage || !currentTexture) {
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Dark gray background
        gl.clear(gl.COLOR_BUFFER_BIT);
        initialCanvasSetupDoneRef.current = false;
        return;
    }
    
    // Determine canvas buffer dimensions (should be stable unless image/rotation/cropZoom changes)
    // This part is now handled in the useEffect for texture loading and canvas sizing.
    // Here, we just use the existing canvas.width/height which reflect drawingBufferWidth/Height

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Clear depth buffer too

    gl.useProgram(programInfo.program);
    checkGLError(gl, 'drawScene - after useProgram');

    // Set up vertex attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, 'drawScene - after position attribute setup');

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, 'drawScene - after texCoord attribute setup');

    // Bind texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    checkGLError(gl, 'drawScene - after texture binding');

    const activeSettings = currentSettings.isViewingOriginal
    ? { 
        ...initialImageSettings, 
        rotation: currentSettings.rotation, 
        scaleX: currentSettings.scaleX, 
        scaleY: currentSettings.scaleY,
        cropZoom: currentSettings.cropZoom, 
        cropOffsetX: currentSettings.cropOffsetX, 
        cropOffsetY: currentSettings.cropOffsetY,
        selectiveColors: JSON.parse(JSON.stringify(initialImageSettings.selectiveColors)),
        tintShadowsColor: initialImageSettings.tintShadowsColor,
        tintShadowsIntensity: initialImageSettings.tintShadowsIntensity,
        tintShadowsSaturation: initialImageSettings.tintShadowsSaturation,
        tintHighlightsColor: initialImageSettings.tintHighlightsColor,
        tintHighlightsIntensity: initialImageSettings.tintHighlightsIntensity,
        tintHighlightsSaturation: initialImageSettings.tintHighlightsSaturation,
      }
    : currentSettings;

    // Set uniforms
    // Transforms
    let rotationInRadians = 0;
    switch (activeSettings.rotation) { 
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, activeSettings.scaleX, activeSettings.scaleY);

    const totalEffectiveZoom = activeSettings.cropZoom;
    const u_crop_tex_scale_val: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    let maxTexOffset = (1.0 - (1.0 / totalEffectiveZoom)) / 2.0;
    maxTexOffset = Math.max(0, maxTexOffset); // Ensure non-negative
    let texOffsetX = activeSettings.cropOffsetX * maxTexOffset; 
    let texOffsetY = activeSettings.cropOffsetY * maxTexOffset * -1.0; // Invert Y for intuitive pan
    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, u_crop_tex_scale_val);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, [texOffsetX, texOffsetY]);
    
    // Basic Adjustments
    if (programInfo.uniformLocations.brightness) gl.uniform1f(programInfo.uniformLocations.brightness, activeSettings.brightness ?? 1.0);
    if (programInfo.uniformLocations.contrast) gl.uniform1f(programInfo.uniformLocations.contrast, activeSettings.contrast ?? 1.0);
    if (programInfo.uniformLocations.saturation) gl.uniform1f(programInfo.uniformLocations.saturation, activeSettings.saturation ?? 1.0);
    if (programInfo.uniformLocations.vibrance) gl.uniform1f(programInfo.uniformLocations.vibrance, activeSettings.vibrance ?? 0.0);
    if (programInfo.uniformLocations.exposure) gl.uniform1f(programInfo.uniformLocations.exposure, activeSettings.exposure ?? 0.0);
    if (programInfo.uniformLocations.highlights) gl.uniform1f(programInfo.uniformLocations.highlights, activeSettings.highlights ?? 0.0);
    if (programInfo.uniformLocations.shadows) gl.uniform1f(programInfo.uniformLocations.shadows, activeSettings.shadows ?? 0.0);
    if (programInfo.uniformLocations.whites) gl.uniform1f(programInfo.uniformLocations.whites, activeSettings.whites ?? 0.0);
    if (programInfo.uniformLocations.blacks) gl.uniform1f(programInfo.uniformLocations.blacks, activeSettings.blacks ?? 0.0);
    
    // Color Adjustments
    if (programInfo.uniformLocations.hueValue) gl.uniform1f(programInfo.uniformLocations.hueValue, (activeSettings.hueRotate ?? 0) / 360.0);
    if (programInfo.uniformLocations.temperatureShift) gl.uniform1f(programInfo.uniformLocations.temperatureShift, (activeSettings.colorTemperature ?? 0) / 200.0);

    // Tinting
    const shadowRgb = hexToRgbNormalizedArray(activeSettings.tintShadowsColor);
    if (programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    else if (programInfo.uniformLocations.tintShadowsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, [0.5, 0.5, 0.5]); // Default gray
    if (programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintShadowsIntensityFactor, activeSettings.tintShadowsIntensity);
    if (programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintShadowsSaturationValue, activeSettings.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(activeSettings.tintHighlightsColor);
    if (programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    else if (programInfo.uniformLocations.tintHighlightsColorRGB) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, [0.5, 0.5, 0.5]); // Default gray
    if (programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintHighlightsIntensityFactor, activeSettings.tintHighlightsIntensity);
    if (programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintHighlightsSaturationValue, activeSettings.tintHighlightsSaturation);
    
    // Selective Color
    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(activeSettings.activeSelectiveColorTarget);
    if (programInfo.uniformLocations.selectedColorTargetIndex != null) { 
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1); 
    }
    const currentSelective = activeSettings.selectiveColors[activeSettings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, (currentSelective.hue / 2.0) ); // Normalize -0.1 to 0.1 to -0.05 to 0.05 (shader might expect -0.5 to 0.5 for full 180deg)
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation); 
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance); 
    
    // Effects
    if (programInfo.uniformLocations.vignetteIntensity) gl.uniform1f(programInfo.uniformLocations.vignetteIntensity, activeSettings.vignetteIntensity);
    if (programInfo.uniformLocations.grainIntensity) gl.uniform1f(programInfo.uniformLocations.grainIntensity, activeSettings.grainIntensity * 0.2); // Preview grain at 20% of slider
    // if (programInfo.uniformLocations.sharpness) gl.uniform1f(programInfo.uniformLocations.sharpness, activeSettings.sharpness);
    
    // Resolution (already set for grain, might be useful for other effects)
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, 'drawScene - after setting all uniforms');
        
    gl.drawArrays(gl.TRIANGLES, 0, 6); // Draw 2 triangles (6 vertices)
    checkGLError(gl, 'drawScene - after drawArrays');
    initialCanvasSetupDoneRef.current = true;
  }, [originalImage, settings, canvasRef, checkGLError]);


  // Effect for one-time WebGL setup: context, shaders, program, buffers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isInitializedRef.current) { // Only run once if canvas exists
      return;
    }
    console.log("ImageCanvas: Attempting WebGL context initialization.");
    const localGL = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false }) || 
                    canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, antialias: false });
    
    if (!localGL) {
      console.error('ImageCanvas: Unable to initialize WebGL context.');
      setWebGLError('Unable to initialize WebGL. Your browser or device may not support it.');
      return;
    }
    glRef.current = localGL;
    console.log("ImageCanvas: WebGL context successfully obtained.");

    const pInfo = initShaderProgram(localGL);
    if (!pInfo) {
      console.error("ImageCanvas: Shader program initialization failed.");
      setWebGLError('Failed to initialize shader program.');
      glRef.current = null; 
      return;
    }
    programInfoRef.current = pInfo;

    const bInfo = initBuffers(localGL);
    if (!bInfo) {
      console.error("ImageCanvas: Buffer initialization failed.");
      setWebGLError('Failed to initialize buffers.');
      glRef.current = null; 
      programInfoRef.current = null;
      return;
    }
    buffersRef.current = bInfo;

    isInitializedRef.current = true;
    console.log("ImageCanvas: WebGL fully initialized (context, shaders, program, buffers).");
    requestAnimationFrame(drawScene); // Initial draw/clear after setup
    
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]); // Dependencies for one-time setup


  // Effect for loading/updating the texture and setting canvas dimensions
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;

    if (!gl || !isInitializedRef.current || !canvas ) { // Ensure GL is initialized and canvas exists
      // console.warn("TextureLoadEffect: GL, canvas, or init flag not ready.");
      return;
    }

    if (originalImage) {
      const imageElement = originalImage;
      
      const setupTextureAndDraw = () => {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          textureRef.current = null;
          console.log("TextureLoadEffect: Old texture deleted.");
        }
        const newTexture = loadTexture(gl, imageElement);
        if (newTexture) {
          textureRef.current = newTexture;
          console.log("TextureLoadEffect: New texture loaded/updated. Ready for drawing.");
        } else {
          console.error("TextureLoadEffect: Failed to load new texture from image.");
          setWebGLError("Failed to load texture from image.");
          textureRef.current = null; 
        }
        
        // Determine canvas buffer dimensions based on image, limits, rotation, and cropZoom
        let imgNatWidth = imageElement.naturalWidth;
        let imgNatHeight = imageElement.naturalHeight;

        // Effective content dimensions after manual cropZoom
        let sWidth = imgNatWidth / settings.cropZoom;
        let sHeight = imgNatHeight / settings.cropZoom;
        
        let contentAspectRatio = sWidth / sHeight;

        let finalCanvasWidth: number;
        let finalCanvasHeight: number;

        if (contentAspectRatio > 1) { // Landscape or square
            finalCanvasWidth = Math.min(sWidth, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
            finalCanvasHeight = finalCanvasWidth / contentAspectRatio;
        } else { // Portrait
            finalCanvasHeight = Math.min(sHeight, MAX_PHYSICAL_HEIGHT_CAP);
            finalCanvasWidth = finalCanvasHeight * contentAspectRatio;
            if (finalCanvasWidth > MAX_WIDTH_STANDARD_RATIO) { // Cap width if portrait is too wide after height cap
                finalCanvasWidth = MAX_WIDTH_STANDARD_RATIO;
                finalCanvasHeight = finalCanvasWidth / contentAspectRatio;
            }
        }
        
        finalCanvasWidth = Math.max(1, Math.round(finalCanvasWidth));
        finalCanvasHeight = Math.max(1, Math.round(finalCanvasHeight));

        // Adjust canvas buffer dimensions for 90/270 degree rotations
        if (settings.rotation === 90 || settings.rotation === 270) {
            [finalCanvasWidth, finalCanvasHeight] = [finalCanvasHeight, finalCanvasWidth];
        }

        if (canvas.width !== finalCanvasWidth || canvas.height !== finalCanvasHeight ) {
            canvas.width = finalCanvasWidth;
            canvas.height = finalCanvasHeight;
            console.log("TextureLoadEffect: Canvas resized to: " + canvas.width + "x" + canvas.height);
        }
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        checkGLError(gl, 'TextureLoadEffect - after viewport set');
        
        requestAnimationFrame(drawScene); 
      };

      if (imageElement.complete && imageElement.naturalWidth > 0) {
        console.log("TextureLoadEffect: Image is complete. Setting up texture.");
        setupTextureAndDraw();
      } else if (imageElement.src) { 
        console.log("TextureLoadEffect: Image src exists, attaching onload/onerror.");
        const handleLoad = () => {
            console.log("TextureLoadEffect: Image onload triggered.");
            setupTextureAndDraw();
            imageElement.removeEventListener('load', handleLoad);
            imageElement.removeEventListener('error', handleError);
        };
        const handleError = () => {
          console.error("TextureLoadEffect: Image onerror event triggered.");
          setWebGLError("Image failed to load (onerror).");
          if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
          requestAnimationFrame(drawScene); // Attempt to clear canvas
          imageElement.removeEventListener('load', handleLoad);
          imageElement.removeEventListener('error', handleError);
        };
        imageElement.addEventListener('load', handleLoad);
        imageElement.addEventListener('error', handleError);
      } else {
         console.warn("TextureLoadEffect: No image src, cleaning up texture and drawing (clear).");
         if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
         requestAnimationFrame(drawScene); 
      }
    } else { 
        console.log("TextureLoadEffect: No originalImage, cleaning up texture and drawing (clear).");
        if (textureRef.current) {
            gl.deleteTexture(textureRef.current);
            textureRef.current = null;
        }
        initialCanvasSetupDoneRef.current = false;
        requestAnimationFrame(drawScene); 
    }
  }, [originalImage, isInitializedRef, settings.rotation, settings.cropZoom, loadTexture, drawScene, glRef, canvasRef, checkGLError]); 


  // Effect for re-drawing when any visual settings (uniforms) change
  useEffect(() => {
    if (!isInitializedRef.current || !textureRef.current ) { // Only draw if WebGL is ready and texture is loaded
      // console.warn("DrawSettingsEffect: Not ready to draw (init or texture missing).");
      return;
    }
    // console.log("DrawSettingsEffect: Settings changed, requesting drawScene.");
    requestAnimationFrame(drawScene);
  }, [settings, isInitializedRef, textureRef, drawScene]); // Removed settings.isViewingOriginal if always using activeSettings logic


  // Effect for noise ImageData generation (runs once)
  useEffect(() => {
    if (!noiseImageDataRef.current) { 
      try {
        const tempNoiseCanvas = document.createElement('canvas');
        tempNoiseCanvas.width = 250; // NOISE_CANVAS_SIZE
        tempNoiseCanvas.height = 250; // NOISE_CANVAS_SIZE
        const noiseCtx = tempNoiseCanvas.getContext('2d', { willReadFrequently: true });

        if (noiseCtx) {
          const buffer = noiseCtx.createImageData(250, 250);
          const data = buffer.data;
          for (let i = 0; i < data.length; i += 4) {
            const rand = Math.floor(Math.random() * 256); 
            data[i] = rand;     
            data[i + 1] = rand; 
            data[i + 2] = rand; 
            data[i + 3] = 255;  
          }
          noiseImageDataRef.current = buffer;
          console.log("SUCCESS: Noise ImageData (250x250) created and stored in context ref.");
        } else {
           console.error("FAILURE: Could not get 2D context for noise ImageData generation (tempNoiseCanvas fallback).");
           setWebGLError("FAILURE: Could not get 2D context for noise ImageData generation.");
        }
      } catch (error: any) {
        console.error("Error creating noise ImageData:", error.message, error);
        setWebGLError("Error creating noise ImageData: " + error.message);
      }
    }
  }, [noiseImageDataRef]);


  // Cleanup WebGL resources on component unmount
  useEffect(() => {
    const localGl = glRef.current; 
    const localProgramInfo = programInfoRef.current;
    const localBuffers = buffersRef.current;
    const localTexture = textureRef.current;

    return () => {
      console.log("ImageCanvas: Cleaning up WebGL resources.");
      if (localGl) {
        if (localTexture) {
          localGl.deleteTexture(localTexture);
          console.log("ImageCanvas: Deleted main texture.");
        }
        if (localProgramInfo && localProgramInfo.program) {
            const attachedShaders = localGl.getAttachedShaders(localProgramInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => { 
                    if (shader) { 
                        localGl.detachShader(localProgramInfo.program, shader); 
                        localGl.deleteShader(shader); 
                    }
                });
                console.log("ImageCanvas: Detached and deleted shaders.");
            }
            localGl.deleteProgram(localProgramInfo.program);
            console.log("ImageCanvas: Deleted shader program.");
        }
        if (localBuffers) {
          if(localBuffers.position) { localGl.deleteBuffer(localBuffers.position); console.log("ImageCanvas: Deleted position buffer."); }
          if(localBuffers.textureCoord) { localGl.deleteBuffer(localBuffers.textureCoord); console.log("ImageCanvas: Deleted texCoord buffer.");}
        }
        try { 
            const loseContextExt = localGl.getExtension('WEBGL_lose_context');
            if (loseContextExt) {
                loseContextExt.loseContext();
                console.log("ImageCanvas: WebGL context lost.");
            }
        } catch (e) {
            console.warn("ImageCanvas: Could not lose WebGL context on cleanup:", e);
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
      initialCanvasSetupDoneRef.current = false;
      console.log("ImageCanvas: WebGL resources nulled.");
    };
  }, []); // Empty dependency array, so it runs only on unmount


  if (webGLError) {
    return (
      <Card className="w-full h-full flex flex-col items-center justify-center bg-destructive/20 border-destructive p-4">
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--destructive-foreground))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-alert-triangle mb-4"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        <p className="text-destructive-foreground font-semibold mb-2">WebGL Error</p>
        <p className="text-destructive-foreground/80 text-sm text-center mb-4">
          An error occurred while initializing or rendering with WebGL.
          This might happen if your browser doesn't support WebGL or if there's an issue with graphics drivers.
          Try updating your browser or drivers.
        </p>
        <details className="bg-background/50 p-2 rounded-md text-xs w-full max-w-md">
          <summary className="cursor-pointer text-muted-foreground">Error Details</summary>
          <pre className="whitespace-pre-wrap break-all mt-2 p-2 bg-muted rounded text-xs">{webGLError}</pre>
        </details>
      </Card>
    );
  }

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
      className="max-w-full max-h-full rounded-md shadow-lg" // Removed object-contain
      style={{ imageRendering: 'auto' }} // Keep 'auto' for now
    />
  );
}

    