
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Vertex Shader
const vsSource = \`
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
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
\`;

// Fragment Shader
const fsSource = \`
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
  
  uniform float u_hueValue;          // Normalized 0-1 for 0-360 degrees
  uniform float u_temperatureShift;  // Normalized -0.5 to 0.5 for -100 to 100

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
  
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
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
  const float HUE_PURPLE_MIN = 0.70;  
  const float HUE_PURPLE_MAX = 0.80;   // ~252 to 288 degrees
  const float HUE_MAGENTA_MIN = 0.80;
  const float HUE_MAGENTA_MAX = 0.95;  // ~288 to 342 degrees

  void main(void) {
    if (v_textureCoord.x < 0.0 || v_textureCoord.x > 1.0 || v_textureCoord.y < 0.0 || v_textureCoord.y > 1.0) {
        // Discard pixels outside the [0,1] texture coordinate range (e.g., after zoom/pan)
        // Alternatively, set to a border color: gl_FragColor = vec4(0.188, 0.188, 0.188, 1.0); discard;
        discard; 
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
    // color = clamp(color, 0.0, 1.0); // Clamping after this can make blacks too gray if black_point_adjust is positive

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
    // color = clamp(color, 0.0, 1.0); // Clamp after each major color operation

    // Tinting
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
    // color = clamp(color, 0.0, 1.0);

    // Selective Color
    if (u_selectedColorTargetIndex != -1 && (u_hueAdjustment != 0.0 || u_saturationAdjustment != 0.0 || u_luminanceAdjustment != 0.0)) {
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
    // color = clamp(color, 0.0, 1.0);
   
    // Effects
    // Vignette
    if (u_vignetteIntensity > 0.001) { 
        float vignetteRadius = 0.7; 
        float vignetteSoftness = 0.6;
        float dist_vignette = distance(v_textureCoord, vec2(0.5)); 
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        color.rgb *= mix(vignetteFactor, 1.0, 1.0 - (u_vignetteIntensity * 1.5) ); 
    }

    // Grain
    if (u_grainIntensity > 0.001) {
      // Ensure grainCoord calculation doesn't lead to u_resolution.y being zero if canvas is tiny
      float grain_scale_factor = u_resolution.y > 0.0 ? 50.0 / u_resolution.y : 1.0; // Avoid division by zero
      vec2 grainCoord = v_textureCoord * u_resolution.xy * grain_scale_factor; 
      // vec2 grainCoord = v_textureCoord * u_resolution.xy / 50.0; // Alternative scaling

      float grain_noise = (random(grainCoord + u_time * 0.05) - 0.5) * 0.15; 
      color.rgb += grain_noise * u_grainIntensity;
    }
    
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), textureColor.a);
  }
\`;

const MAX_WIDTH_STANDARD_RATIO = 800; 
const MAX_WIDTH_WIDE_RATIO = 960;     
const MAX_PHYSICAL_HEIGHT_CAP = 1000; 
const PREVIEW_SCALE_FACTOR = 0.5; 
// const NOISE_CANVAS_SIZE is defined in ImageEditorContext

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
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor(); // Removed noiseImageDataRef
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);
  const lastFrameTimeRef = useRef(performance.now());


  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string): boolean => {
    if (!glContext) { console.error(\`WebGL Error (\${operation}): Context is null\`); return true; }
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
        default: errorMsg = \`Unknown error code: \${error}\`; break;
      }
      console.error(\`WebGL Error (\${operation}): \${errorMsg} (Code: \${error})\`);
      error = glContext.getError(); 
    }
    return errorFound;
  }, []);

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) { console.error("Failed to create shader object."); return null; }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const shaderType = type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment';
      console.error(\`An error occurred compiling the \${shaderType} shader: \` + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    if (!vertexShader) { console.error("Vertex shader compilation failed."); return null; }
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!fragmentShader) { console.error("Fragment shader compilation failed."); gl.deleteShader(vertexShader); return null; }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) { console.error("Failed to create shader program."); gl.deleteShader(vertexShader); gl.deleteShader(fragmentShader); return null; }
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
    // Two triangles to form a quad: (-1,1) to (1,-1)
    const positions = [
      -1.0,  1.0, // Top-left
       1.0,  1.0, // Top-right
      -1.0, -1.0, // Bottom-left
      -1.0, -1.0, // Bottom-left
       1.0,  1.0, // Top-right
       1.0, -1.0, // Bottom-right
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error("Failed to create texture coordinate buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [
      0.0, 0.0, // Top-left
      1.0, 0.0, // Top-right
      0.0, 1.0, // Bottom-left
      0.0, 1.0, // Bottom-left
      1.0, 0.0, // Top-right
      1.0, 1.0, // Bottom-right
    ]; 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    const texture = gl.createTexture();
    if (!texture) { console.error("Failed to create texture object."); return null; }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    checkGLError(gl, "loadTexture - after bindTexture");
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
    checkGLError(gl, "loadTexture - after pixelStorei UNPACK_FLIP_Y_WEBGL");
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    checkGLError(gl, "loadTexture - after texParameteri");
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      // console.log("Texture loaded successfully from image.");
    } catch (e) {
      console.error("Error during texImage2D for main texture:", e);
      gl.deleteTexture(texture); return null;
    }
    if (checkGLError(gl, "loadTexture - after texImage2D")) {
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
    
    let baseCanvasWidth: number;
    let baseCanvasHeight: number;
    const contentAspectRatio = imgNatWidth / imgNatHeight;

    if (contentAspectRatio > 1) { 
        baseCanvasWidth = Math.min(imgNatWidth, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        baseCanvasHeight = Math.round(baseCanvasWidth / contentAspectRatio);
    } else { 
        baseCanvasHeight = Math.min(imgNatHeight, MAX_PHYSICAL_HEIGHT_CAP);
        baseCanvasWidth = Math.round(baseCanvasHeight * contentAspectRatio);
        if (baseCanvasWidth > MAX_WIDTH_STANDARD_RATIO) {
            baseCanvasWidth = MAX_WIDTH_STANDARD_RATIO;
            baseCanvasHeight = Math.round(baseCanvasWidth / contentAspectRatio);
        }
    }
    baseCanvasWidth = Math.max(1, Math.round(baseCanvasWidth));
    baseCanvasHeight = Math.max(1, Math.round(baseCanvasHeight));
    
    let finalCanvasWidth = baseCanvasWidth;
    let finalCanvasHeight = baseCanvasHeight;
    
    if (settings.rotation === 90 || settings.rotation === 270) {
        [finalCanvasWidth, finalCanvasHeight] = [finalCanvasHeight, finalCanvasWidth];
    }
    
    let currentRenderWidth = finalCanvasWidth;
    let currentRenderHeight = finalCanvasHeight;

    if (isPreviewing) {
        currentRenderWidth = Math.max(1, Math.round(finalCanvasWidth * PREVIEW_SCALE_FACTOR));
        if (finalCanvasWidth > 0 && finalCanvasHeight > 0) {
             currentRenderHeight = Math.max(1, Math.round(currentRenderWidth / (finalCanvasWidth / finalCanvasHeight) ));
        } else {
             currentRenderHeight = Math.max(1, Math.round(finalCanvasHeight * PREVIEW_SCALE_FACTOR));
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
    if (programInfo.uniformLocations.time) gl.uniform1f(programInfo.uniformLocations.time, lastFrameTimeRef.current / 5000.0); 
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

    let rotationInRadians = 0;
    switch (settings.rotation) {
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settings.scaleX, settings.scaleY);
    
    const totalEffectiveZoom = settings.cropZoom; // autoZoomFactor was removed when tilt was removed
    const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    const maxTexOffset = Math.max(0, (1.0 - (1.0 / totalEffectiveZoom)) / 2.0); 
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset * -1.0; 
    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);

    const SELECTIVE_COLOR_TARGETS_ORDER = ['reds', 'oranges', 'yellows', 'greens', 'cyans', 'blues', 'purples', 'magentas'];
    const targetIndex = SELECTIVE_COLOR_TARGETS_ORDER.indexOf(settings.activeSelectiveColorTarget);
    
    if (programInfo.uniformLocations.selectedColorTargetIndex) {
      gl.uniform1i(programInfo.uniformLocations.selectedColorTargetIndex, targetIndex !== -1 ? targetIndex : -1);
    }

    const currentSelective = settings.selectiveColors[settings.activeSelectiveColorTarget] || { hue: 0, saturation: 0, luminance: 0 };
    if (programInfo.uniformLocations.hueAdjustment) gl.uniform1f(programInfo.uniformLocations.hueAdjustment, currentSelective.hue);
    if (programInfo.uniformLocations.saturationAdjustment) gl.uniform1f(programInfo.uniformLocations.saturationAdjustment, currentSelective.saturation);
    if (programInfo.uniformLocations.luminanceAdjustment) gl.uniform1f(programInfo.uniformLocations.luminanceAdjustment, currentSelective.luminance);

    checkGLError(gl, "drawScene - before drawArrays after setting uniforms");
    gl.drawArrays(gl.TRIANGLES, 0, 6); 
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, settings, canvasRef, isPreviewing, checkGLError, loadTexture, initBuffers, initShaderProgram]);


  // Initialize WebGL context, shaders, program, buffers
  useEffect(() => {
    if (!canvasRef.current) { return; }
    if (isInitializedRef.current) { requestAnimationFrame(drawScene); return; }
    
    const gl = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl) { console.error("ImageCanvas: Unable to initialize WebGL context."); isInitializedRef.current = false; return; }
    glRef.current = gl;

    const pInfo = initShaderProgram(gl);
    if (!pInfo) { console.error("ImageCanvas: Shader program initialization failed."); glRef.current = null; isInitializedRef.current = false; return; }
    programInfoRef.current = pInfo;

    const bInfo = initBuffers(gl);
    if (!bInfo) { console.error("ImageCanvas: WebGL buffer initialization failed."); glRef.current = null; programInfoRef.current = null; isInitializedRef.current = false; return; }
    buffersRef.current = bInfo;
    
    isInitializedRef.current = true;
    requestAnimationFrame(drawScene); 
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]); 


  // Load texture when originalImage changes or WebGL becomes initialized
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) { return; }

    if (originalImage) {
      const imageElement = originalImage;
      
      const attemptLoad = () => {
        if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
        const newTexture = loadTexture(gl, imageElement);
        if (newTexture) {
            textureRef.current = newTexture;
            requestAnimationFrame(drawScene); 
        } else {
            textureRef.current = null; 
            console.error("LoadTexture Effect: Failed to load new main texture.");
            requestAnimationFrame(drawScene);
        }
      };

      if (imageElement.complete && imageElement.naturalWidth > 0) {
        attemptLoad();
      } else if (imageElement.src) {
        const handleLoad = () => {
          imageElement.removeEventListener('load', handleLoad);
          imageElement.removeEventListener('error', handleError);
          attemptLoad();
        };
        const handleError = () => {
          console.error("LoadTexture Effect: Image onerror event for src:", imageElement.src.substring(0,100));
          imageElement.removeEventListener('load', handleLoad);
          imageElement.removeEventListener('error', handleError);
          if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
          requestAnimationFrame(drawScene); 
        };
        imageElement.addEventListener('load', handleLoad);
        imageElement.addEventListener('error', handleError);
      } else {
         if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
          requestAnimationFrame(drawScene);
      }
    } else { 
      if (textureRef.current) { gl.deleteTexture(textureRef.current); textureRef.current = null; }
      requestAnimationFrame(drawScene); 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [originalImage, isInitializedRef.current, loadTexture]); // Removed drawScene, as its definition changes with settings

  // Animation loop for effects like grain
  useEffect(() => {
    if (!isInitializedRef.current || !glRef.current || !originalImage || !textureRef.current) {
      if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null;}
      return;
    }
    let active = true;
    const renderLoop = (currentTime: number) => {
      if (!active || !glRef.current) { animationFrameIdRef.current = null; return; }
      lastFrameTimeRef.current = currentTime;
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
        if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    }
    return () => {
      active = false;
      if (animationFrameIdRef.current) { cancelAnimationFrame(animationFrameIdRef.current); animationFrameIdRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, originalImage, isInitializedRef.current]); // Removed drawScene, as its definition changes with settings

  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      const pInfo = programInfoRef.current;
      const bInfo = buffersRef.current;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (gl) {
        if (textureRef.current) gl.deleteTexture(textureRef.current);
        if (pInfo && pInfo.program) {
            const attachedShaders = gl.getAttachedShaders(pInfo.program);
            if (attachedShaders) {
                attachedShaders.forEach(shader => { gl.detachShader(pInfo.program, shader); gl.deleteShader(shader); });
            }
            gl.deleteProgram(pInfo.program);
        }
        if (bInfo) {
          if(bInfo.position) gl.deleteBuffer(bInfo.position);
          if(bInfo.textureCoord) gl.deleteBuffer(bInfo.textureCoord);
        }
      }
      glRef.current = null; programInfoRef.current = null; buffersRef.current = null;
      textureRef.current = null; isInitializedRef.current = false;
    };
  }, []); 

  // Removed noiseImageDataRef generation as it's not used directly by WebGL shaders for grain
  // The grain effect is now fully procedural in the fragment shader.

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
      style={{ imageRendering: 'auto' }}
    />
  );
}


    