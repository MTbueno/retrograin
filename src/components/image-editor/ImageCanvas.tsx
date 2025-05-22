
"use client";

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';

// Vertex shader program
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;

  uniform float u_rotationAngle; // 90-deg rotations
  uniform vec2 u_scale;          // flipX, flipY
  uniform float u_tiltAngle;     // free tilt/straighten angle
  uniform vec2 u_crop_tex_scale; // combined zoom (manual + auto for tilt)
  uniform vec2 u_crop_tex_offset;// pan

  varying highp vec2 v_textureCoord;

  void main(void) {
    gl_Position = a_position;

    vec2 texCoord = a_texCoord;
    texCoord -= 0.5; // Center to origin

    // Apply base transforms: flip, then 90-degree rotation
    texCoord *= u_scale;
    
    // IMPORTANT: For texture coordinates, rotation matrix application is often transposed
    // or angle negated compared to vertex rotation to achieve intuitive visual rotation.
    // If rotating points CCW makes image rotate CCW, then for tex coords to make image
    // rotate CCW, the tex coords themselves might need to be rotated CW.
    // Let's assume settings.rotation is CW visually, so tex coords rotate CCW.
    float c90 = cos(u_rotationAngle); // u_rotationAngle is already CCW for CW visual
    float s90 = sin(u_rotationAngle);
    mat2 rotation90Matrix = mat2(c90, -s90, s90, c90); 
    texCoord = rotation90Matrix * texCoord;

    // Apply tilt (free rotation)
    // Similar logic for angle direction
    float cTilt = cos(u_tiltAngle); // u_tiltAngle is CCW for CW visual
    float sTilt = sin(u_tiltAngle);
    mat2 tiltMatrix = mat2(cTilt, -sTilt, sTilt, cTilt); 
    texCoord = tiltMatrix * texCoord;
    
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
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123 + u_time * 0.1);
  }

  void main(void) {
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // 1. Brightness
    color *= u_brightness;

    // 2. Contrast
    color = (color - 0.5) * u_contrast + 0.5;
    
    // 3. Saturation (Main)
    float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(luma_sat), color, u_saturation);

    // 4. Vibrance
    if (u_vibrance != 0.0) {
        vec3 vibrance_input_color = color; 
        float luma_vib = dot(vibrance_input_color, vec3(0.299, 0.587, 0.114)); // Standard luma
        float Cmax = max(vibrance_input_color.r, max(vibrance_input_color.g, vibrance_input_color.b));
        float Cmin = min(vibrance_input_color.r, min(vibrance_input_color.g, vibrance_input_color.b));
        float current_pixel_saturation_metric = Cmax - Cmin; // Simple saturation metric
        
        float vibrance_effect_strength = u_vibrance * 1.2; // Scale vibrance effect
        if (vibrance_effect_strength > 0.0) {
          color = mix(vec3(luma_vib), vibrance_input_color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));
        } else {
          color = mix(vibrance_input_color, vec3(luma_vib), -vibrance_effect_strength); 
        }
    }
    
    // 5. Exposure
    color *= pow(2.0, u_exposure);
    
    // 6. Shadows & Highlights
    // Shadow adjustment: affects darker parts more
    if (u_shadows != 0.0) {
        float luma_sh_hl_initial = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Luminance
        color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl_initial)); 
    }
    color = clamp(color, 0.0, 1.0); // Clamp after shadows
    
    // Highlight adjustment: affects brighter parts more
    if (u_highlights != 0.0) {
        float luma_sh_hl_after_shadows = dot(color, vec3(0.2126, 0.7152, 0.0722));
        color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl_after_shadows);
    }
    color = clamp(color, 0.0, 1.0); // Clamp after highlights

    // 7. Levels (Blacks & Whites)
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_target = 1.0 - (u_whites * 0.15); 
    white_point_target = max(white_point_target, black_point_adjust + 0.001); // ensure white > black
    color = (color - black_point_adjust) / (white_point_target - black_point_adjust);
    color = clamp(color, 0.0, 1.0);

    // 8. Hue Rotation
    if (u_hueValue != 0.0) { 
        vec3 hsv = rgbToHsv(color);
        hsv.x = mod(hsv.x + u_hueValue, 1.0); // Add hue (0-1 range) and wrap
        color = hsvToRgb(hsv);
    }

    // 9. Color Temperature
    if (u_temperatureShift != 0.0) { 
        float temp_strength = u_temperatureShift * 0.3; // u_temperatureShift from -0.5 to 0.5
        color.r += temp_strength;
        color.b -= temp_strength;
        // color = clamp(color, 0.0, 1.0); // Clamping here can affect tinting, so clamp at the end
    }

    // 10. Tinting
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Luminance for tint masking

    if (u_tintShadowsIntensityFactor > 0.0) {
      vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
      float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); // Mask for darker areas
      color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }

    if (u_tintHighlightsIntensityFactor > 0.0) {
      vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
      float highlightMask = smoothstep(0.55, 1.0, luma_tint); // Mask for brighter areas
      color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
    }
   
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
        vec2 grainCoord = (v_textureCoord * u_resolution.x / 10.0 ) + u_time * 0.05; 
        float noise = (random(grainCoord) - 0.5) * 0.20; 
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
    tiltAngle: WebGLUniformLocation | null; // New
    cropTexScale: WebGLUniformLocation | null;
    cropTexOffset: WebGLUniformLocation | null;
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
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);


  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string): boolean => {
    if (!glContext) {
      // console.error(`WebGL context not available for operation: ${operation}`);
      return true; // Error if no context
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
      error = glContext.getError(); // Get next error
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
        tiltAngle: gl.getUniformLocation(shaderProgram, 'u_tiltAngle'), // New
        cropTexScale: gl.getUniformLocation(shaderProgram, 'u_crop_tex_scale'),
        cropTexOffset: gl.getUniformLocation(shaderProgram, 'u_crop_tex_offset'),
      },
    };
    // console.log("Shader Program Initialized. Locations:", progInfo.uniformLocations);
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) { console.error("Failed to create position buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0]; // Covers clip space
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) { console.error("Failed to create texture coordinate buffer"); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]; // Standard UVs
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    
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
      // console.log("Texture loaded into GPU via texImage2D: ", image.src.substring(0,30));
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

    if (!gl || !programInfo || !currentBuffers || !canvas) {
        // console.warn("drawScene: WebGL resources not ready or canvas not available.");
        return;
    }
    
    if (!originalImage || !currentTexture) {
      gl.clearColor(0.188, 0.188, 0.188, 1.0); // Match background
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      return;
    }

    let imgNatWidth = originalImage.naturalWidth;
    let imgNatHeight = originalImage.naturalHeight;
    
    // Canvas physical dimensions determination (viewport before shader transforms like tilt's auto-zoom)
    // This should reflect the aspect ratio of the *original image content* after 90-degree rotations.
    let canvasPhysicalWidth: number;
    let canvasPhysicalHeight: number;

    let displayWidthForLimits = imgNatWidth;
    let displayHeightForLimits = imgNatHeight;

    if (settings.rotation === 90 || settings.rotation === 270) {
        displayWidthForLimits = imgNatHeight;
        displayHeightForLimits = imgNatWidth;
    }
    
    let contentAspectRatio = displayWidthForLimits / displayHeightForLimits;

    if (contentAspectRatio > 1) { // Landscape or square
        canvasPhysicalWidth = Math.min(displayWidthForLimits, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
        canvasPhysicalHeight = canvasPhysicalWidth / contentAspectRatio;
    } else { // Portrait
        canvasPhysicalHeight = Math.min(displayHeightForLimits, MAX_PHYSICAL_HEIGHT_CAP);
        canvasPhysicalWidth = canvasPhysicalHeight * contentAspectRatio;
        if (canvasPhysicalWidth > MAX_WIDTH_STANDARD_RATIO) { // Cap width for very thin portrait images
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
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (checkGLError(gl, "drawScene - after viewport")) return;

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (checkGLError(gl, "drawScene - after clear")) return;

    gl.useProgram(programInfo.program);
    if (checkGLError(gl, "drawScene - after useProgram")) return;

    // Position Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Texture Coordinate Buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

    // Texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (programInfo.uniformLocations.sampler) {
        gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    }

    // Pass uniforms
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

    // Transform Uniforms
    let rotationInRadians = 0;
    switch (settings.rotation) { // Visually CW rotation
      case 90: rotationInRadians = Math.PI / 2; break;
      case 180: rotationInRadians = Math.PI; break;
      case 270: rotationInRadians = (3 * Math.PI) / 2; break;
      default: rotationInRadians = 0;
    }
    if (programInfo.uniformLocations.rotationAngle) gl.uniform1f(programInfo.uniformLocations.rotationAngle, rotationInRadians);
    if (programInfo.uniformLocations.scale) gl.uniform2f(programInfo.uniformLocations.scale, settings.scaleX, settings.scaleY);

    // Tilt and Auto-zoom calculation
    const radTiltAngle = settings.tiltAngle * Math.PI / 180.0; // tiltAngle is CW for user, so CCW for tex coords
    let autoZoomFactor = 1.0;
    if (settings.tiltAngle !== 0) {
        const absRadTilt = Math.abs(radTiltAngle);
        const cosA = Math.cos(absRadTilt);
        const sinA = Math.sin(absRadTilt);
        // Viewport dimensions for auto-zoom calculation (these are the dimensions of the canvas buffer)
        const vpW = canvas.width; 
        const vpH = canvas.height;
        
        if (vpW > 0 && vpH > 0) { // Avoid division by zero if canvas dimensions are not yet set
             autoZoomFactor = Math.max(
                (vpW * cosA + vpH * sinA) / vpW,
                (vpW * sinA + vpH * cosA) / vpH
            );
        }
    }
    if (programInfo.uniformLocations.tiltAngle) gl.uniform1f(programInfo.uniformLocations.tiltAngle, radTiltAngle);

    // Crop, Pan, and combined Zoom
    const totalEffectiveZoom = settings.cropZoom * autoZoomFactor;
    const cropTexScaleVal: [number, number] = [1.0 / totalEffectiveZoom, 1.0 / totalEffectiveZoom];
    
    const maxTexOffset = (1.0 - (1.0 / totalEffectiveZoom)) / 2.0;
    let texOffsetX = settings.cropOffsetX * maxTexOffset;
    let texOffsetY = settings.cropOffsetY * maxTexOffset * -1.0; // Y is often inverted in texture coords vs screen

    const cropTexOffsetVal: [number, number] = [texOffsetX, texOffsetY];

    if (programInfo.uniformLocations.cropTexScale) gl.uniform2fv(programInfo.uniformLocations.cropTexScale, cropTexScaleVal);
    if (programInfo.uniformLocations.cropTexOffset) gl.uniform2fv(programInfo.uniformLocations.cropTexOffset, cropTexOffsetVal);


    if (checkGLError(gl, "drawScene - before drawArrays after setting uniforms")) return;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (checkGLError(gl, "drawScene - after drawArrays")) return;

  }, [originalImage, canvasRef, settings, checkGLError, loadTexture]); // Dependencies


  // WebGL Initialization Effect
  useEffect(() => {
    if (!canvasRef.current || isInitializedRef.current) {
        // console.log("WebGL Init: Canvas not ready or already initialized.");
        return;
    }
    // console.log("WebGL Init: Canvas available, attempting to get context.");
    
    let context = canvasRef.current.getContext('webgl', { preserveDrawingBuffer: true });
    if (!context) {
      // console.warn("WebGL Init: Standard WebGL context failed, trying experimental.");
      context = canvasRef.current.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    }
    
    if (!context) {
      console.error("ImageCanvas: Unable to initialize WebGL. Your browser or machine may not support it.");
      return;
    }
    glRef.current = context;
    // console.log("WebGL Init: Context obtained:", glRef.current);

    const pInfo = initShaderProgram(glRef.current);
    if (pInfo) {
      programInfoRef.current = pInfo;
      // console.log("WebGL Init: Shader program initialized.");
    } else {
      console.error("WebGL Init: Failed to initialize shader program.");
      glRef.current = null;
      return;
    }

    const bInfo = initBuffers(glRef.current);
    if (bInfo) {
      buffersRef.current = bInfo;
      // console.log("WebGL Init: Buffers initialized.");
    } else {
      console.error("WebGL Init: Failed to initialize buffers.");
      glRef.current = null;
      programInfoRef.current = null;
      return;
    }
    isInitializedRef.current = true;
    // console.log("WebGL Init: Successfully initialized.");
    requestAnimationFrame(drawScene); // Initial draw (will likely be a clear if no image)
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]);


  // Texture Loading Effect
  useEffect(() => {
    const gl = glRef.current;
    if (!gl || !isInitializedRef.current) {
        // console.log("Texture Load: WebGL not initialized or image not ready.");
        return;
    }

    if (originalImage) {
        // console.log("Texture Load: Original image present, attempting to load texture.");
        const imageElement = originalImage;

        const processAndLoadTexture = () => {
            // console.log("Texture Load: processAndLoadTexture called.");
            if (textureRef.current) {
                // console.log("Texture Load: Deleting old texture.");
                gl.deleteTexture(textureRef.current);
                textureRef.current = null;
            }
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                textureRef.current = newTexture;
                // console.log("Texture Load: New texture loaded and set. Requesting draw.");
                requestAnimationFrame(drawScene);
            } else {
                console.error("Texture Load: Failed to load new texture.");
                textureRef.current = null;
                requestAnimationFrame(drawScene); // Draw to clear or show error state
            }
        };
        
        if (imageElement.complete && imageElement.naturalWidth > 0) {
            // console.log("Texture Load: Image already complete.");
            processAndLoadTexture();
        } else {
            // console.log("Texture Load: Image not complete, adding event listeners.");
            const handleLoad = () => {
                // console.log("Texture Load: Image onload event fired.");
                processAndLoadTexture();
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
            };
            const handleError = () => {
                console.error("Texture Load: Image onerror event fired.");
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
        }
    } else { // No original image
      // console.log("Texture Load: No original image. Clearing texture and drawing.");
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      requestAnimationFrame(drawScene); // Clear the canvas
    }
  }, [originalImage, loadTexture, drawScene, isInitializedRef]);


  // Render Loop for Animations (Grain) or settings changes
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
      if (!active || !glRef.current) return; // Check glRef.current as well
      drawScene();
      // Only continue loop if grain is active for animation
      if (settings.grainIntensity > 0.001 ) {
        animationFrameIdRef.current = requestAnimationFrame(renderLoop);
      } else {
        animationFrameIdRef.current = null; // Stop loop if grain is off
      }
    };

    // Trigger initial draw for new settings or if grain is off but other settings changed
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
  }, [settings, originalImage, drawScene, isInitializedRef]); // Added isInitializedRef


  // Cleanup WebGL resources on unmount
  useEffect(() => {
    return () => {
      // console.log("ImageCanvas: Unmounting, cleaning up WebGL resources.");
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
        // Attempt to lose context (optional, can help with resource release on some systems)
        // const loseContextExt = gl.getExtension('WEBGL_lose_context');
        // if (loseContextExt) {
        //   loseContextExt.loseContext();
        // }
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
      className="max-w-full max-h-full rounded-md shadow-lg" // Removed object-contain as it's not ideal for WebGL direct sizing
    />
  );
}
