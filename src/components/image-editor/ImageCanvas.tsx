
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';
import { hexToRgbNormalizedArray } from '@/lib/colorUtils';


// Vertex shader program
const vsSource = `
  attribute vec4 a_position;
  attribute vec2 a_texCoord;
  varying highp vec2 v_textureCoord;
  void main(void) {
    gl_Position = a_position;
    v_textureCoord = a_texCoord;
  }
`;

// Fragment shader program
const fsSource = `
  precision mediump float;
  varying highp vec2 v_textureCoord;

  uniform sampler2D u_sampler;

  // Basic Adjustments
  uniform float u_brightness;    // Default 1.0, e.g., 0.75 to 1.25
  uniform float u_contrast;      // Default 1.0, e.g., 0.5 to 1.5
  uniform float u_saturation;    // Default 1.0, e.g., 0 to 2
  uniform float u_vibrance;      // Default 0.0, e.g., -1 to 1
  uniform float u_exposure;      // Default 0.0, e.g., -0.5 to 0.5
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

  // Helper: Desaturate color
  vec3 desaturate(vec3 color, float saturation) {
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      return mix(vec3(luma), color, saturation);
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
    float luma_vib = dot(color, vec3(0.299, 0.587, 0.114));
    float Cmax = max(color.r, max(color.g, color.b));
    float Cmin = min(color.r, min(color.g, color.b));
    float current_pixel_saturation_metric = Cmax - Cmin;
    
    float vibrance_effect_strength = u_vibrance * 1.2; 
    if (vibrance_effect_strength > 0.0) {
      color = mix(vec3(luma_vib), color, 1.0 + (vibrance_effect_strength * (1.0 - smoothstep(0.1, 0.7, current_pixel_saturation_metric))));
    } else {
      color = mix(color, vec3(luma_vib), -vibrance_effect_strength); 
    }
    color = clamp(color, 0.0, 1.0);
    
    // 5. Exposure
    color *= pow(2.0, u_exposure);

    // 6. Shadows & Highlights
    float luma_sh_hl = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color += u_shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, luma_sh_hl)); 
    color = clamp(color, 0.0, 1.0); // Clamp after shadows
    luma_sh_hl = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Recalculate luma
    color += u_highlights * 0.25 * smoothstep(0.5, 1.0, luma_sh_hl);
    color = clamp(color, 0.0, 1.0); // Clamp after highlights

    // 7. Levels (Blacks & Whites)
    float black_point_adjust = u_blacks * 0.15; 
    float white_point_adjust = 1.0 - (u_whites * -0.15); // Inverted u_whites logic: negative u_whites pulls in (reduces white_point_adjust)
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001); 
    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);
    color = clamp(color, 0.0, 1.0);

    // --- Start of New Color Adjustments ---
    // 8. Hue Rotation
    vec3 hsv = rgbToHsv(color);
    hsv.x = mod(hsv.x + u_hueValue, 1.0);
    color = hsvToRgb(hsv);

    // 9. Color Temperature
    // Positive shift = warmer (more red, less blue)
    // Negative shift = cooler (less red, more blue)
    float temp_strength = u_temperatureShift * 0.3; // Scale down effect
    color.r += temp_strength;
    color.b -= temp_strength;
    color = clamp(color, 0.0, 1.0);

    // 10. Tinting
    float luma_tint = dot(color, vec3(0.2126, 0.7152, 0.0722));

    // Shadows Tint
    if (u_tintShadowsIntensityFactor > 0.0) {
      vec3 finalShadowTintColor = desaturate(u_tintShadowsColorRGB, u_tintShadowsSaturationValue);
      float shadowMask = 1.0 - smoothstep(0.0, 0.45, luma_tint); // Adjust smoothstep for better targeting
      color = mix(color, finalShadowTintColor, shadowMask * u_tintShadowsIntensityFactor);
    }

    // Highlights Tint
    if (u_tintHighlightsIntensityFactor > 0.0) {
      vec3 finalHighlightTintColor = desaturate(u_tintHighlightsColorRGB, u_tintHighlightsSaturationValue);
      float highlightMask = smoothstep(0.55, 1.0, luma_tint); // Adjust smoothstep for better targeting
      color = mix(color, finalHighlightTintColor, highlightMask * u_tintHighlightsIntensityFactor);
    }
    // --- End of New Color Adjustments ---
    
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

  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string) => {
    if (!glContext) return true;
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
      console.error('An error occurred compiling the shader: ' + gl.getShaderInfoLog(shader));
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
      },
    };
    // console.log("Shader Program Info Initialized:", progInfo);
    // Object.entries(progInfo.uniformLocations).forEach(([key, value]) => {
    //   if (value === null) console.warn(`Uniform ${key} NOT found.`);
    // });
    // Object.entries(progInfo.attribLocations).forEach(([key, value]) => {
    //   if (value === -1) console.warn(`Attribute ${key} NOT found.`);
    // });
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) return null;
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
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
    } catch (e) {
      console.error("Error during texImage2D:", e, "Image src:", image.src.substring(0,100));
      gl.deleteTexture(texture);
      return null;
    }
    
    if (checkGLError(gl, "loadTexture - after texImage2D")) {
        gl.deleteTexture(texture);
        return null;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null); 
    // console.log("Texture loaded successfully:", texture);
    return texture;
  }, [checkGLError]);

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;

    if (!gl || !programInfo || !currentBuffers || !canvas) {
      // console.warn("drawScene: Missing GL, programInfo, buffers, or canvas.", {gl, programInfo, currentBuffers, canvas});
      return;
    }

    let canvasPhysicalWidth = 300; 
    let canvasPhysicalHeight = 150;

    if (originalImage) {
        let imgWidth = originalImage.naturalWidth / settings.cropZoom;
        let imgHeight = originalImage.naturalHeight / settings.cropZoom;
        
        let contentAspectRatio = imgWidth / imgHeight;

        if (contentAspectRatio > 1) { 
            canvasPhysicalWidth = Math.min(imgWidth, (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO));
            canvasPhysicalHeight = canvasPhysicalWidth / contentAspectRatio;
        } else { 
            canvasPhysicalHeight = Math.min(imgHeight, MAX_PHYSICAL_HEIGHT_CAP);
            canvasPhysicalWidth = canvasPhysicalHeight * contentAspectRatio;
            if (canvasPhysicalWidth > MAX_WIDTH_STANDARD_RATIO) {
                canvasPhysicalWidth = MAX_WIDTH_STANDARD_RATIO;
                canvasPhysicalHeight = canvasPhysicalWidth / contentAspectRatio;
            }
        }
        canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
        canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));

        // WebGL rotation and flip are handled by transforming vertices/texture coords or in shader.
        // For 90/270 degree rotations, canvas dimensions might need to swap.
        if (settings.rotation === 90 || settings.rotation === 270) {
          [canvasPhysicalWidth, canvasPhysicalHeight] = [canvasPhysicalHeight, canvasPhysicalWidth];
        }
    }
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth > 0 ? canvasPhysicalWidth : 1;
        canvas.height = canvasPhysicalHeight > 0 ? canvasPhysicalHeight : 1;
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (checkGLError(gl, "drawScene - after viewport")) return;

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (checkGLError(gl, "drawScene - after clear")) return;

    if (!originalImage || !currentTexture) {
        // console.warn("drawScene: No originalImage or currentTexture. Clearing canvas.");
        return;
    }
    // console.log("drawScene: Drawing with texture:", currentTexture);


    gl.useProgram(programInfo.program);
    if (checkGLError(gl, "drawScene - after useProgram")) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    
    if (programInfo.uniformLocations.sampler) {
        gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    }

    // Pass settings to shaders
    if (programInfo.uniformLocations.brightness) gl.uniform1f(programInfo.uniformLocations.brightness, settings.brightness);
    if (programInfo.uniformLocations.contrast) gl.uniform1f(programInfo.uniformLocations.contrast, settings.contrast);
    if (programInfo.uniformLocations.saturation) gl.uniform1f(programInfo.uniformLocations.saturation, settings.saturation);
    if (programInfo.uniformLocations.vibrance) gl.uniform1f(programInfo.uniformLocations.vibrance, settings.vibrance);
    if (programInfo.uniformLocations.exposure) gl.uniform1f(programInfo.uniformLocations.exposure, settings.exposure);
    if (programInfo.uniformLocations.highlights) gl.uniform1f(programInfo.uniformLocations.highlights, settings.highlights);
    if (programInfo.uniformLocations.shadows) gl.uniform1f(programInfo.uniformLocations.shadows, settings.shadows);
    if (programInfo.uniformLocations.whites) gl.uniform1f(programInfo.uniformLocations.whites, settings.whites);
    if (programInfo.uniformLocations.blacks) gl.uniform1f(programInfo.uniformLocations.blacks, settings.blacks);
    
    // New color uniforms
    if (programInfo.uniformLocations.hueValue) gl.uniform1f(programInfo.uniformLocations.hueValue, (settings.hueRotate ?? 0) / 360.0); // Normalize hue
    if (programInfo.uniformLocations.temperatureShift) gl.uniform1f(programInfo.uniformLocations.temperatureShift, (settings.colorTemperature ?? 0) / 200.0); // Normalize temperature

    const shadowRgb = hexToRgbNormalizedArray(settings.tintShadowsColor);
    if (programInfo.uniformLocations.tintShadowsColorRGB && shadowRgb) gl.uniform3fv(programInfo.uniformLocations.tintShadowsColorRGB, shadowRgb);
    if (programInfo.uniformLocations.tintShadowsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintShadowsIntensityFactor, settings.tintShadowsIntensity);
    if (programInfo.uniformLocations.tintShadowsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintShadowsSaturationValue, settings.tintShadowsSaturation);

    const highlightRgb = hexToRgbNormalizedArray(settings.tintHighlightsColor);
    if (programInfo.uniformLocations.tintHighlightsColorRGB && highlightRgb) gl.uniform3fv(programInfo.uniformLocations.tintHighlightsColorRGB, highlightRgb);
    if (programInfo.uniformLocations.tintHighlightsIntensityFactor) gl.uniform1f(programInfo.uniformLocations.tintHighlightsIntensityFactor, settings.tintHighlightsIntensity);
    if (programInfo.uniformLocations.tintHighlightsSaturationValue) gl.uniform1f(programInfo.uniformLocations.tintHighlightsSaturationValue, settings.tintHighlightsSaturation);


    if (checkGLError(gl, "drawScene - before drawArrays after setting uniforms")) return;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    if (checkGLError(gl, "drawScene - after drawArrays")) return;

  }, [originalImage, canvasRef, settings, checkGLError, isPreviewing]); // Added isPreviewing, though not directly used for WebGL scaling yet


  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !isInitializedRef.current) {
      let context = canvas.getContext('webgl', { preserveDrawingBuffer: false }); // preserveDrawingBuffer can be false for better perf usually
      if (!context) {
        context = canvas.getContext('experimental-webgl', { preserveDrawingBuffer: false });
      }
      
      if (!context) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
      }
      glRef.current = context;
      // console.log("WebGL context successfully stored in glRef.");

      const pInfo = initShaderProgram(glRef.current);
      if (pInfo) {
        programInfoRef.current = pInfo;
      } else {
        console.error("Failed to initialize shader program. Aborting WebGL setup.");
        glRef.current = null; 
        return;
      }

      const bInfo = initBuffers(glRef.current);
      if (bInfo) {
        buffersRef.current = bInfo;
      } else {
        console.error("Failed to initialize buffers. Aborting WebGL setup.");
        glRef.current = null; 
        programInfoRef.current = null;
        return;
      }
      isInitializedRef.current = true; 
      // console.log("WebGL initialized (program, buffers). Requesting initial drawScene.");
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); // Initial draw (might be empty if no image)
    }
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]);


  useEffect(() => {
    const gl = glRef.current;
    
    if (!gl || !isInitializedRef.current) {
      // console.warn("Texture Effect: GL context not ready or not initialized.");
      return;
    }

    if (originalImage) {
        const imageElement = originalImage; 

        const processImageAndLoadTexture = () => {
            // console.log("Texture Effect: Processing image. Image complete:", imageElement.complete, "Natural width:", imageElement.naturalWidth);
            if (textureRef.current) {
                // console.log("Texture Effect: Deleting old texture", textureRef.current);
                gl.deleteTexture(textureRef.current);
                textureRef.current = null; 
            }
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                // console.log("Texture Effect: New texture loaded", newTexture, ". Requesting drawScene.");
                textureRef.current = newTexture;
            } else {
                console.error("Texture Effect: Failed to load new texture. Setting textureRef to null.");
                textureRef.current = null; 
            }
            if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = requestAnimationFrame(drawScene);
        };

        if (imageElement.complete && imageElement.naturalWidth > 0) {
            processImageAndLoadTexture();
        } else {
            // console.log("Texture Effect: Image not complete, adding event listeners.");
            const handleLoad = () => {
                // console.log("Texture Effect: originalImage onload triggered.");
                processImageAndLoadTexture();
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
            };
            const handleError = () => {
                console.error("Texture Effect: Error loading originalImage for WebGL texture. Src:", imageElement.src.substring(0,100));
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
                if (textureRef.current) {
                    gl.deleteTexture(textureRef.current);
                    textureRef.current = null;
                }
                 if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = requestAnimationFrame(drawScene); // Attempt to clear/draw
            };
            imageElement.addEventListener('load', handleLoad);
            imageElement.addEventListener('error', handleError);
            // Double check if it loaded between adding listener and this line
             if (imageElement.complete && imageElement.naturalWidth > 0) {
                 handleLoad(); 
            }
        }
    } else { 
      // console.log("Texture Effect: No originalImage. Deleting texture if exists and requesting drawScene (to clear).");
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); 
    }
  }, [originalImage, loadTexture, drawScene, isInitializedRef]); // isInitializedRef ensures GL is ready


  useEffect(() => {
    if (isInitializedRef.current && glRef.current && originalImage && textureRef.current) {
        // console.log("Settings or isPreviewing changed. Requesting drawScene.");
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
    }
  }, [settings, isPreviewing, drawScene, originalImage]); // isPreviewing added


  useEffect(() => {
    // console.log("ImageCanvas: Component Unmounting / Cleaning up WebGL.");
    const gl = glRef.current; 
    const pInfo = programInfoRef.current;
    const bInfo = buffersRef.current;
    const texInfo = textureRef.current;
    const animId = animationFrameIdRef.current;

    return () => {
      // console.log("ImageCanvas: Cleanup function running.");
      if (animId) {
        cancelAnimationFrame(animId);
      }
      if (gl) {
        if (texInfo) gl.deleteTexture(texInfo);
        if (pInfo) {
            const shaders = gl.getAttachedShaders(pInfo.program);
            if (shaders) {
                shaders.forEach(shader => {
                    gl.detachShader(pInfo.program, shader);
                    gl.deleteShader(shader);
                });
            }
            gl.deleteProgram(pInfo.program);
        }
        if (bInfo) {
          gl.deleteBuffer(bInfo.position);
          gl.deleteBuffer(bInfo.textureCoord);
        }
        const loseContextExt = gl.getExtension('WEBGL_lose_context');
        if (loseContextExt) {
            try { loseContextExt.loseContext(); } catch (e) { /*ignore*/ }
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
      className="max-w-full max-h-full rounded-md shadow-lg" // Removed object-contain as it's not typical for direct canvas sizing
      style={{ imageRendering: isPreviewing ? 'pixelated' : 'auto' }} // Helps with preview performance
    />
  );
}
