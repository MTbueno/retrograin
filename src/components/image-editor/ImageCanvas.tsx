
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

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

  uniform float u_brightness;    // 1.0 default, range 0.75 to 1.25
  uniform float u_contrast;      // 1.0 default, range 0.5 to 1.5
  uniform float u_saturation;    // 1.0 default, range 0 to 2
  uniform float u_vibrance;      // 0.0 default, range -1 to 1
  uniform float u_exposure;      // 0.0 default, range -0.5 to 0.5
  uniform float u_highlights;    // 0.0 default, range -1 to 1
  uniform float u_shadows;       // 0.0 default, range -1 to 1
  uniform float u_whites;        // 0.0 default, range -1 to 1
  uniform float u_blacks;        // 0.0 default, range -1 to 1

  void main(void) {
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 color = textureColor.rgb;

    // 1. Brightness
    color *= u_brightness;

    // 2. Contrast
    color = (color - 0.5) * u_contrast + 0.5;

    // 3. Saturation
    float luma_sat = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 grayscale_sat = vec3(luma_sat);
    color = mix(grayscale_sat, color, u_saturation);

    // 4. Vibrance
    // For positive u_vibrance, boosts saturation of less saturated colors more.
    // For negative u_vibrance, acts as a general desaturator.
    float luma_vib = dot(color, vec3(0.299, 0.587, 0.114));
    float max_comp_vib = max(color.r, max(color.g, color.b));
    float min_comp_vib = min(color.r, min(color.g, color.b));
    float current_pixel_saturation = max_comp_vib - min_comp_vib;
    
    if (u_vibrance > 0.0) {
      float vibrance_boost_factor = u_vibrance * (1.5 * (1.0 - smoothstep(0.1, 0.9, current_pixel_saturation)));
      color = mix(vec3(luma_vib), color, 1.0 + vibrance_boost_factor);
    } else {
      // Negative vibrance: desaturate (u_vibrance is negative, so 1.0 + u_vibrance reduces the mix towards grayscale)
      color = mix(vec3(luma_vib), color, 1.0 + u_vibrance); 
    }
    
    // 5. Exposure
    color *= pow(2.0, u_exposure);

    // 6. Shadows & Highlights (simple additive approach)
    // We use a luma calculation to determine how much to affect shadows/highlights
    float current_luma_sh_hl = dot(color, vec3(0.2126, 0.7152, 0.0722)); // Standard luma coefficients
    
    // Shadows: u_shadows > 0 lifts shadows, u_shadows < 0 darkens them
    // smoothstep creates a curve so the effect is stronger in darker areas and fades out in lighter areas
    float shadow_effect_factor = (1.0 - smoothstep(0.0, 0.5, current_luma_sh_hl)); // Affects values from 0.0 to 0.5 luma
    color += shadow_effect_factor * u_shadows * 0.3; // Scaled effect

    // Highlights: u_highlights > 0 boosts highlights, u_highlights < 0 reduces them
    // smoothstep creates a curve so the effect is stronger in lighter areas and fades out in darker areas
    float highlight_effect_factor = smoothstep(0.5, 1.0, current_luma_sh_hl); // Affects values from 0.5 to 1.0 luma
    color += highlight_effect_factor * u_highlights * 0.3; // Scaled effect

    // 7. Levels (Blacks & Whites)
    // u_blacks > 0 lifts black point (makes blacks grayer)
    // u_blacks < 0 crushes black point (makes blacks darker)
    // u_whites > 0 pushes white point further (makes whites brighter, can clip)
    // u_whites < 0 pulls white point in (darkens whites, can recover detail)
    float black_point_adjust = u_blacks * 0.25; 
    float white_point_adjust = 1.0 - (u_whites * 0.25); // Subtract because u_whites < 0 should increase the effective white point range
    
    // Ensure white_point_adjust is always greater than black_point_adjust to avoid division by zero or negative results
    white_point_adjust = max(white_point_adjust, black_point_adjust + 0.001); 
    
    color = (color - black_point_adjust) / (white_point_adjust - black_point_adjust);

    // 8. Final Clamp
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
  const { originalImage, settings, canvasRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isInitializedRef = useRef(false);

  const checkGLError = useCallback((glContext: WebGLRenderingContext | null, operation: string) => {
    if (!glContext) {
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
      },
    };

    if (progInfo.attribLocations.vertexPosition === -1) console.warn("Attrib a_position not found.");
    if (progInfo.attribLocations.textureCoord === -1) console.warn("Attrib a_texCoord not found.");
    if (progInfo.uniformLocations.sampler === null) console.warn("Uniform u_sampler not found.");
    // Optional: Add more warnings for other uniforms if needed for debugging.
    
    return progInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      console.error("Failed to create position buffer.");
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) {
      console.error("Failed to create texture coordinate buffer.");
      return null;
    }
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
        console.error("Error occurred after texImage2D, deleting texture.");
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

    let canvasPhysicalWidth = 300; 
    let canvasPhysicalHeight = 150;

    if (originalImage) {
        let imgWidth = originalImage.naturalWidth / settings.cropZoom; // Consider cropZoom for source
        let imgHeight = originalImage.naturalHeight / settings.cropZoom;
        
        // The WebGL quad always fills the viewport; aspect ratio matching is done by adjusting viewport or texture coords.
        // For simplicity, we size the canvas drawing buffer to match the (cropped) image's aspect ratio, capped.
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
    }
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    if (checkGLError(gl, "drawScene - after viewport")) return;

    gl.clearColor(0.188, 0.188, 0.188, 1.0); 
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (checkGLError(gl, "drawScene - after clear")) return;

    if (!originalImage || !currentTexture) {
        return;
    }

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
    
    if (checkGLError(gl, "drawScene - before drawArrays after setting uniforms")) return;
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    if (checkGLError(gl, "drawScene - after drawArrays")) return;

  }, [originalImage, canvasRef, settings, checkGLError]);


  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !isInitializedRef.current) {
      let context = canvas.getContext('webgl', { preserveDrawingBuffer: false });
      if (!context) {
        context = canvas.getContext('experimental-webgl', { preserveDrawingBuffer: false });
      }
      
      if (!context) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
      }
      glRef.current = context;

      const pInfo = initShaderProgram(glRef.current);
      if (pInfo) {
        programInfoRef.current = pInfo;
      } else {
        glRef.current = null; 
        return;
      }

      const bInfo = initBuffers(glRef.current);
      if (bInfo) {
        buffersRef.current = bInfo;
      } else {
        glRef.current = null; 
        programInfoRef.current = null;
        return;
      }
      isInitializedRef.current = true; 
      
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene);
    }
  }, [canvasRef, initShaderProgram, initBuffers, drawScene]);


  useEffect(() => {
    const gl = glRef.current;
    
    if (!gl || !isInitializedRef.current) {
      return;
    }

    if (originalImage) {
        const imageElement = originalImage; 

        const processImageAndLoadTexture = () => {
            if (textureRef.current) {
                gl.deleteTexture(textureRef.current);
                textureRef.current = null; 
            }
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                textureRef.current = newTexture;
                if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = requestAnimationFrame(drawScene);
            } else {
                textureRef.current = null; 
                if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = requestAnimationFrame(drawScene); 
            }
        };

        if (imageElement.complete && imageElement.naturalWidth > 0) {
            processImageAndLoadTexture();
        } else {
            const handleLoad = () => {
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
                animationFrameIdRef.current = requestAnimationFrame(drawScene);
            };
            imageElement.addEventListener('load', handleLoad);
            imageElement.addEventListener('error', handleError);
            if (imageElement.complete && imageElement.naturalWidth > 0) {
                 handleLoad(); 
            }
        }
    } else { 
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); 
    }
  }, [originalImage, loadTexture, drawScene, isInitializedRef]);


  useEffect(() => {
    if (isInitializedRef.current && glRef.current && originalImage && textureRef.current) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
    }
  }, [settings, drawScene, originalImage]); 


  useEffect(() => {
    const gl = glRef.current; 
    const pInfo = programInfoRef.current;
    const bInfo = buffersRef.current;
    const texInfo = textureRef.current;
    const animId = animationFrameIdRef.current;

    return () => {
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
      className="max-w-full max-h-full rounded-md shadow-lg"
    />
  );
}
