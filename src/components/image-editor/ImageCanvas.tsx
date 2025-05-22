
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
  varying highp vec2 v_textureCoord;
  uniform sampler2D u_sampler;
  uniform float u_brightness; // Uniform for brightness adjustment

  void main(void) {
    vec4 textureColor = texture2D(u_sampler, v_textureCoord);
    // Apply brightness: multiply RGB components by brightness factor
    gl_FragColor = vec4(textureColor.rgb * u_brightness, textureColor.a);
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
    brightness: WebGLUniformLocation | null; // Added brightness uniform location
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
    console.log(`Shader type ${type} compiled successfully.`);
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext): ProgramInfo | null => {
    console.log("Attempting to initialize shader program...");
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
      },
    };

    if (programInfo.attribLocations.vertexPosition === -1) console.error("Attrib a_position not found.");
    if (programInfo.attribLocations.textureCoord === -1) console.error("Attrib a_texCoord not found.");
    if (programInfo.uniformLocations.sampler === null) console.error("Uniform u_sampler not found.");
    if (programInfo.uniformLocations.brightness === null) console.error("Uniform u_brightness not found.");
    
    console.log("Shader program info created:", programInfo);
    return programInfo;
  }, [loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    console.log("Attempting to initialize buffers...");
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
    
    console.log("Buffers initialized.");
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, []);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    console.log("Attempting to load texture from image:", image.src.substring(0, 60) + "...");
    const texture = gl.createTexture();
    if (!texture) {
        console.error("Failed to create texture object.");
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    checkGLError(gl, "loadTexture - after bindTexture");
    
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    checkGLError(gl, "loadTexture - after texParameteri");

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    checkGLError(gl, "loadTexture - after pixelStorei UNPACK_FLIP_Y_WEBGL");
    
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
    
    console.log("Texture loaded successfully.");
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
    if (checkGLError(gl, "drawScene - start")) return;

    let canvasPhysicalWidth = canvas.clientWidth;
    let canvasPhysicalHeight = canvas.clientHeight;

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
        canvasPhysicalWidth = Math.round(targetWidth);
        canvasPhysicalHeight = Math.round(targetHeight);
    } else {
      canvasPhysicalWidth = 300;
      canvasPhysicalHeight = 150;
    }
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
        console.log(`drawScene: Canvas drawing buffer dimensions set to ${canvas.width}x${canvas.height}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "drawScene - after viewport");

    gl.clearColor(0.188, 0.188, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    checkGLError(gl, "drawScene - after clear");

    if (!originalImage || !currentTexture) {
        console.log("drawScene: No original image or texture to draw. Canvas cleared.");
        return;
    }

    gl.useProgram(programInfo.program);
    checkGLError(gl, "drawScene - after useProgram");

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, "drawScene - after position attribute setup");

    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, "drawScene - after texCoord attribute setup");

    gl.activeTexture(gl.TEXTURE0);
    checkGLError(gl, "drawScene - after activeTexture");
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    checkGLError(gl, "drawScene - after bindTexture");
    
    gl.uniform1i(programInfo.uniformLocations.sampler, 0);
    checkGLError(gl, "drawScene - after uniform1i for sampler");

    // Pass brightness uniform
    if (programInfo.uniformLocations.brightness) {
      gl.uniform1f(programInfo.uniformLocations.brightness, settings.brightness);
      checkGLError(gl, "drawScene - after uniform1f for brightness");
    }
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, canvasRef, settings, checkGLError]); // Added settings to dependencies


  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !isInitializedRef.current) {
      console.log("ImageCanvas: Canvas element found, attempting WebGL initialization.");
      let context = canvas.getContext('webgl');
      if (!context) {
        context = canvas.getContext('experimental-webgl'); // Fallback for older browsers
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
      
      // Initial draw if image already exists (e.g. on component re-mount with active image)
      if (originalImage && glRef.current && !textureRef.current) {
         const newTexture = loadTexture(glRef.current, originalImage);
         if (newTexture) {
             textureRef.current = newTexture;
             requestAnimationFrame(drawScene);
         } else {
             textureRef.current = null;
         }
      } else {
        requestAnimationFrame(drawScene); // Initial clear or draw
      }
    }
  }, [canvasRef, initShaderProgram, initBuffers, loadTexture, originalImage, drawScene, checkGLError]);


  useEffect(() => {
    const gl = glRef.current;
    
    if (!gl || !isInitializedRef.current) {
      return;
    }

    if (originalImage) {
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        checkGLError(gl, "delete old texture");
      }
      const newTexture = loadTexture(gl, originalImage);
      if (newTexture) {
          textureRef.current = newTexture;
      } else {
          console.error("Failed to load new texture from originalImage. Texture will be null.");
          textureRef.current = null;
      }
    } else {
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        checkGLError(gl, "delete old texture in else branch");
        textureRef.current = null;
      }
    }
    
    if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    animationFrameIdRef.current = requestAnimationFrame(drawScene);

  }, [originalImage, loadTexture, drawScene, checkGLError]); // Removed gl from dependencies as glRef.current is stable once set


  // Effect to re-render when settings change
  useEffect(() => {
    if (isInitializedRef.current && glRef.current && originalImage && textureRef.current) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
    }
  }, [settings, drawScene, originalImage]);


  useEffect(() => {
    const gl = glRef.current; 
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const currentTexture = textureRef.current;

    return () => {
      console.log("ImageCanvas: Unmounting. Cleaning up WebGL resources.");
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (gl) {
        if (currentTexture) gl.deleteTexture(currentTexture);
        if (programInfo) gl.deleteProgram(programInfo.program);
        if (currentBuffers) {
          gl.deleteBuffer(currentBuffers.position);
          gl.deleteBuffer(currentBuffers.textureCoord);
        }
        // Attempt to lose context if supported
        const loseContextExt = gl.getExtension('WEBGL_lose_context');
        if (loseContextExt) {
            try {
                loseContextExt.loseContext();
                console.log("WebGL context lost successfully on unmount.");
            } catch (e) {
                console.warn("Could not lose WebGL context on unmount:", e);
            }
        } else {
            console.warn("WEBGL_lose_context extension not available.");
        }
      }
      glRef.current = null;
      programInfoRef.current = null;
      buffersRef.current = null;
      textureRef.current = null;
      isInitializedRef.current = false;
      console.log("WebGL resources cleanup complete.");
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
      style={{ imageRendering: 'pixelated' }} // Helps with crispness for pixel art, not strictly needed here
    />
  );
}
