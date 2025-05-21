
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sun, Contrast, Droplets, Aperture, Sparkles, Moon, Baseline } from 'lucide-react';

export function BasicAdjustmentsSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();

  const handleSliderChange = (
    type: 'brightness' | 'contrast' | 'saturation' | 'exposure' | 
          'highlights' | 'shadows' | 'blacks',
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
      case 'exposure':
        dispatchSettings({ type: 'SET_EXPOSURE', payload: value });
        break;
      case 'highlights':
        dispatchSettings({ type: 'SET_HIGHLIGHTS', payload: value });
        break;
      case 'shadows':
        dispatchSettings({ type: 'SET_SHADOWS', payload: value });
        break;
      case 'blacks':
        dispatchSettings({ type: 'SET_BLACKS', payload: value });
        break;
    }
  };

  const generalAdjustments = [
    { id: 'brightness', label: 'Brightness', icon: Sun, value: settings.brightness, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'contrast', label: 'Contrast', icon: Contrast, value: settings.contrast, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: settings.saturation, min: 0, max: 2, step: 0.01 },
    { id: 'exposure', label: 'Exposure', icon: Aperture, value: settings.exposure, min: -0.5, max: 0.5, step: 0.01 },
    { id: 'highlights', label: 'Highlights', icon: Sparkles, value: settings.highlights, min: -1, max: 1, step: 0.01 },
    { id: 'shadows', label: 'Shadows', icon: Moon, value: settings.shadows, min: -1, max: 1, step: 0.01 },
    { id: 'blacks', label: 'Blacks', icon: Baseline, value: settings.blacks, min: -1, max: 1, step: 0.01 },
  ];

  const renderSlider = (control: any) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          {control.icon && <control.icon className="mr-2 h-4 w-4" />}
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {control.id === 'exposure' ? control.value.toFixed(2) :
           control.id === 'highlights' || control.id === 'shadows' || control.id === 'blacks' ? `${Math.round(control.value * 100)}` :
           control.id === 'saturation' ? `${Math.round(control.value * 100)}%` :
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

  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Adjustments</Label>
      {generalAdjustments.map(control => renderSlider(control))}
    </div>
  );
}
