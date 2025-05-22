
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Vertex shader program
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 0.0, 1.5708 (PI/2), 3.14159 (PI), 4.71239 (3PI/2)
  uniform vec2 u_scale;          // (scaleX, scaleY) for flip
  uniform vec2 u_crop_tex_scale; // Scale for texture coordinates (zoom)
  uniform vec2 u_crop_tex_offset; // Offset for texture coordinates (pan)


  varying highp vec2 v_textureCoord;

  void main(void) {
    gl_Position = a_position;

    vec2 texCoord = a_texCoord;
    texCoord -= 0.5; // Center to origin 0,0

    // Apply transforms in order: scale (flip), rotate (90 deg), crop_scale (zoom), crop_offset (pan)
    texCoord *= u_scale; // Apply flip

    // Apply 90/180/270 degree rotation
    // Note: For texture coordinates, to rotate the image clockwise, we rotate the texture coordinates counter-clockwise.
    // The shader currently has (c, s, -s, c) which is CCW for vertices. 
    // For texture coordinates, this means image will rotate CCW.
    // To rotate image CW, tex coords should rotate CCW with angle, or CW with -angle.
    // If u_rotationAngle is positive for CW image rotation, tex coords need to rotate by -u_rotationAngle.
    float angleToUse = u_rotationAngle; // Let's assume u_rotationAngle is correctly set for tex coord rotation
    float s = sin(angleToUse);
    float c = cos(angleToUse);
    mat2 rotationMatrix = mat2(c, -s, s, c); // Standard CCW rotation matrix for coordinates
    
    texCoord = rotationMatrix * texCoord;

    // Apply zoom (scale texture coordinates)
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
  uniform float u_brightness;    // Default 1.0
  uniform float u_contrast;      // Default 1.0
  uniform float u_saturation;    // Default 1.0
  uniform float u_vibrance;      // Default 0.0, e.g., -1 to 1
  uniform float u_exposure;      // Default 0.0
  uniform float u_highlights;    // Default 0.0, e.g., -1 to 1
  uniform float u_shadows;       // Default 0.0, e.g., -1 to 1
  uniform float u_whites;        // Default 0.0, e.g., -1 to 1
  uniform float u_blacks;        // Default 0.0, e.g., -1 to 1
  
  // Color Adjustments
  uniform float u_hueValue;             // 0.0 to 1.0 (normalized from 0-360 degrees)
  uniform float u_temperatureShift;     // -0.5 to 0.5 (normalized from -100 to 100)

  // Tint Adjustments
  uniform vec3 u_tintShadowsColorRGB;
  uniform float u_tintShadowsIntensityFactor;
  uniform float u_tintShadowsSaturationValue;

  uniform vec3 u_tintHighlightsColorRGB;
  uniform float u_tintHighlightsIntensityFactor;
  uniform float u_tintHighlightsSaturationValue;
  
  // Effects
  uniform float u_vignetteIntensity; // 0 to 1
  uniform float u_grainIntensity;    // 0 to 1
  uniform float u_time;              // for animated grain
  uniform vec2 u_resolution;         // canvas resolution for grain scaling

  // Helper: RGB to HSV
  vec3 rgbToHsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      float e = 1.0e-10;
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }

  // Helper: HSV to RGB
  vec3 hsvToRgb(vec3 c) {
      vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
      vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
      return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Helper: Desaturate color (used for tint color saturation)
  vec3 desaturate(vec3 color, float saturationFactor) {
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(luma), color, saturationFactor);
  }

  // Helper: Pseudo-random generator for grain
  float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123 + u_time * 0.01);
  }


  void main(void) {
    vec4 originalTextureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = originalTextureColor.rgb;

    // 1. Brightness
    color *= u_brightness;

    // 2. Contrast
    color = (color - 0.5) * u_contrast + 0.5;
    
    // 3. Saturation (Main)
    float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 grayscale_sat = vec3(luma_sat);
    color = mix(grayscale_sat, color, u_saturation);

    // 4. Vibrance
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
        color = clamp(color, 0.0, 1.0);
    }
    
    // 5. Exposure
    color *= pow(2.0, u_exposure);
    color = clamp(color, 0.0, 1.0); 

    // 6. Shadows & Highlights
    float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (u_shadows != 0.0) {
        color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
    }
    color = clamp(color, 0.0, 1.0); 
    if (u_highlights != 0.0) {
        float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);
    }
    color = clamp(color, 0.0, 1.0);

    // 7. Levels (Blacks & Whites)
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_target = 1.0 - (u_whites * 0.15); 
    white_point_target = max(white_point_target, black_point_adjust + 0.001); 
    color = (color - black_point_adjust) / (white_point_target - black_point_adjust);
    color = clamp(color, 0.0, 1.0);

    // --- Color Adjustments ---
    // 8. Hue Rotation
    if (u_hueValue != 0.0) { 
        vec3 hsv = rgbToHsv(color);
        hsv.x = mod(hsv.x + u_hueValue, 1.0);
        color = hsvToRgb(hsv);
    }

    // 9. Color Temperature
    if (u_temperatureShift != 0.0) { 
        float temp_strength = u_temperatureShift * 0.3; 
        color.r += temp_strength;
        color.b -= temp_strength;
        color = clamp(color, 0.0, 1.0);
    }

    // 10. Tinting
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));

    if (u_tintShadowsIntensityFactor > 0.0) {
      vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
      float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); 
      color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }

    if (u_tintHighlightsIntensityFactor > 0.0) {
      vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
      float highlightMask = smoothstep(0.55, 1.0, luma_tint); 
      color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
    }
    color = clamp(color, 0.0, 1.0);

    // --- Effects ---
    // 11. Vignette
    if (u_vignetteIntensity > 0.0) {
        float vignetteRadius = 0.7; 
        float vignetteSoftness = 0.6;
        float dist_vignette = distance(v_textureCoord, vec2(0.5));
        float vignetteFactor = smoothstep(vignetteRadius, vignetteRadius - vignetteSoftness, dist_vignette);
        color.rgb *= mix(1.0, vignetteFactor, u_vignetteIntensity * 1.5);
    }

    // 12. Grain
    if (u_grainIntensity > 0.0) {
        vec2 grainCoord = (v_textureCoord * u_resolution.xy / u_resolution.y) * 2.0; 
        float noise = (random(grainCoord) - 0.5) * 0.20; 
        color.rgb += noise * u_grainIntensity;
    }
    
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), originalTextureColor.a);
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
    cropTexScale: WebGLUniformLocation | null;     // New
    cropTexOffset: WebGLUniformLocation | null;    // New
  };
}

