
// src/lib/colorUtils.ts

export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
};

export const rgbToHex = (r: number, g: number, b: number): string => {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};

export const desaturateRgb = (rgb: { r: number; g: number; b: number }, saturation: number): { r: number; g: number; b: number } => {
  const gray = rgb.r * 0.3086 + rgb.g * 0.6094 + rgb.b * 0.0820; // Standard luminance calculation
  return {
    r: Math.round(rgb.r * saturation + gray * (1 - saturation)),
    g: Math.round(rgb.g * saturation + gray * (1 - saturation)),
    b: Math.round(rgb.b * saturation + gray * (1 - saturation)),
  };
};
