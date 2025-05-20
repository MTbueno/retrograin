
"use client";

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

interface ColorSpectrumSliderProps {
  onColorChange: (color: string) => void;
  className?: string;
  height?: number;
}

const DEFAULT_HEIGHT = 16; // Increased height for better usability

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => ('0' + c.toString(16)).slice(-2);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function ColorSpectrumSlider({
  onColorChange,
  className,
  height = DEFAULT_HEIGHT,
}: ColorSpectrumSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const drawGradient = useCallback(() => {
    const canvas = canvasRef.current;
    const sliderDiv = sliderRef.current;
    if (!canvas || !sliderDiv) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const rect = sliderDiv.getBoundingClientRect();
    canvas.width = rect.width > 0 ? rect.width : 100; // Ensure width is positive
    canvas.height = rect.height > 0 ? rect.height : DEFAULT_HEIGHT; // Ensure height is positive


    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, '#FF0000');    // Red
    gradient.addColorStop(0.16, '#FFFF00'); // Yellow
    gradient.addColorStop(0.33, '#00FF00'); // Green
    gradient.addColorStop(0.50, '#00FFFF'); // Cyan
    gradient.addColorStop(0.66, '#0000FF'); // Blue
    gradient.addColorStop(0.83, '#FF00FF'); // Magenta
    gradient.addColorStop(1, '#FF0000');    // Red (wrap)

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [height]); // Add height to dependency array if it can change

  useEffect(() => {
    // Initial draw
    drawGradient();

    // Optional: ResizeObserver if the sliderDiv can change size dynamically
    // For a fixed-width sidebar, drawing once on mount or when dependencies change might be enough.
    // If the parent's width can change, a ResizeObserver here would be more robust.
    const sliderDiv = sliderRef.current;
    if (sliderDiv) {
        const resizeObserver = new ResizeObserver(() => {
            drawGradient();
        });
        resizeObserver.observe(sliderDiv);
        return () => resizeObserver.disconnect();
    }

  }, [drawGradient]);

  const selectColorAtX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    const sliderDiv = sliderRef.current;
    if (!canvas || !sliderDiv || canvas.width === 0) return;

    const rect = sliderDiv.getBoundingClientRect();
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, canvas.width - 1)); // Clamp x to be within canvas bounds

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pixel = ctx.getImageData(x, Math.floor(canvas.height / 2), 1, 1).data;
    const hexColor = rgbToHex(pixel[0], pixel[1], pixel[2]);
    onColorChange(hexColor);
  }, [onColorChange]); // canvasRef and sliderRef are stable

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true);
    selectColorAtX(event.clientX);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (event: MouseEvent) => {
      if (isDragging) {
        selectColorAtX(event.clientX);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, selectColorAtX]);

  return (
    <>
      <div
        ref={sliderRef}
        className={cn(
          'w-full cursor-pointer rounded-sm border border-input shadow-inner',
          className
        )}
        style={{
          height: `${height}px`,
          background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }}
        onMouseDown={handleMouseDown}
      />
      {/* Canvas for color picking, not displayed */}
      <canvas ref={canvasRef} style={{ display: 'none' }} data-testid="color-picker-canvas"/>
    </>
  );
}