interface Buffers {
  position: WebGLBuffer;
  textureCoord: WebGLBuffer;
}

const MAX_WIDTH_STANDARD_RATIO = 800;
const MAX_WIDTH_WIDE_RATIO = 960;
const MAX_PHYSICAL_HEIGHT_CAP = 1000;

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing, hexToRgbNormalizedArray } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string) => {
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
      }
      console.error(`WebGL Error (${operation}): ${errorMsg} (Code: ${error})`);
      error = glContext.getError();
    }
    return errorFound;
  }, []);

  const loadShader = useCallback((gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) {
      console.error("Failed to create shader of type: " + type);
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
      console.error("Failed to load/compile shaders for program.");
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
        cropTexScale: gl.getUniformLocation(shaderProgram, 'u_crop_tex_scale'), // New
        cropTexOffset: gl.getUniformLocation(shaderProgram, 'u_crop_tex_offset'), // New             
      },
    };
    console.log("Shader Program Info Initialized. Locations:", {
        attrs: progInfo.attribLocations,
        uniforms: progInfo.uniformLocations
    });
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) { console.error("Failed to create position buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]; // Full-screen quad
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error("Failed to create texture coordinate buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]; 
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
    console.log("Buffers initialized.");
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    const texture = gl.createTexture();
    if (!texture) {
        console.error("Failed to create texture object.");
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (checkGLError(gl, "loadTexture - after bindTexture")) return null;
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (checkGLError(gl, "loadTexture - after texParameteri")) return null;

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); 
    if (checkGLError(gl, "loadTexture - after pixelStorei UNPACK_FLIP_Y_WEBGL")) return null;
    
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      console.log("Texture loaded into GPU via texImage2D:", image.src.substring(0,50));
    } catch (e) {
      console.error("Error during texImage2D:", e, image.src.substring(0,50));
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

    if (!gl || !programInfo || !currentBuffers || !canvas) {
        return;
    }
    
    if (!originalImage || !currentTexture) {
      gl.clearColor(0.188, 0.188, 0.188, 1.0); 
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return;
    }

    // --- Canvas Sizing ---
    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;
    
    // These are the dimensions of the *content* we want to display from the original image,
    // after considering rotation (90/270) for aspect ratio, but BEFORE cropZoom.
    // The cropZoom will be handled by scaling texture coordinates.
    let displayContentWidth = imgNatWidth;
    let displayContentHeight = imgNatHeight;

    if (settings.rotation === 90 || settings.rotation === 270) {
        [displayContentWidth, displayContentHeight] = [displayContentHeight, displayContentWidth];
    }

    let contentAspectRatio = displayContentWidth / displayContentHeight;
    
    let canvasPhysicalWidth: number;
    let canvasPhysicalHeight: number;

    // Determine canvas size to fit content within MAX limits, maintaining aspect ratio
    if (contentAspectRatio > 1) { 
        canvasPhysicalWidth = Math.min(displayContentWidth, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        canvasPhysicalHeight = canvasPhysicalWidth / contentAspectRatio;
    } else { 
        canvasPhysicalHeight = Math.min(displayContentHeight, MAX_PHYSICAL_HEIGHT_CAP);
        canvasPhysicalWidth = canvasPhysicalHeight * contentAspectRatio;
        if (canvasPhysicalWidth > MAX_WIDTH_STANDARD_RATIO) {
            canvasPhysicalWidth = MAX_WIDTH_STANDARD_RATIO;
            canvasPhysicalHeight = canvasPhysicalWidth / contentAspectRatio;
        }
    }
    
    canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
    canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
    }
    // --- End Canvas Sizing ---
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "drawScene - after viewport");

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, "drawScene - after clear");

    gl.useProgram(programInfo.program);
    checkGLError(gl, "drawScene - after useProgram");

    // Position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) {
        gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    }

    // Pass all settings to shaders
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
    if (programInfo.uniformLocations.time) gl.uniform1f(programInfo.uniformLocations.time, performance.now() / 1000.0); // Time in seconds
    if (programInfo.uniformLocations.resolution) gl.uniform2f(programInfo.uniformLocations.resolution, gl.canvas.width, gl.canvas.height);

    // Transform uniforms (rotation and flip)
    let rotationInRadians = 0;
    switch (settings.rotation) {
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
      default: rotationInRadians = 0;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settings.scaleX, settings.scaleY);

    // Crop/Zoom/Pan uniforms
    const cropZoom = Math.max(1.0, settings.cropZoom); // Ensure zoom is at least 1
    const cropTexScaleVal: [number, number] = [1.0 / cropZoom, 1.0 / cropZoom];
    
    // Max offset for texture coordinates, allows panning to the edge of the zoomed area
    const maxTexOffset = (1.0 - (1.0 / cropZoom)) / 2.0;
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset; // In WebGL tex coords, positive Y is often up.

    // Adjust pan direction based on flips
    // texOffsetX *= settings.scaleX; // If scaleX is -1, flips pan direction
    // texOffsetY *= settings.scaleY; // If scaleY is -1, flips pan direction

    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);

    checkGLError(gl, "drawScene - before drawArrays after setting uniforms");
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, canvasRef, settings, checkGLError, hexToRgbNormalizedArray]);


  // WebGL Initialization Effect
  useEffect(() => {
    if (!canvasRef.current || isInitializedRef.current) return;
    
    console.log("ImageCanvas: Attempting WebGL initialization.");
    let context = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true }); 
    if (!context) {
      context = canvasRef.current.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    }
    
    if (!context) {
      console.error("ImageCanvas: Unable to initialize WebGL. Your browser or machine may not support it.");
      return;
    }
    glRef.current = context;
    console.log("WebGL context successfully stored in glRef.");

    const pInfo = initShaderProgram(glRef.current);
    if (pInfo) {
      programInfoRef.current = pInfo;
    } else {
      console.error("ImageCanvas: Failed to initialize shader program. WebGL rendering will not work.");
      glRef.current = null; 
      return;
    }

    const bInfo = initBuffers(glRef.current);
    if (bInfo) {
      buffersRef.current = bInfo;
    } else {
      console.error("ImageCanvas: Failed to initialize buffers. WebGL rendering will not work.");
      glRef.current = null; 
      programInfoRef.current = null;
      return;
    }
    isInitializedRef.current = true; 
    console.log("ImageCanvas: WebGL initialized successfully.");
    requestAnimationFrame(drawScene); // Initial draw/clear
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]); 


  // Texture Loading Effect
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) {
        return;
    }

    if (originalImage) {
        const imageElement = originalImage; 
        
        const processAndLoadTexture = () => {
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
                console.error("Failed to load new texture from image: ", imageElement.src.substring(0,50));
                requestAnimationFrame(drawScene); // Attempt to clear or show error state
            }
        };
        
        if (imageElement.complete && imageElement.naturalWidth > 0) {
            processAndLoadTexture();
        } else {
            const handleLoad = () => {
                processAndLoadTexture();
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
            };
            const handleError = () => {
                console.error("Image error event for texture loading: ", imageElement.src.substring(0,50));
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
            if (imageElement.complete && imageElement.naturalWidth > 0) { // Double check
                 handleLoad(); 
            }
        }
    } else { 
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      requestAnimationFrame(drawScene); 
    }
  }, [originalImage, loadTexture, drawScene]); // isInitializedRef removed as it's handled by the !gl guard


  // Render Loop for Animations (e.g., Grain)
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
      if (!active) return;
      drawScene();
      if (settings.grainIntensity > 0.001 ) { 
        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
      } else {
        animationFrameIdRef.current = null; 
      }
    };

    if (settings.grainIntensity > 0.001 ) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
    } else {
        if (animationFrameIdRef.current) { 
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
        requestAnimationFrame(drawScene); 
    }
    
    return () => {
      active = false;
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [settings, drawScene, originalImage]);


  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
      console.log("ImageCanvas: Cleaning up WebGL resources on unmount.");
      const gl = glRef.current; 
      const pInfo = programInfoRef.current;
      const bInfo = buffersRef.current;
      const texInfo = textureRef.current;
      const animId = animationFrameIdRef.current;

      if (animId) cancelAnimationFrame(animId);
      if (gl) {
        if (texInfo) {
            gl.deleteTexture(texInfo);
        }
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
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }}
    />
  );
}

    