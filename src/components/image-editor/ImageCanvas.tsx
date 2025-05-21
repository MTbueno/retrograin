
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Basic WebGL Shaders
const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec2 aTextureCoord;

  varying highp vec2 vTextureCoord;

  void main(void) {
    gl_Position = aVertexPosition;
    vTextureCoord = aTextureCoord;
  }
`;

const fsSource = `
  varying highp vec2 vTextureCoord;
  uniform sampler2D uSampler;

  // Placeholder for future adjustments - for now, just pass through
  void main(void) {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
  }
`;

function checkGLError(gl: WebGLRenderingContext, label: string) {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    let errorMsg = "WebGL Error";
    switch (error) {
      case gl.INVALID_ENUM: errorMsg = "INVALID_ENUM"; break;
      case gl.INVALID_VALUE: errorMsg = "INVALID_VALUE"; break;
      case gl.INVALID_OPERATION: errorMsg = "INVALID_OPERATION"; break;
      case gl.OUT_OF_MEMORY: errorMsg = "OUT_OF_MEMORY"; break;
      case gl.CONTEXT_LOST_WEBGL: errorMsg = "CONTEXT_LOST_WEBGL"; break;
    }
    console.error(`WebGL Error (${label}): ${errorMsg} (Code: ${error})`);
    return true;
  }
  return false;
}


// Helper function to load a shader
function loadShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error('Unable to create shader type: ' + type);
    return null;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

// Helper function to initialize a shader program
function initShaderProgram(gl: WebGLRenderingContext, vsSource: string, fsSource: string): WebGLProgram | null {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vertexShader || !fragmentShader) {
    console.error('Failed to load shaders.');
    return null;
  }

  const shaderProgram = gl.createProgram();
  if (!shaderProgram) {
    console.error('Unable to create shader program');
    return null;
  }
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);

  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    console.error('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    return null;
  }
  console.log("Shader program initialized successfully.");
  return shaderProgram;
}

// Helper function to initialize buffers for a quad
function initBuffers(gl: WebGLRenderingContext) {
  // Position buffer for a quad that covers the entire canvas
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [
    -1.0,  1.0,
     1.0,  1.0,
    -1.0, -1.0,
     1.0, -1.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  // Texture coordinate buffer
  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = [
    0.0,  1.0, // Top-left
    1.0,  1.0, // Top-right
    0.0,  0.0, // Bottom-left
    1.0,  0.0, // Bottom-right
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
  console.log("WebGL buffers initialized.");
  return {
    position: positionBuffer,
    textureCoord: textureCoordBuffer,
  };
}

// Helper function to load a texture
function loadTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) {
    console.error("Failed to create WebGL texture object.");
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  checkGLError(gl, "after bindTexture in loadTexture");

  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y axis for WebGL
  checkGLError(gl, "after UNPACK_FLIP_Y_WEBGL");

  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    checkGLError(gl, "after texImage2D");
  } catch (e) {
    console.error("Error in texImage2D:", e);
    gl.deleteTexture(texture);
    return null;
  }

  if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
     gl.generateMipmap(gl.TEXTURE_2D);
     checkGLError(gl, "after generateMipmap");
  } else {
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
     checkGLError(gl, "after texParameteri for non-POT");
  }
  console.log("WebGL texture loaded and configured for image:", image.src.substring(0,30) + "...");
  return texture;
}

function isPowerOf2(value: number) {
  return (value & (value - 1)) === 0;
}

export function ImageCanvas() {
  const { originalImage, settings, canvasRef } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<any>(null);
  const buffersRef = useRef<any>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);


  const MAX_WIDTH_STANDARD_RATIO = 800;
  const MAX_WIDTH_WIDE_RATIO = 960;
  const MAX_PHYSICAL_HEIGHT_CAP = 1000;

  // Initialize WebGL context, shaders, program, and buffers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !glRef.current) { // Initialize only once if canvas is available and GL context not yet created
      console.log("Attempting to initialize WebGL context...");
      // Try WebGL2 first, then fallback to WebGL1
      let gl = canvas.getContext('webgl2', { preserveDrawingBuffer: false });
      if (gl) {
        console.log("WebGL2 context obtained.");
      } else {
        console.log("WebGL2 not available, trying WebGL1.");
        gl = canvas.getContext('webgl', { preserveDrawingBuffer: false });
        if (gl) {
          console.log("WebGL1 context obtained.");
        }
      }
      
      if (!gl) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        alert("WebGL não está disponível. Seu navegador pode não suportar esta funcionalidade.");
        return;
      }
      glRef.current = gl;

      const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
      if (!shaderProgram) {
        console.error("Failed to initialize shader program during effect.");
        return;
      }
      checkGLError(gl, "after initShaderProgram in effect");

      programInfoRef.current = {
        program: shaderProgram,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
          textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
        },
        uniformLocations: {
          uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
        },
      };
      buffersRef.current = initBuffers(gl);
      console.log("WebGL initialized successfully in useEffect.");
      checkGLError(gl, "after initBuffers in effect");
    }
  }, [canvasRef]); // Runs when canvasRef.current changes or is available


  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const buffers = buffersRef.current;
    const currentTexture = textureRef.current;
    const canvas = canvasRef.current;

    if (!gl || !programInfo || !buffers || !canvas) {
      console.warn("drawScene called but WebGL context, programInfo, buffers or canvas not ready.");
      if (gl && canvas) { // Ensure canvas is cleared if no image but GL is there
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Match --background approx
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }
    
    const img = originalImage;

    if (!img) {
        // console.log("drawScene: No originalImage, clearing canvas.");
        gl.clearColor(0.188, 0.188, 0.188, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    // --- Simplified Canvas Sizing for Debugging ---
    let canvasPhysicalWidth = img.naturalWidth;
    let canvasPhysicalHeight = img.naturalHeight;
    const imgAspectRatio = img.naturalWidth / img.naturalHeight;

    // Apply max width/height limits while maintaining aspect ratio
    const targetMaxWidth = imgAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;
    if (canvasPhysicalWidth > targetMaxWidth) {
        canvasPhysicalWidth = targetMaxWidth;
        canvasPhysicalHeight = canvasPhysicalWidth / imgAspectRatio;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
        canvasPhysicalWidth = canvasPhysicalHeight * imgAspectRatio;
    }
    // --- End Simplified Canvas Sizing ---
    
    canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
    canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
        console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "after viewport");
    gl.clearColor(0.188, 0.188, 0.188, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    checkGLError(gl, "after clear");

    if (!currentTexture) {
        console.warn("drawScene: No currentTexture to draw, canvas cleared.");
        return;
    }

    gl.useProgram(programInfo.program);
    checkGLError(gl, "after useProgram");

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, "after vertexPosition attribute setup");

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, "after textureCoord attribute setup");
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);
    checkGLError(gl, "after texture binding and uniform setup");
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    checkGLError(gl, "after drawArrays");
    // console.log("drawScene: Scene drawn with texture.");

  }, [originalImage, settings, canvasRef]); // Settings will be used later

  // Load/update texture when originalImage changes
  useEffect(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    if (!gl || !programInfoRef.current || !canvas) { // Ensure GL, program, and canvas are ready
      // console.warn("Texture effect: GL context, programInfo or canvas not ready.");
      return;
    }

    if (originalImage) {
      console.log("Texture effect: originalImage found, attempting to load/update texture.");
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
        // console.log("Texture effect: Old texture deleted.");
      }
      const newTexture = loadTexture(gl, originalImage);
      if (newTexture) {
        textureRef.current = newTexture;
        console.log("Texture effect: New WebGL texture loaded successfully.");
        // Request a draw after texture is loaded
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
      } else {
        console.error("Texture effect: Failed to load WebGL texture for new image.");
        textureRef.current = null;
        // Still request a draw to clear canvas if texture failed
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
      }
    } else {
      // No original image, clear texture and canvas
      // console.log("Texture effect: No originalImage, clearing texture and requesting draw.");
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene); // Clears the canvas
    }
    
    // Cleanup animation frame on unmount or if effect re-runs
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [originalImage, drawScene, canvasRef]); // Depends on originalImage, drawScene, and canvasRef

  // Redraw when settings change (for future adjustments)
  useEffect(() => {
     if (glRef.current && programInfoRef.current && textureRef.current && originalImage) {
        if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = requestAnimationFrame(drawScene);
     }
  }, [settings, drawScene, originalImage]);


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
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
