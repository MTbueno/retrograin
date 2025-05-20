
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
    type: 'brightness' | 'contrast' | 'saturation' | 'exposure' | 'hueRotate' | 'vignetteIntensity' | 'grainIntensity' | 'colorTemperature' | 'tintIntensity',
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
      case 'tintIntensity':
        dispatchSettings({ type: 'SET_TINT_INTENSITY', payload: value });
        break;
    }
  };

  const handleTintColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatchSettings({ type: 'SET_TINT_COLOR', payload: event.target.value });
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

  const renderSlider = (control: any) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          <control.icon className="mr-2 h-4 w-4" />
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {control.id === 'exposure' ? control.value.toFixed(2) :
           control.id === 'hueRotate' ? `${Math.round(control.value)}°` :
           control.id === 'vignetteIntensity' || control.id === 'grainIntensity' || control.id === 'tintIntensity' ? `${Math.round(control.value * 100)}%` :
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

  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Adjustments</Label>
      {generalAdjustments.map(renderSlider)}

      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Colors</Label>
      {colorAdjustments.map(renderSlider)}
      
      {/* Tint Controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="tintColor" className="flex items-center text-xs text-muted-foreground">
            <Paintbrush className="mr-2 h-4 w-4" />
            Tint Color
          </Label>
           <span className="text-xs text-muted-foreground uppercase">{settings.tintColor || 'None'}</span>
        </div>
        <Input
          type="color"
          id="tintColor"
          value={settings.tintColor || '#000000'} // Default to black if empty for picker
          onChange={handleTintColorChange}
          disabled={!originalImage}
          className="w-full h-8 p-1 border-input bg-background"
        />
      </div>
      {renderSlider({
        id: 'tintIntensity',
        label: 'Tint Intensity',
        icon: Paintbrush, // Using Paintbrush again, or could be a different one
        value: settings.tintIntensity,
        min: 0,
        max: 1,
        step: 0.01
      })}

      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Effects</Label>
      {effectAdjustments.map(renderSlider)}
    </div>
  );
}
