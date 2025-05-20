"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sun, Contrast, Droplets, Aperture } from 'lucide-react'; // Aperture for Exposure

export function AdjustmentsSection() {
  const { settings, dispatchSettings, originalImage } = useImageEditor();

  const handleSliderChange = (type: 'brightness' | 'contrast' | 'saturation' | 'exposure', value: number) => {
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
    }
  };

  const adjustmentControls = [
    { id: 'brightness', label: 'Brightness', icon: Sun, value: settings.brightness, min: 0, max: 2, step: 0.01 },
    { id: 'contrast', label: 'Contrast', icon: Contrast, value: settings.contrast, min: 0, max: 2, step: 0.01 },
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: settings.saturation, min: 0, max: 2, step: 0.01 },
    { id: 'exposure', label: 'Exposure', icon: Aperture, value: settings.exposure, min: -1, max: 1, step: 0.01 },
  ];

  return (
    <div className="space-y-4">
      <Label className="text-sm font-medium block mb-2">Adjustments</Label>
      {adjustmentControls.map(control => (
        <div key={control.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
              <control.icon className="mr-2 h-4 w-4" />
              {control.label}
            </Label>
            <span className="text-xs text-muted-foreground">
              {control.id === 'exposure' ? control.value.toFixed(2) : `${Math.round(control.value * 100)}%`}
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
          />
        </div>
      ))}
    </div>
  );
}
