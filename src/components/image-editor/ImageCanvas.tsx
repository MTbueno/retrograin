
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
  const isInitializedRef = useRef(false); // To track if WebGL basics are set up

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
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
      },
      uniformLocations: {
        sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
      },
    };

    if (programInfo.attribLocations.vertexPosition === -1) console.error("Attrib aVertexPosition not found.");
    if (programInfo.attribLocations.textureCoord === -1) console.error("Attrib aTextureCoord not found.");
    if (programInfo.uniformLocations.sampler === null) console.error("Uniform uSampler not found.");
    
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
    // Quad covering the entire clip space, using a triangle strip.
    // Vertices: Top-left, Top-right, Bottom-left, Bottom-right
    const positions = [-1.0, 1.0, 1.0, 1.0, -1.0, -1.0, 1.0, -1.0];
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    if (!textureCoordBuffer) {
      console.error("Failed to create texture coordinate buffer.");
      return null;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);
    // Texture coordinates matching the quad vertices.
    // (0,1) Top-left, (1,1) Top-right, (0,0) Bottom-left, (1,0) Bottom-right
    // This matches typical image coordinate systems where (0,0) is top-left,
    // but WebGL's texture coordinates often have (0,0) at bottom-left.
    // The UNPACK_FLIP_Y_WEBGL will handle the Y inversion for texImage2D.
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

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // Flip the image's Y axis to match WebGL's coordinate system
    checkGLError(gl, "loadTexture - after pixelStorei");
    
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
    gl.bindTexture(gl.TEXTURE_2D, null); // Unbind texture after setup
    return texture;
  }, [checkGLError]);

  const drawScene = useCallback(() => {
    // console.log("drawScene called");
    const gl = glRef.current;
    const programInfo = programInfoRef.current;
    const currentBuffers = buffersRef.current;
    const canvas = canvasRef.current;
    const currentTexture = textureRef.current;

    if (!gl || !programInfo || !currentBuffers || !canvas) {
      // console.warn("drawScene: WebGL context, programInfo, or buffers not ready. Skipping draw.");
      return;
    }
    if (checkGLError(gl, "drawScene - start")) return;

    let canvasPhysicalWidth = canvas.clientWidth; 
    let canvasPhysicalHeight = canvas.clientHeight;

    if (originalImage) {
        // Determine aspect ratio of the image content (considering cropZoom for future use)
        const imageContentWidth = originalImage.naturalWidth / settings.cropZoom;
        const imageContentHeight = originalImage.naturalHeight / settings.cropZoom;
        let contentAspectRatio = imageContentWidth / imageContentHeight;

        // Determine canvas buffer dimensions, respecting image aspect ratio and max size limits
        let targetWidth = imageContentWidth;
        let targetHeight = imageContentHeight;

        // Adjust for 90/270 degree rotation for calculating buffer dimensions
        const isSideways = settings.rotation === 90 || settings.rotation === 270;
        if (isSideways) {
            contentAspectRatio = imageContentHeight / imageContentWidth; // Flipped aspect ratio
            targetWidth = imageContentHeight;
            targetHeight = imageContentWidth;
        }
        
        if (contentAspectRatio > 1) { // Landscape or square content
            if (targetWidth > (contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO)) {
                targetWidth = contentAspectRatio > 1.6 ? MAX_WIDTH_WIDE_RATIO : MAX_WIDTH_STANDARD_RATIO;
                targetHeight = targetWidth / contentAspectRatio;
            }
        } else { // Portrait content
            if (targetHeight > MAX_PHYSICAL_HEIGHT_CAP) {
                targetHeight = MAX_PHYSICAL_HEIGHT_CAP;
                targetWidth = targetHeight * contentAspectRatio;
            }
             if (targetWidth > MAX_WIDTH_STANDARD_RATIO) { // Still cap width for very narrow tall images
                 targetWidth = MAX_WIDTH_STANDARD_RATIO;
                 targetHeight = targetWidth / contentAspectRatio;
             }
        }
        canvasPhysicalWidth = Math.round(targetWidth);
        canvasPhysicalHeight = Math.round(targetHeight);

    } else {
      canvasPhysicalWidth = 300; // Default placeholder size
      canvasPhysicalHeight = 150;
    }
    
    if (canvas.width !== canvasPhysicalWidth || canvas.height !== canvasPhysicalHeight) {
        canvas.width = canvasPhysicalWidth;
        canvas.height = canvasPhysicalHeight;
        console.log(`drawScene: Canvas drawing buffer dimensions set to ${canvas.width}x${canvas.height}`);
    }
    
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    checkGLError(gl, "drawScene - after viewport");

    gl.clearColor(0.188, 0.188, 0.188, 1.0); // Approx #303030
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); // Added DEPTH_BUFFER_BIT for good measure
    checkGLError(gl, "drawScene - after clear");

    if (!originalImage || !currentTexture) {
        console.log("drawScene: No original image or texture to draw. Canvas cleared.");
        return; 
    }
    // console.log("drawScene: Attempting to draw textured quad.");

    gl.useProgram(programInfo.program);
    checkGLError(gl, "drawScene - after useProgram");

    // Set position attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0); // 2 components per vertex
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
    checkGLError(gl, "drawScene - after position attribute setup");

    // Set texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, currentBuffers.textureCoord);
    gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, 2, gl.FLOAT, false, 0, 0); // 2 components per vertex
    gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    checkGLError(gl, "drawScene - after texCoord attribute setup");

    // Specify the texture to map to the faces.
    gl.activeTexture(gl.TEXTURE0); // Activate texture unit 0
    checkGLError(gl, "drawScene - after activeTexture");
    gl.bindTexture(gl.TEXTURE_2D, currentTexture); // Bind the image texture
    checkGLError(gl, "drawScene - after bindTexture");
    
    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.sampler, 0); 
    checkGLError(gl, "drawScene - after uniform1i for sampler");
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Draw the quad (4 vertices for a strip)
    checkGLError(gl, "drawScene - after drawArrays");

    // console.log("drawScene: Image should be rendered.");

  }, [originalImage, canvasRef, checkGLError, settings]); 


  // Initialize WebGL context, shaders, program, buffers (once)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas && !isInitializedRef.current) {
      console.log("ImageCanvas: Canvas element found, attempting WebGL initialization.");
      let context = canvas.getContext('webgl2', { preserveDrawingBuffer: true }); // Added preserveDrawingBuffer for easier debugging if needed
      if (context) {
        console.log("WebGL2 context obtained.");
      } else {
        console.log("WebGL2 not available, trying WebGL1.");
        context = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (context) {
          console.log("WebGL1 context obtained.");
        }
      }
      
      if (!context) {
        console.error("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
      }
      glRef.current = context;
      console.log("WebGL context successfully stored in glRef.");
      checkGLError(glRef.current, "Initial context get");

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
      
      requestAnimationFrame(drawScene); // Initial clear or draw based on originalImage state

    } else if (canvas && isInitializedRef.current) {
        requestAnimationFrame(drawScene); 
    }

  }, [canvasRef, initShaderProgram, initBuffers, drawScene, checkGLError]);


  // Load texture when originalImage changes or WebGL becomes ready
  useEffect(() => {
    // console.log("Texture loading effect triggered. OriginalImage:", originalImage ? "Exists" : "Null", "isInitialized:", isInitializedRef.current);
    const gl = glRef.current;
    
    if (!gl || !isInitializedRef.current) {
      // console.log("Texture loading: GL context or WebGL core not ready yet.");
      return;
    }

    if (textureRef.current) {
      // console.log("Deleting old texture.");
      gl.deleteTexture(textureRef.current);
      textureRef.current = null;
      checkGLError(gl, "delete old texture");
    }

    if (originalImage) {
      // console.log("Original image exists, attempting to load new texture.");
      const newTexture = loadTexture(gl, originalImage);
      if (newTexture) {
          textureRef.current = newTexture;
          // console.log("New texture created and assigned to textureRef.current.");
      } else {
          console.error("Failed to load new texture from originalImage. Texture will be null.");
          textureRef.current = null; 
      }
    } else {
      // console.log("OriginalImage is null, textureRef set to null (no texture to load).");
      textureRef.current = null;
    }
    
    if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    animationFrameIdRef.current = requestAnimationFrame(drawScene);
    // console.log("Requested drawScene after texture update/clear.");

  }, [originalImage, loadTexture, drawScene, checkGLError]); 


  // Cleanup WebGL resources on unmount
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
        const loseContextExt = gl.getExtension('WEBGL_lose_context');
        if (loseContextExt) loseContextExt.loseContext();
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
    />
  );
}
