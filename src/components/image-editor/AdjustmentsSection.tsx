
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sun, Contrast, Droplets, Aperture, Palette, CircleDot, Film, Thermometer, Paintbrush, Sparkles, Moon, Baseline, Brush } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ColorSpectrumSlider } from '@/components/ui/color-spectrum-slider';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

export function AdjustmentsSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();

  const handleSliderChange = (
    type: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'exposure' | 
          'highlights' | 'shadows' | 'whites' | 'blacks' | 
          'hueRotate' |
          'vignetteIntensity' | 'grainIntensity' | 
          'colorTemperature' | 
          'tintShadowsIntensity' | 'tintShadowsSaturation' |
          'tintHighlightsIntensity' | 'tintHighlightsSaturation',
    value: number
  ) => {
    if (originalImage) setIsPreviewing(true);

    switch (type) {
      case 'brightness':
        dispatchSettings({ type: 'SET_BRIGHTNESS', payload: value });
        break;
      case 'contrast':
        dispatchSettings({ type: 'SET_CONTRAST', payload: value });
        break;
      case 'saturation':
        dispatchSettings({ type: 'SET_SATURATION', payload: value });
        break;
      case 'vibrance':
        dispatchSettings({ type: 'SET_VIBRANCE', payload: value });
        break;
      case 'exposure':
        dispatchSettings({ type: 'SET_EXPOSURE', payload: value });
        break;
      case 'highlights':
        dispatchSettings({ type: 'SET_HIGHLIGHTS', payload: value });
        break;
      case 'shadows':
        dispatchSettings({ type: 'SET_SHADOWS', payload: value });
        break;
      case 'whites': // Added
        dispatchSettings({ type: 'SET_WHITES', payload: value });
        break;
      case 'blacks':
        dispatchSettings({ type: 'SET_BLACKS', payload: value });
        break;
      case 'hueRotate':
        dispatchSettings({ type: 'SET_HUE_ROTATE', payload: value });
        break;
      case 'vignetteIntensity':
        dispatchSettings({ type: 'SET_VIGNETTE_INTENSITY', payload: value });
        break;
      case 'grainIntensity':
        dispatchSettings({ type: 'SET_GRAIN_INTENSITY', payload: value });
        break;
      case 'colorTemperature':
        dispatchSettings({ type: 'SET_COLOR_TEMPERATURE', payload: value });
        break;
      case 'tintShadowsIntensity':
        dispatchSettings({ type: 'SET_TINT_SHADOWS_INTENSITY', payload: value });
        break;
      case 'tintShadowsSaturation':
        dispatchSettings({ type: 'SET_TINT_SHADOWS_SATURATION', payload: value });
        break;
      case 'tintHighlightsIntensity':
        dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_INTENSITY', payload: value });
        break;
      case 'tintHighlightsSaturation':
        dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_SATURATION', payload: value });
        break;
    }
  };
  
  const handleTintColorChange = (
    tonalRange: 'shadows' | 'highlights',
    color: string
  ) => {
    const isValidHex = /^#[0-9A-F]{6}$/i.test(color);
    if (!isValidHex && color !== '') { 
        console.warn("Invalid hex color from spectrum slider:", color); 
        return;
    }

    if (tonalRange === 'shadows') {
      dispatchSettings({ type: 'SET_TINT_SHADOWS_COLOR', payload: color });
    } else if (tonalRange === 'highlights') {
      dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_COLOR', payload: color });
    }
    if (originalImage) setIsPreviewing(false);
  };

  // Basic Adjustments
  const basicAdjustmentControls = [
    { id: 'brightness', label: 'Brightness', icon: Sun, value: settings.brightness, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'contrast', label: 'Contrast', icon: Contrast, value: settings.contrast, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: settings.saturation, min: 0, max: 2, step: 0.01 },
    { id: 'vibrance', label: 'Vibrance', icon: Brush, value: settings.vibrance, min: -1, max: 1, step: 0.01 },
    { id: 'exposure', label: 'Exposure', icon: Aperture, value: settings.exposure, min: -0.5, max: 0.5, step: 0.01 },
    { id: 'highlights', label: 'Highlights', icon: Sparkles, value: settings.highlights, min: -1, max: 1, step: 0.01 },
    { id: 'shadows', label: 'Shadows', icon: Moon, value: settings.shadows, min: -1, max: 1, step: 0.01 },
    { id: 'whites', label: 'Whites', icon: Sparkles, value: settings.whites, min: -1, max: 1, step: 0.01 }, // Added
    { id: 'blacks', label: 'Blacks', icon: Baseline, value: settings.blacks, min: -1, max: 1, step: 0.01 },
  ];

  // Color Settings
  const colorSettingControls = [
    { id: 'hueRotate', label: 'Hue Rotate', icon: Palette, value: settings.hueRotate, min: 0, max: 360, step: 1 },
    { id: 'colorTemperature', label: 'Temperature', icon: Thermometer, value: settings.colorTemperature, min: -100, max: 100, step: 1 },
  ];

  // Effect Settings
  const effectSettingControls = [
    { id: 'vignetteIntensity', label: 'Vignette', icon: CircleDot, value: settings.vignetteIntensity, min: 0, max: 1, step: 0.01 },
    { id: 'grainIntensity', label: 'Grain', icon: Film, value: settings.grainIntensity, min: 0, max: 1, step: 0.01 },
  ];
  
  const renderSlider = (control: any, isIntensitySlider: boolean = false, isSaturationSlider: boolean = false) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          {control.icon && <control.icon className="mr-2 h-4 w-4" />}
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {control.id === 'exposure' ? control.value.toFixed(2) :
           control.id === 'hueRotate' ? `${Math.round(control.value)}°` :
           ['highlights', 'shadows', 'whites', 'blacks', 'vibrance'].includes(control.id) ? `${Math.round(control.value * 100)}` :
           isIntensitySlider || control.id.includes('Intensity') || isSaturationSlider || control.id === 'saturation' ? `${Math.round(control.value * 100)}%` :
           control.id === 'colorTemperature' ? `${Math.round(control.value)}` :
           `${Math.round(control.value * 100)}%`}
        </span>
      </div>
      <Slider
        id={control.id}
        min={control.min}
        max={control.max}
        step={control.step}
        value={[control.value]}
        onValueChange={(val) => {
          if (originalImage) setIsPreviewing(true);
          handleSliderChange(control.id as any, val[0]);
        }}
        disabled={!originalImage}
        onPointerDown={() => {
          if (originalImage) setIsPreviewing(true);
        }}
        onValueCommit={() => { 
          if (originalImage) setIsPreviewing(false);
        }}
      />
    </div>
  );

  const renderTintControlGroup = (
    tonalRange: 'shadows' | 'highlights',
    label: string,
    colorValue: string,
    intensityValue: number,
    saturationValue: number
  ) => {
    const intensityControlId = `tint${tonalRange.charAt(0).toUpperCase() + tonalRange.slice(1)}Intensity` as any;
    const saturationControlId = `tint${tonalRange.charAt(0).toUpperCase() + tonalRange.slice(1)}Saturation` as any;
    const colorControlId = `tint${tonalRange.charAt(0).toUpperCase() + tonalRange.slice(1)}Color`;

    let displayColor = colorValue || '#808080'; 
    if (colorValue && saturationValue !== 1) {
        const rgbColor = hexToRgb(colorValue);
        if (rgbColor) {
            const desaturated = desaturateRgb(rgbColor, saturationValue);
            displayColor = rgbToHex(desaturated.r, desaturated.g, desaturated.b);
        }
    }

    return (
    <div key={tonalRange} className="space-y-3">
      {renderSlider({
        id: intensityControlId,
        label: `${label} Tint`,
        icon: Paintbrush, 
        value: intensityValue,
        min: 0, max: 0.5, step: 0.01
      }, true)}

      {intensityValue > 0 && (
        <div className="space-y-1.5 pl-6">
          <div className="flex items-center space-x-2">
            <Label htmlFor={colorControlId} className="text-xs text-muted-foreground shrink-0">
              Color:
            </Label>
            <div 
              id={`${colorControlId}Swatch`}
              className="h-5 w-5 rounded-sm border border-input shrink-0" 
              style={{ backgroundColor: displayColor }}
            />
          </div>
          <ColorSpectrumSlider
            onColorChange={(newColor) => {
              handleTintColorChange(tonalRange, newColor);
            }}
            className="h-4"
          />
          {renderSlider({
            id: saturationControlId,
            label: `Saturation`,
            icon: Droplets,
            value: saturationValue,
            min: 0, max: 1, step: 0.01
          }, false, true)}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      {/* Basic Adjustments */}
      <Label className="text-sm font-medium block mb-2">Adjustments</Label>
      {basicAdjustmentControls.map(control => renderSlider(control))}

      <Separator className="my-4" />
      
      {/* Color Settings */}
      <Label className="text-sm font-medium block">Colors</Label>
      {colorSettingControls.map(control => renderSlider(control))}
      
      <Separator className="my-4" />

      {/* Tint Settings */}
      <Label className="text-sm font-medium block">Tint</Label>
      {renderTintControlGroup('shadows', 'Shadows', settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation)}
      {renderTintControlGroup('highlights', 'Highlights', settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation)}

      <Separator className="my-4" />

      {/* Effect Settings */}
      <Label className="text-sm font-medium block">Effects</Label>
      {effectSettingControls.map(control => renderSlider(control))}
    </div>
  );
}
