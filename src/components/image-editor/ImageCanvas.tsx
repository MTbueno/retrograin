
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
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
  uniform float u_brightness;
  uniform float u_contrast; // New uniform for contrast

  void main(void) {
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    vec3 brightenedColor = textureColor.rgb * u_brightness;
    // Apply contrast: (color - 0.5) * contrast + 0.5
    // Ensure result is clamped between 0.0 and 1.0
    vec3 contrastedColor = clamp((brightenedColor - 0.5) * u_contrast + 0.5, 0.0, 1.0);
    gl_FragColor = vec4(contrastedColor, textureColor.a);
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
    contrast: WebGLUniformLocation | null; // New
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
      console.warn(`WebGL context not available for ${operation}`);
      return true;
    }
    const error = glContext.getError();
    if (error !== glContext.NO_ERROR) {
      let errorMsg = "WebGL Error: Unknown error";
      switch (error) {
        case glContext.INVALID_ENUM: errorMsg = "INVALID_ENUM"; break;
        case glContext.INVALID_VALUE: errorMsg = "INVALID_VALUE"; break;
        case glContext.INVALID_OPERATION: errorMsg = "INVALID_OPERATION"; break;
        case glContext.OUT_OF_MEMORY: errorMsg = "OUT_OF_MEMORY"; break;
        case glContext.CONTEXT_LOST_WEBGL: errorMsg = "CONTEXT_LOST_WEBGL"; break;
      }
      console.error(`WebGL Error (${operation}): ${errorMsg} (Code: ${error})`);
      return true;
    }
    return false;
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
      console.error("Failed to load shaders for program.");
      return null;
    }

    const shaderProgram = gl.createProgram();
    if (!shaderProgram) {
      console.error("Failed to create shader program.");
      return null;
    }
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
      gl.deleteProgram(shaderProgram);
      return null;
    }
    console.log("Shader program linked successfully.");

    const programInfo: ProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord'),
      },
      uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'u_sampler'),
        brightness: gl.getUniformLocation(shaderProgram, 'u_brightness'),
        contrast: gl.getUniformLocation(shaderProgram, 'u_contrast'), // New
      },
    };

    if (programInfo.attribLocations.vertexPosition === -1) console.error("Attrib a_position not found in shader program.");
    else console.log("Attrib a_position found at location:", programInfo.attribLocations.vertexPosition);
    if (programInfo.attribLocations.textureCoord === -1) console.error("Attrib a_texCoord not found in shader program.");
    else console.log("Attrib a_texCoord found at location:", programInfo.attribLocations.textureCoord);
    if (programInfo.uniformLocations.sampler === null) console.error("Uniform u_sampler not found in shader program.");
    else console.log("Uniform u_sampler found at location:", programInfo.uniformLocations.sampler);
    if (programInfo.uniformLocations.brightness === null) console.warn("Uniform u_brightness not found.");
    else console.log("Uniform u_brightness found at location:", programInfo.uniformLocations.brightness);
    if (programInfo.uniformLocations.contrast === null) console.warn("Uniform u_contrast not found."); // New
    else console.log("Uniform u_contrast found at location:", programInfo.uniformLocations.contrast); // New
    
    return programInfo;
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
    const textureCoordinates = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0]; // Flipped Y
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
      console.log("Texture image uploaded to GPU via texImage2D.");
    } catch (e) {
      console.error("Error during texImage2D:", e);
      gl.deleteTexture(texture);
      return null;
    }
    
    if (checkGLError(gl, "loadTexture - after texImage2D")) {
        console.error("Error occurred after texImage2D, deleting texture.");
        gl.deleteTexture(texture);
        return null;
    }
    
    gl.bindTexture(gl.TEXTURE_2D, null); 
    console.log("Texture loaded successfully into WebGL texture object:", texture);
    return texture;
  }, [checkGLError]);

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;

    if (!gl || !programInfo || !currentBuffers || !canvas) {
      // console.warn("drawScene: Missing WebGL essentials (gl, programInfo, buffers, or canvas). Skipping draw.");
      return;
    }
    if (checkGLError(gl, "drawScene - start")) return;

    let canvasPhysicalWidth = canvas.clientWidth; // Fallback if no image
    let canvasPhysicalHeight = canvas.clientHeight; // Fallback if no image

    if (originalImage) {
        const imageContentWidth = originalImage.naturalWidth / settings.cropZoom;
        const imageContentHeight = originalImage.naturalHeight / settings.cropZoom;
        
        let contentAspectRatio = imageContentWidth / imageContentHeight;

        let targetWidth = imageContentWidth;
        let targetHeight = imageContentHeight;

        const isSideways = settings.rotation === 90 || settings.rotation === 270;
        if (isSideways) {
            contentAspectRatio = imageContentHeight / imageContentWidth; 
            targetWidth = imageContentHeight;
            targetHeight = imageContentWidth;
        }
        
        if (contentAspectRatio > 1) { 
            if (targetWidth > (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO)) {
                targetWidth = contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;
                targetHeight = targetWidth / contentAspectRatio;
            }
        } else { 
            if (targetHeight > MAX_PHYSICAL_HEIGHT_CAP) {
                targetHeight = MAX_PHYSICAL_HEIGHT_CAP;
                targetWidth = targetHeight * contentAspectRatio;
            }
             if (targetWidth > MAX_WIDTH_STANDARD_RATIO) { 
                 targetWidth = MAX_WIDTH_STANDARD_RATIO;
                 targetHeight = targetWidth / contentAspectRatio;
             }
        }
        canvasPhysicalWidth = Math.round(targetWidth > 0 ? targetWidth : 1);
        canvasPhysicalHeight = Math.round(targetHeight > 0 ? targetHeight : 1);
    } else {
      canvasPhysicalWidth = 300; 
      canvasPhysicalHeight = 150;
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
        // console.warn("drawScene: No original image or texture to draw. Canvas cleared.");
        return;
    }
    // console.log("drawScene: Drawing with texture:", currentTexture);

    gl.useProgram(programInfo.program);
    if (checkGLError(gl, "drawScene - after useProgram")) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    if (checkGLError(gl, "drawScene - after position attribute setup")) return;

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    if (checkGLError(gl, "drawScene - after texCoord attribute setup")) return;

    gl.activeTexture(gl.TEXTURE0);
    if (checkGLError(gl, "drawScene - after activeTexture")) return;
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    if (checkGLError(gl, "drawScene - after bindTexture (currentTexture)")) return;
    
    gl.uniform1i(programInfo.uniformLocations.sampler, 0); 
    if (checkGLError(gl, "drawScene - after uniform1i for sampler")) return;

    if (programInfo.uniformLocations.brightness !== null) {
      gl.uniform1f(programInfo.uniformLocations.brightness, settings.brightness);
      if (checkGLError(gl, "drawScene - after uniform1f for brightness")) return;
    } else {
        console.warn("drawScene: brightness uniform location is null.");
    }

    if (programInfo.uniformLocations.contrast !== null) { // New
      gl.uniform1f(programInfo.uniformLocations.contrast, settings.contrast);
      if (checkGLError(gl, "drawScene - after uniform1f for contrast")) return;
    } else {
        console.warn("drawScene: contrast uniform location is null.");
    }
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    if (checkGLError(gl, "drawScene - after drawArrays")) return;

  }, [originalImage, canvasRef, settings, checkGLError]); // Added settings to dependency array


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
      console.log("WebGL context successfully stored in glRef.");
      if(checkGLError(glRef.current, "Initial context get")) return;

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
        console.error("Failed to initialize WebGL buffers. Aborting WebGL setup.");
        glRef.current = null; 
        programInfoRef.current = null;
        return;
      }
      isInitializedRef.current = true; 
      console.log("ImageCanvas: Core WebGL initialized (program and buffers).");
      
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); // Initial draw/clear
    }
  }, [canvasRef, initShaderProgram, initBuffers, checkGLError, drawScene]);


  useEffect(() => {
    const gl = glRef.current;
    
    if (!gl || !isInitializedRef.current) {
      // console.log("Texture Effect: GL or initialization not ready. Skipping texture update.");
      return;
    }

    if (originalImage) {
        const imageElement = originalImage; 

        const processImageAndLoadTexture = () => {
            if (textureRef.current) {
                gl.deleteTexture(textureRef.current);
                checkGLError(gl, "delete old texture");
                textureRef.current = null; 
            }
            // console.log("Texture Effect: Attempting to load new texture from originalImage:", imageElement.src.substring(0,60)+"...");
            const newTexture = loadTexture(gl, imageElement);
            if (newTexture) {
                textureRef.current = newTexture;
                // console.log("Texture Effect: New texture loaded, requesting drawScene.");
                if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = requestAnimationFrame(drawScene);
            } else {
                console.error("Texture Effect: Failed to load new texture from originalImage. Texture will be null.");
                textureRef.current = null;
                 if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                animationFrameIdRef.current = requestAnimationFrame(drawScene); 
            }
        };

        if (imageElement.complete) { 
            processImageAndLoadTexture();
        } else {
            // console.log("Texture Effect: OriginalImage is not complete, adding onload listener.");
            const handleLoad = () => {
                // console.log("Texture Effect: OriginalImage onload event triggered.");
                processImageAndLoadTexture();
                imageElement.removeEventListener('load', handleLoad);
                imageElement.removeEventListener('error', handleError);
            };
            const handleError = () => {
                console.error("Texture Effect: Error loading originalImage for WebGL texture.");
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
        }

    } else { 
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        // console.log("Texture Effect: Deleted old texture (originalImage is null).");
        checkGLError(gl, "delete old texture in else branch");
        textureRef.current = null;
      }
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); 
    }
  }, [originalImage, loadTexture, drawScene, checkGLError, isInitializedRef]); // Added isInitializedRef


  useEffect(() => {
    // This effect specifically handles re-drawing when settings change
    if (isInitializedRef.current && glRef.current && originalImage && textureRef.current) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
    }
  }, [settings, drawScene, originalImage]); // Keep settings here to trigger re-draws on adjustment


  useEffect(() => {
    // Cleanup
    const gl = glRef.current; 
    const pInfo = programInfoRef.current;
    const bInfo = buffersRef.current;
    const texInfo = textureRef.current;

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
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
        // Attempt to gracefully lose context, though not all browsers might support this perfectly
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
      console.log("WebGL resources cleaned up.");
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
      // style={{ imageRendering: 'pixelated' }} // Might not be needed/effective for WebGL
    />
  );
}
