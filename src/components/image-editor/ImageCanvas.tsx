
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

  void main(void) {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
  }
`;

// Helper function to load a shader
function loadShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error('Unable to create shader');
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
  return shaderProgram;
}

// Helper function to initialize buffers
function initBuffers(gl: WebGLRenderingContext) {
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const positions = [
    -1.0,  1.0,
     1.0,  1.0,
    -1.0, -1.0,
     1.0, -1.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

  const textureCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
  const textureCoordinates = [
    0.0,  1.0,
    1.0,  1.0,
    0.0,  0.0,
    1.0,  0.0,
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);

  return {
    position: positionBuffer,
    textureCoord: textureCoordBuffer,
  };
}

// Helper function to load a texture
function loadTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  // WebGL1 has different requirements for power of 2 images
  // vs non power of 2 images so check if the image is a
  // power of 2 in both dimensions.
  if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
     // Yes, it's a power of 2. Generate mips.
     gl.generateMipmap(gl.TEXTURE_2D);
  } else {
     // No, it's not a power of 2. Turn off mips and set
     // wrapping to clamp to edge
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }
  // Flip the image's Y axis to match WebGL's coordinate system.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
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

  const MAX_WIDTH_STANDARD_RATIO = 800;
  const MAX_WIDTH_WIDE_RATIO = 960;
  const MAX_PHYSICAL_HEIGHT_CAP = 1000;

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const buffers = buffersRef.current;
    const texture = textureRef.current;

    if (!gl || !programInfo || !buffers || !texture || !originalImage) {
      if (gl && !originalImage) { // Clear if no image
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Match --background approx
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }
    
    // For now, image will stretch to fill canvas. Aspect ratio will be fixed later.
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Calculate canvas buffer dimensions based on original logic (without preview scaling for now)
    let canvasPhysicalWidth, canvasPhysicalHeight;
    const { rotation, cropZoom, scaleX, scaleY } = settings; // Ignoring cropOffsets for initial WebGL render

    let sWidth = originalImage.naturalWidth / cropZoom;
    let sHeight = originalImage.naturalHeight / cropZoom;

    if (Math.abs(scaleX) !== 1 || Math.abs(scaleY) !== 1) { // Check if flips are applied
      if (rotation === 90 || rotation === 270) {
        canvasPhysicalWidth = sHeight * Math.abs(scaleY);
        canvasPhysicalHeight = sWidth * Math.abs(scaleX);
      } else {
        canvasPhysicalWidth = sWidth * Math.abs(scaleX);
        canvasPhysicalHeight = sHeight * Math.abs(scaleY);
      }
    } else { // No flips
       if (rotation === 90 || rotation === 270) {
        canvasPhysicalWidth = sHeight;
        canvasPhysicalHeight = sWidth;
      } else {
        canvasPhysicalWidth = sWidth;
        canvasPhysicalHeight = sHeight;
      }
    }

    canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
    canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));

    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1;
    let targetMaxWidthForCanvas = (currentAspectRatio > 1.6) ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = canvasPhysicalWidth > 0 ? Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight) : Math.round(targetMaxWidthForCanvas / currentAspectRatio);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = canvasPhysicalHeight > 0 ? Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth) : Math.round(MAX_PHYSICAL_HEIGHT_CAP * currentAspectRatio);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    canvas.width = Math.round(canvasPhysicalWidth);
    canvas.height = Math.round(canvasPhysicalHeight);
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.188, 0.188, 0.188, 1.0);  // Clear to dark gray
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);

    // Set the shader uniforms
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);
    
    // Bind vertex positions
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Bind texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  }, [originalImage, canvasRef, settings]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!glRef.current) {
      const gl = canvas.getContext('webgl');
      if (!gl) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        alert("WebGL não está disponível. Seu navegador pode não suportar esta funcionalidade.");
        return;
      }
      glRef.current = gl;

      const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
      if (!shaderProgram) return;

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
    }
    // Initial draw or redraw if originalImage changes
    drawScene();

  }, [canvasRef, drawScene]); // drawScene is stable due to useCallback and its dependencies

   useEffect(() => {
    const gl = glRef.current;
    if (gl && originalImage) {
      // Delete old texture if it exists to prevent memory leaks
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
      }
      textureRef.current = loadTexture(gl, originalImage);
      drawScene();
    } else if (gl && !originalImage) {
      // Clear texture and redraw scene (which will clear canvas)
      if (textureRef.current) {
        gl.deleteTexture(textureRef.current);
        textureRef.current = null;
      }
      drawScene();
    }
  }, [originalImage, drawScene]);


  if (!originalImage) {
    return (
      <Card className="w-full h-full flex items-center justify-center bg-muted/50 border-dashed">
        <p className="text-muted-foreground">Upload an image to start editing</p>
        <canvas ref={canvasRef} style={{ display: 'none'}} /> {/* Keep canvas for init if no image */}
      </Card>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
      // imageRendering will be less relevant for WebGL, but keep for consistency
      style={{ imageRendering: 'auto' }} 
    />
  );
}
