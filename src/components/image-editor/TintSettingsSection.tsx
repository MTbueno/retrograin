
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Paintbrush, Droplets } from 'lucide-react';
import { ColorSpectrumSlider } from '@/components/ui/color-spectrum-slider';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';

export function TintSettingsSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();

  const handleIntensitySliderChange = (
    type: 'tintShadowsIntensity' | 'tintHighlightsIntensity',
    value: number
  ) => {
    if (originalImage) setIsPreviewing(true);
    if (type === 'tintShadowsIntensity') {
      dispatchSettings({ type: 'SET_TINT_SHADOWS_INTENSITY', payload: value });
    } else if (type === 'tintHighlightsIntensity') {
      dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_INTENSITY', payload: value });
    }
  };

  const handleSaturationSliderChange = (
    type: 'tintShadowsSaturation' | 'tintHighlightsSaturation',
    value: number
  ) => {
    if (originalImage) setIsPreviewing(true);
    if (type === 'tintShadowsSaturation') {
      dispatchSettings({ type: 'SET_TINT_SHADOWS_SATURATION', payload: value });
    } else if (type === 'tintHighlightsSaturation') {
      dispatchSettings({ type: 'SET_TINT_HIGHLIGHTS_SATURATION', payload: value });
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
  
  const renderIntensitySlider = (control: any) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          {control.icon && <control.icon className="mr-2 h-4 w-4" />}
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {`${Math.round(control.value * 100)}%`}
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
          handleIntensitySliderChange(control.id as any, val[0]);
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
  
  const renderSaturationSlider = (control: any) => (
    <div key={control.id} className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
          {control.icon && <control.icon className="mr-2 h-4 w-4" />}
          {control.label}
        </Label>
        <span className="text-xs text-muted-foreground">
          {`${Math.round(control.value * 100)}%`}
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
          handleSaturationSliderChange(control.id as any, val[0]);
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
      {renderIntensitySlider({
        id: intensityControlId,
        label: `${label} Tint`,
        icon: Paintbrush, 
        value: intensityValue,
        min: 0, max: 0.5, step: 0.01
      })}

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
          {renderSaturationSlider({
            id: saturationControlId,
            label: `Saturation`,
            icon: Droplets,
            value: saturationValue,
            min: 0, max: 1, step: 0.01
          })}
        </div>
      )}
    </div>
    );
  };

  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Tint</Label>
      {renderTintControlGroup('shadows', 'Shadows', settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation)}
      {renderTintControlGroup('highlights', 'Highlights', settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation)}
    </div>
  );
}
