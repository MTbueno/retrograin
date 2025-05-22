
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Card } from '@/components/ui/card';

// Vertex shader program
const vsSource = `
  attribute vec4 aVertexPosition;
  attribute vec2 aTextureCoord;
  varying highp vec2 vTextureCoord;
  void main(void) {
    gl_Position = aVertexPosition;
    vTextureCoord = aTextureCoord;
  }
`;

// Fragment shader program
const fsSource = `
  varying highp vec2 vTextureCoord;
  uniform sampler2D uSampler;
  void main(void) {
    gl_FragColor = texture2D(uSampler, vTextureCoord);
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
  };
}

interface Buffers {
  position: WebGLBuffer;
  textureCoord: WebGLBuffer;
}

export function ImageCanvas() {
  const { originalImage, settings, canvasRef, isPreviewing } = useImageEditor();
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programInfoRef = useRef<ProgramInfo | null>(null);
  const buffersRef = useRef<Buffers | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  const MAX_WIDTH_STANDARD_RATIO = 800;
  const MAX_WIDTH_WIDE_RATIO = 960;
  const MAX_PHYSICAL_HEIGHT_CAP = 1000;
  // const PREVIEW_SCALE_FACTOR = 0.5; // Not used in current WebGL basic render

  const checkGLError = useCallback((gl: WebGLRenderingContext | null, operation: string) => {
    if (!gl) {
        // console.warn(`WebGL context not available for ${operation}`);
        return true; // Indicate error if gl context is missing
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
      let errorMsg = "WebGL Error: Unknown error";
      switch (error) {
        case gl.INVALID_ENUM: errorMsg = "INVALID_ENUM"; break;
        case gl.INVALID_VALUE: errorMsg = "INVALID_VALUE"; break;
        case gl.INVALID_OPERATION: errorMsg = "INVALID_OPERATION"; break;
        case gl.OUT_OF_MEMORY: errorMsg = "OUT_OF_MEMORY"; break;
        case gl.CONTEXT_LOST_WEBGL: errorMsg = "CONTEXT_LOST_WEBGL"; break;
      }
      console.error(`WebGL Error (${operation}): ${errorMsg}`);
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
      console.error('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }, []);

  const initShaderProgram = useCallback((gl: WebGLRenderingContext, vsSource: string, fsSource: string): ProgramInfo | null => {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    if (!vertexShader || !fragmentShader) {
      console.error("Failed to load shaders.");
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
    console.log("Shader program initialized successfully.");
    checkGLError(gl, "initShaderProgram - after link");


    const programInfo: ProgramInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
      },
      uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
      },
    };

    if (programInfo.attribLocations.vertexPosition === -1) console.error("Vertex position attribute (aVertexPosition) not found in shader.");
    if (programInfo.attribLocations.textureCoord === -1) console.error("Texture coordinate attribute (aTextureCoord) not found in shader.");
    if (programInfo.uniformLocations.sampler === null) console.error("Sampler uniform (uSampler) not found in shader.");
    
    console.log("Program info created:", programInfo);
    return programInfo;
  }, [checkGLError, loadShader]);

  const initBuffers = useCallback((gl: WebGLRenderingContext): Buffers | null => {
    const positionBuffer = gl.createBuffer();
    if (!positionBuffer) {
      console.error("Failed to create position buffer.");
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    const positions = [ // Full-screen quad
      -1.0, -1.0, // bottom left
       1.0, -1.0, // bottom right
      -1.0,  1.0, // top left
       1.0,  1.0, // top right
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) {
      console.error("Failed to create texture coordinate buffer.");
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    const textureCoordinates = [
      0.0,  0.0, // bottom left
      1.0,  0.0, // bottom right
      0.0,  1.0, // top left
      1.0,  1.0, // top right
    ];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    console.log("Buffers initialized.");
    checkGLError(gl, "initBuffers");
    return { position: positionBuffer, textureCoord: textureCoordBuffer };
  }, [checkGLError]);

  const loadTexture = useCallback((gl: WebGLRenderingContext, image: HTMLImageElement): WebGLTexture | null => {
    const texture = gl.createTexture();
    if (!texture) {
        console.error("Failed to create texture object.");
        return null;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    
    // Set the parameters so we can render any size image.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Upload the image into the texture.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip Y to match WebGL coord system
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    
    if (checkGLError(gl, "loadTexture - after texImage2D")) {
        gl.deleteTexture(texture); // Clean up if error
        return null;
    }
    
    console.log("Texture loaded successfully from image:", image.src.substring(0,50) + "...");
    return texture;
  }, [checkGLError]);

  // Draw scene
  const drawScene = useCallback(() => {
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const buffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;

    // console.log("drawScene called. GL:", !!gl, "ProgramInfo:", !!programInfo, "Buffers:", !!buffers, "Canvas:", !!canvas, "Texture:", !!currentTexture, "OriginalImage:", !!originalImage);
    if (checkGLError(gl, "drawScene - start")) return;

    if (!gl || !programInfo || !buffers || !canvas) {
      // console.warn("drawScene: WebGL context, programInfo, buffers or canvas not ready. Skipping draw.");
      return;
    }

    let canvasPhysicalWidth = canvas.clientWidth;
    let canvasPhysicalHeight = canvas.clientHeight;

    if (originalImage) {
        const aspectRatio = originalImage.naturalWidth / originalImage.naturalHeight;
        let targetWidth, targetHeight;

        targetWidth = Math.min(MAX_WIDTH_STANDARD_RATIO, originalImage.naturalWidth);
        if (originalImage.naturalWidth > MAX_WIDTH_STANDARD_RATIO) {
            targetHeight = targetWidth / aspectRatio;
        } else {
            targetHeight = originalImage.naturalHeight;
        }
        if (targetHeight > MAX_PHYSICAL_HEIGHT_CAP) {
            targetHeight = MAX_PHYSICAL_HEIGHT_CAP;
            targetWidth = targetHeight * aspectRatio;
        }
        
        if (targetWidth > (aspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO) ) {
             targetWidth = aspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;
             targetHeight = targetWidth / aspectRatio;
        }
        
        canvasPhysicalWidth = Math.round(targetWidth);
        canvasPhysicalHeight = Math.round(targetHeight);

    } else {
      canvasPhysicalWidth = canvas.clientWidth || 300; 
      canvasPhysicalHeight = canvas.clientHeight || 150;
    }
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
        console.log(`drawScene: Canvas dimensions set to ${canvas.width}x${canvas.height}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "drawScene - after viewport");

    gl.clearColor(0.188, 0.188, 0.188, 1.0); // Approx #303030
    gl.clear(gl.COLOR_BUFFER_BIT);
    checkGLError(gl, "drawScene - after clear");

    if (!originalImage || !currentTexture) {
        return; 
    }

    gl.useProgram(programInfo.program);
    checkGLError(gl, "drawScene - after useProgram");

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, "drawScene - after position attribute");

    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, "drawScene - after texCoord attribute");

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    gl.uniform1i(programInfo.uniformLocations.sampler, 0); 
    checkGLError(gl, "drawScene - after texture binding");
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
    checkGLError(gl, "drawScene - after drawArrays");

  }, [originalImage, canvasRef, checkGLError]);


  // Initialize WebGL context, shaders, program
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !glRef.current) {
      console.log("Attempting to initialize WebGL context...");
      const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }); 
      if (!gl) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
      }
      glRef.current = gl;
      console.log("WebGL context obtained.");

      const pInfo = initShaderProgram(gl, vsSource, fsSource);
      if (pInfo) {
        programInfoRef.current = pInfo;
        console.log("Shader program successfully initialized and linked.");
      } else {
        console.error("Failed to initialize shader program.");
        return;
      }

      const bInfo = initBuffers(gl);
      if (bInfo) {
        buffersRef.current = bInfo;
        console.log("WebGL buffers successfully initialized.");
      } else {
        console.error("Failed to initialize WebGL buffers.");
        return;
      }
       requestAnimationFrame(drawScene); // Initial draw
    }
  }, [canvasRef, initShaderProgram, initBuffers]); // Removed drawScene from dependency array


  // Load texture when originalImage changes
  useEffect(() => {
    const gl = glRef.current;
    console.log("Texture load effect triggered. originalImage:", originalImage ? "Image available" : "null", "gl:", !!gl);
    if (gl && programInfoRef.current && buffersRef.current) { 
      if (originalImage) {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          console.log("Deleted old texture.");
        }
        const newTexture = loadTexture(gl, originalImage);
        if (newTexture) {
            textureRef.current = newTexture;
            console.log("New texture created and assigned to textureRef.current.");
        } else {
            console.error("Failed to load new texture from originalImage.");
            textureRef.current = null; 
        }
      } else {
        if (textureRef.current) {
          gl.deleteTexture(textureRef.current);
          textureRef.current = null;
          console.log("originalImage is null, deleted texture.");
        }
      }
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = requestAnimationFrame(drawScene);
      console.log("Requested drawScene after texture update/clear.");
    } else {
      console.warn("Texture load effect: GL, programInfo, or buffers not ready yet.");
    }
  }, [originalImage, loadTexture, drawScene]); 

  // Effect for redrawing when settings or isPreviewing change (will be used for applying effects later)
   useEffect(() => {
     if (glRef.current && programInfoRef.current && buffersRef.current && originalImage) { 
       if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
       animationFrameIdRef.current = requestAnimationFrame(drawScene);
     }
   }, [settings, isPreviewing, drawScene, originalImage]);


  // Cleanup WebGL resources on unmount
  useEffect(() => {
    const currentGl = glRef.current; 
    const currentProgInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const currentTexture = textureRef.current;

    return () => {
      if (currentGl) {
        if (currentTexture) currentGl.deleteTexture(currentTexture);
        if (currentProgInfo) currentGl.deleteProgram(currentProgInfo.program);
        if (currentBuffers) {
          currentGl.deleteBuffer(currentBuffers.position);
          currentGl.deleteBuffer(currentBuffers.textureCoord);
        }
        console.log("WebGL resources cleaned up.");
      }
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
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
      className="max-w-full max-h-full object-contain rounded-md shadow-lg"
    />
  );
}

