
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Sun, Contrast, Droplets, Aperture, Palette, CircleDot, Film, Thermometer, Paintbrush } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export function AdjustmentsSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();

  const handleSliderChange = (
    type: 'brightness' | 'contrast' | 'saturation' | 'exposure' | 
          'hueRotate' | 'vignetteIntensity' | 'grainIntensity' | 
          'colorTemperature' | 'tintShadowsIntensity' | 
          'tintMidtonesIntensity' | 'tintHighlightsIntensity',
    value: number
  ) => {
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
      case 'exposure':
        dispatchSettings({ type: 'SET_EXPOSURE', payload: value });
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
      case 'tintMidtonesIntensity':
        dispatchSettings({ type: 'SET_TINT_MIDTONES_INTENSITY', payload: value });
        break;
      case 'tintHighlightsIntensity':
        dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_INTENSITY', payload: value });
        break;
    }
  };

  const handleTintColorChange = (
    tonalRange: 'shadows' | 'midtones' | 'highlights',
    color: string
  ) => {
    if (tonalRange === 'shadows') {
      dispatchSettings({ type: 'SET_TINT_SHADOWS_COLOR', payload: color });
    } else if (tonalRange === 'midtones') {
      dispatchSettings({ type: 'SET_TINT_MIDTONES_COLOR', payload: color });
    } else if (tonalRange === 'highlights') {
      dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_COLOR', payload: color });
    }
    setIsPreviewing(false); // Ensure full render after color pick
  };
  

  const generalAdjustments = [
    { id: 'brightness', label: 'Brightness', icon: Sun, value: settings.brightness, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'contrast', label: 'Contrast', icon: Contrast, value: settings.contrast, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: settings.saturation, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'exposure', label: 'Exposure', icon: Aperture, value: settings.exposure, min: -0.5, max: 0.5, step: 0.01 },
  ];

  const colorAdjustments = [
    { id: 'hueRotate', label: 'Hue Rotate', icon: Palette, value: settings.hueRotate, min: 0, max: 360, step: 1 },
    { id: 'colorTemperature', label: 'Temperature', icon: Thermometer, value: settings.colorTemperature, min: -100, max: 100, step: 1 },
  ];
  
  const effectAdjustments = [
    { id: 'vignetteIntensity', label: 'Vignette', icon: CircleDot, value: settings.vignetteIntensity, min: 0, max: 1, step: 0.01 },
    { id: 'grainIntensity', label: 'Grain', icon: Film, value: settings.grainIntensity, min: 0, max: 1, step: 0.01 },
  ];

  const renderSlider = (control: any, isIntensitySlider: boolean = false) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          {control.icon && <control.icon className="mr-2 h-4 w-4" />}
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {control.id === 'exposure' ? control.value.toFixed(2) :
           control.id === 'hueRotate' ? `${Math.round(control.value)}°` :
           isIntensitySlider || control.id.includes('Intensity') ? `${Math.round(control.value * 100)}%` :
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
        onValueChange={(val) => handleSliderChange(control.id as any, val[0])}
        disabled={!originalImage}
        onPointerDown={() => {
          if (originalImage) setIsPreviewing(true);
        }}
        onPointerUp={() => {
          if (originalImage) setIsPreviewing(false);
        }}
      />
    </div>
  );

  const renderTintControl = (
    tonalRange: 'shadows' | 'midtones' | 'highlights',
    label: string,
    colorValue: string,
    intensityValue: number
  ) => (
    <div key={tonalRange} className="space-y-3">
      {renderSlider({
        id: `tint${tonalRange.charAt(0).toUpperCase() + tonalRange.slice(1)}Intensity` as any,
        label: `${label} Tint`,
        icon: Paintbrush, // Use one icon for all tint intensity sliders for consistency
        value: intensityValue,
        min: 0, max: 1, step: 0.01
      }, true)}

      {intensityValue > 0 && (
        <div className="space-y-1 pl-1">
          <Label htmlFor={`tint${tonalRange}Color`} className="text-xs text-muted-foreground">
            {label} Color
          </Label>
          <Input
            type="color"
            id={`tint${tonalRange}Color`}
            value={colorValue || '#000000'} 
            onChange={(e) => handleTintColorChange(tonalRange, e.target.value)}
            disabled={!originalImage}
            className="w-full h-8 p-1 border-input bg-background"
          />
        </div>
      )}
    </div>
  );


  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Adjustments</Label>
      {generalAdjustments.map(control => renderSlider(control))}

      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Colors</Label>
      {colorAdjustments.map(control => renderSlider(control))}
      
      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Tint</Label>
      {renderTintControl('shadows', 'Shadows', settings.tintShadowsColor, settings.tintShadowsIntensity)}
      {renderTintControl('midtones', 'Midtones', settings.tintMidtonesColor, settings.tintMidtonesIntensity)}
      {renderTintControl('highlights', 'Highlights', settings.tintHighlightsColor, settings.tintHighlightsIntensity)}

      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Effects</Label>
      {effectAdjustments.map(control => renderSlider(control))}
    </div>
  );
}
