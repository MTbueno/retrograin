
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

  return {
    position: positionBuffer,
    textureCoord: textureCoordBuffer,
  };
}

// Helper function to load a texture
function loadTexture(gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) {
    console.error("Failed to create WebGL texture.");
    return null;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y axis for WebGL
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  if (isPowerOf2(image.width) && isPowerOf2(image.height)) {
     gl.generateMipmap(gl.TEXTURE_2D);
  } else {
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
     gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }
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

  // Initialize WebGL context, shaders, program, and buffers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !glRef.current) { // Initialize only once
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: false }); // preserveDrawingBuffer false for performance
      if (!gl) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        alert("WebGL não está disponível. Seu navegador pode não suportar esta funcionalidade.");
        return;
      }
      glRef.current = gl;

      const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
      if (!shaderProgram) {
        console.error("Failed to initialize shader program.");
        return;
      }

      programInfoRef.current = {
        program: shaderProgram,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
          textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
        },
        uniformLocations: {
          uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
          // Add other uniform locations here as effects are implemented
        },
      };
      buffersRef.current = initBuffers(gl);
      console.log("WebGL initialized successfully.");
    }
  }, [canvasRef]); // Runs when canvasRef.current is available

  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const buffers = buffersRef.current;
    const currentTexture = textureRef.current;
    const canvas = canvasRef.current;

    if (!gl || !programInfo || !buffers || !canvas) {
      // console.warn("drawScene called but WebGL context or resources not ready.");
      if (gl && canvas && !originalImage) { // Ensure canvas is cleared if no image
        gl.clearColor(0.188, 0.188, 0.188, 1.0); // Match --background approx
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
      return;
    }
    
    // Calculate canvas buffer dimensions based on original image and settings
    // This logic is similar to what we had for 2D canvas to respect aspect ratio and limits
    let canvasPhysicalWidth, canvasPhysicalHeight;
    const { rotation, cropZoom } = settings; // Using rotation and cropZoom for sizing
    const img = originalImage; // originalImage is the HTMLImageElement

    if (!img) {
        gl.clearColor(0.188, 0.188, 0.188, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
    }

    let sWidth = img.naturalWidth / cropZoom;
    let sHeight = img.naturalHeight / cropZoom;

    if (rotation === 90 || rotation === 270) {
      canvasPhysicalWidth = sHeight;
      canvasPhysicalHeight = sWidth;
    } else {
      canvasPhysicalWidth = sWidth;
      canvasPhysicalHeight = sHeight;
    }
    
    canvasPhysicalWidth = Math.max(1, Math.round(canvasPhysicalWidth));
    canvasPhysicalHeight = Math.max(1, Math.round(canvasPhysicalHeight));

    const currentAspectRatio = canvasPhysicalWidth > 0 ? canvasPhysicalWidth / canvasPhysicalHeight : 1;
    let targetMaxWidthForCanvas = (currentAspectRatio > 1.6) ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;

    if (canvasPhysicalWidth > targetMaxWidthForCanvas) {
        canvasPhysicalHeight = Math.round((targetMaxWidthForCanvas / canvasPhysicalWidth) * canvasPhysicalHeight);
        canvasPhysicalWidth = targetMaxWidthForCanvas;
    }
    if (canvasPhysicalHeight > MAX_PHYSICAL_HEIGHT_CAP) {
        canvasPhysicalWidth = Math.round((MAX_PHYSICAL_HEIGHT_CAP / canvasPhysicalHeight) * canvasPhysicalWidth);
        canvasPhysicalHeight = MAX_PHYSICAL_HEIGHT_CAP;
    }
    
    // Important: Set canvas drawing buffer size
    if (canvas.width !== Math.round(canvasPhysicalWidth) || canvas.height !== Math.round(canvasPhysicalHeight)) {
        canvas.width = Math.round(canvasPhysicalWidth);
        canvas.height = Math.round(canvasPhysicalHeight);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0.188, 0.188, 0.188, 1.0);  // Clear to dark gray
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (!currentTexture || !img) { // If no texture (e.g., image removed)
        return;
    }

    gl.useProgram(programInfo.program);

    // Bind vertex positions
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    // Bind texture coordinates
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    
    // Activate texture unit 0 and bind the texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0); // Tell shader to use texture unit 0

    // Pass other uniforms for adjustments here in the future
    // e.g., gl.uniform1f(programInfo.uniformLocations.uBrightness, settings.brightness);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the quad

  }, [originalImage, settings, canvasRef]); // settings will be used for uniforms later

  // Load/update texture when originalImage changes
  useEffect(() => {
    const gl = glRef.current;
    if (gl && programInfoRef.current) { // Ensure GL and program are ready
      if (originalImage) {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current); // Delete old texture
        }
        const newTexture = loadTexture(gl, originalImage);
        if (newTexture) {
          textureRef.current = newTexture;
          console.log("WebGL texture loaded for:", originalImage.src.substring(0,30));
          drawScene(); // Draw immediately after texture is loaded
        } else {
          console.error("Failed to load WebGL texture for image.");
          textureRef.current = null;
          drawScene(); // Attempt to clear canvas if texture fails
        }
      } else {
        // No original image, clear texture and canvas
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          textureRef.current = null;
        }
        drawScene(); // Clears the canvas
      }
    }
  }, [originalImage, drawScene]); // Depends on originalImage and drawScene

  // Redraw when settings change (for future adjustments)
  // This useEffect is currently minimal as adjustments are not yet implemented in shaders
  useEffect(() => {
     if (glRef.current && programInfoRef.current && textureRef.current) {
        //  console.log("Settings changed, redrawing WebGL scene.");
         drawScene();
     }
  }, [settings, drawScene]);


  if (!originalImage) {
    return (
      <Card className="w-full h-full flex items-center justify-center bg-muted/50 border-dashed">
        <p className="text-muted-foreground">Upload an image to start editing</p>
        {/* The main canvas is now only rendered when originalImage exists, 
            so no need for a hidden canvas here.
            The canvasRef from context will be assigned to the main canvas below. */}
      </Card>
    );
  }

  return (
    <canvas
      ref={canvasRef} // canvasRef is from useImageEditor context
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
      style={{ imageRendering: 'pixelated' }} // 'pixelated' or 'auto'
    />
  );
}
