
"use client";

import React, { useCallback } from 'react';
import { useImageEditor, type SettingsAction } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Sun, Contrast, Droplets, Aperture, Palette, CircleDot, Film, Thermometer, Paintbrush, Sparkles, Moon, Baseline, Brush, Maximize2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { ColorSpectrumSlider } from '@/components/ui/color-spectrum-slider';
import { hexToRgb, desaturateRgb, rgbToHex } from '@/lib/colorUtils';
import { throttle } from 'lodash';

const THROTTLE_WAIT = 100; // ms

export function AdjustmentsSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();

  const throttledDispatch = useCallback(
    throttle((action: SettingsAction) => {
      dispatchSettings(action);
    }, THROTTLE_WAIT, { leading: true, trailing: true }),
    [dispatchSettings]
  );

  const handleSliderChange = (
    type: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'exposure' | 
          'highlights' | 'shadows' | 'whites' | 'blacks' | 
          'hueRotate' | 
          'vignetteIntensity' | 'grainIntensity' |
          'colorTemperature' | 
          'tintShadowsIntensity' | 'tintShadowsSaturation' |
          'tintHighlightsIntensity' | 'tintHighlightsSaturation' | 'sharpness',
    value: number
  ) => {
    setIsPreviewing(true);
    let action: SettingsAction | null = null;
    switch (type) {
      case 'brightness': action = { type: 'SET_BRIGHTNESS', payload: value }; break;
      case 'contrast': action = { type: 'SET_CONTRAST', payload: value }; break;
      case 'saturation': action = { type: 'SET_SATURATION', payload: value }; break;
      case 'vibrance': action = { type: 'SET_VIBRANCE', payload: value }; break;
      case 'exposure': action = { type: 'SET_EXPOSURE', payload: value }; break;
      case 'highlights': action = { type: 'SET_HIGHLIGHTS', payload: value }; break;
      case 'shadows': action = { type: 'SET_SHADOWS', payload: value }; break;
      case 'whites': action = { type: 'SET_WHITES', payload: value }; break;
      case 'blacks': action = { type: 'SET_BLACKS', payload: value }; break;
      case 'hueRotate': action = { type: 'SET_HUE_ROTATE', payload: value }; break;
      case 'vignetteIntensity': action = { type: 'SET_VIGNETTE_INTENSITY', payload: value }; break;
      case 'grainIntensity': action = { type: 'SET_GRAIN_INTENSITY', payload: value }; break;
      case 'sharpness': action = { type: 'SET_SHARPNESS', payload: value }; break;
      case 'colorTemperature': action = { type: 'SET_COLOR_TEMPERATURE', payload: value }; break;
      case 'tintShadowsIntensity': action = { type: 'SET_TINT_SHADOWS_INTENSITY', payload: value }; break;
      case 'tintShadowsSaturation': action = { type: 'SET_TINT_SHADOWS_SATURATION', payload: value }; break;
      case 'tintHighlightsIntensity': action = { type: 'SET_TINT_HIGHLIGHTS_INTENSITY', payload: value }; break;
      case 'tintHighlightsSaturation': action = { type: 'SET_TINT_HIGHLIGHTS_SATURATION', payload: value }; break;
    }
    if (action) {
      throttledDispatch(action);
    }
  };

  const handleSliderCommit = (
    type: 'brightness' | 'contrast' | 'saturation' | 'vibrance' | 'exposure' |
          'highlights' | 'shadows' | 'whites' | 'blacks' |
          'hueRotate' |
          'vignetteIntensity' | 'grainIntensity' |
          'colorTemperature' |
          'tintShadowsIntensity' | 'tintShadowsSaturation' |
          'tintHighlightsIntensity' | 'tintHighlightsSaturation' | 'sharpness',
    value: number
  ) => {
    let action: SettingsAction | null = null;
    switch (type) {
      case 'brightness': action = { type: 'SET_BRIGHTNESS', payload: value }; break;
      case 'contrast': action = { type: 'SET_CONTRAST', payload: value }; break;
      case 'saturation': action = { type: 'SET_SATURATION', payload: value }; break;
      case 'vibrance': action = { type: 'SET_VIBRANCE', payload: value }; break;
      case 'exposure': action = { type: 'SET_EXPOSURE', payload: value }; break;
      case 'highlights': action = { type: 'SET_HIGHLIGHTS', payload: value }; break;
      case 'shadows': action = { type: 'SET_SHADOWS', payload: value }; break;
      case 'whites': action = { type: 'SET_WHITES', payload: value }; break;
      case 'blacks': action = { type: 'SET_BLACKS', payload: value }; break;
      case 'hueRotate': action = { type: 'SET_HUE_ROTATE', payload: value }; break;
      case 'vignetteIntensity': action = { type: 'SET_VIGNETTE_INTENSITY', payload: value }; break;
      case 'grainIntensity': action = { type: 'SET_GRAIN_INTENSITY', payload: value }; break;
      case 'sharpness': action = { type: 'SET_SHARPNESS', payload: value }; break;
      case 'colorTemperature': action = { type: 'SET_COLOR_TEMPERATURE', payload: value }; break;
      case 'tintShadowsIntensity': action = { type: 'SET_TINT_SHADOWS_INTENSITY', payload: value }; break;
      case 'tintShadowsSaturation': action = { type: 'SET_TINT_SHADOWS_SATURATION', payload: value }; break;
      case 'tintHighlightsIntensity': action = { type: 'SET_TINT_HIGHLIGHTS_INTENSITY', payload: value }; break;
      case 'tintHighlightsSaturation': action = { type: 'SET_TINT_HIGHLIGHTS_SATURATION', payload: value }; break;
    }
    if (action) {
      dispatchSettings(action); // Direct dispatch for final value
    }
    setIsPreviewing(false);
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
    setIsPreviewing(false); // Update preview after color change
  };

  const basicAdjustmentControls = [
    { id: 'brightness', label: 'Brightness', icon: Sun, value: settings.brightness, min: 0.75, max: 1.25, step: 0.01 },
    { id: 'contrast', label: 'Contrast', icon: Contrast, value: settings.contrast, min: 0.75, max: 1.25, step: 0.01 },
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: settings.saturation, min: 0.5, max: 1.5, step: 0.01 },
    { id: 'vibrance', label: 'Vibrance', icon: Brush, value: settings.vibrance, min: -1, max: 1, step: 0.01 },
    { id: 'exposure', label: 'Exposure', icon: Aperture, value: settings.exposure, min: -0.5, max: 0.5, step: 0.01 },
    { id: 'highlights', label: 'Highlights', icon: Sparkles, value: settings.highlights, min: -1, max: 1, step: 0.01 },
    { id: 'shadows', label: 'Shadows', icon: Moon, value: settings.shadows, min: -1, max: 1, step: 0.01 },
    { id: 'whites', label: 'Whites', icon: Sparkles, value: settings.whites, min: -1, max: 1, step: 0.01 }, 
    { id: 'blacks', label: 'Blacks', icon: Baseline, value: settings.blacks, min: -1, max: 1, step: 0.01 },
  ];

  const colorSettingControls = [
    { id: 'hueRotate', label: 'Hue Rotate', icon: Palette, value: settings.hueRotate, min: -180, max: 180, step: 1 }, 
    { id: 'colorTemperature', label: 'Temperature', icon: Thermometer, value: settings.colorTemperature, min: -100, max: 100, step: 1 },
  ];

  const effectSettingControls = [
    { id: 'sharpness', label: 'Sharpness', icon: Maximize2, value: settings.sharpness, min: 0, max: 1, step: 0.01 },
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
          {control.id === 'exposure' || control.id === 'brightness' || control.id === 'contrast' ? (control.value ?? (control.id === 'brightness' || control.id === 'contrast' ? 1 : 0)).toFixed(2) :
           control.id === 'hueRotate' ? `${Math.round(control.value ?? 0)}°` : 
           ['highlights', 'shadows', 'whites', 'blacks', 'vibrance'].includes(control.id) ? `${Math.round((control.value ?? 0) * 100)}` :
           isIntensitySlider || control.id.includes('Intensity') || isSaturationSlider || ['saturation', 'vignetteIntensity', 'grainIntensity', 'sharpness'].includes(control.id) ? `${Math.round((control.value ?? 0) * 100)}%` :
           control.id === 'colorTemperature' ? `${Math.round(control.value ?? 0)}` :
           `${Math.round((control.value ?? 0) * 100)}%`} 
        </span>
      </div>
      <Slider
        id={control.id}
        min={control.min}
        max={control.max}
        step={control.step}
        value={[control.value ?? (control.id === 'brightness' || control.id === 'contrast' || control.id === 'saturation' || control.id.includes('Saturation') ? 1 : (control.id === 'vibrance' || control.id === 'exposure' || control.id === 'highlights' || control.id === 'shadows' || control.id === 'whites' || control.id === 'blacks' || control.id === 'sharpness' || control.id === 'hueRotate' || control.id === 'colorTemperature' || control.id.includes('Intensity') ? 0 : 1) )]}
        onValueChange={(val) => {
          handleSliderChange(control.id as any, val[0]);
        }}
        onValueCommit={(val) => {
          handleSliderCommit(control.id as any, val[0]);
        }}
        onPointerDown={() => {
          if (originalImage) setIsPreviewing(true);
        }}
        disabled={!originalImage}
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
        min: 0, max: 0.25, step: 0.01 
      }, true)}

      {(intensityValue ?? 0) > 0 && ( 
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
      <div>
        <Label className="text-sm font-medium block mb-2">Adjustments</Label>
        {basicAdjustmentControls.map(control => renderSlider(control))}
      </div>

      <Separator className="my-4" />
      
      <div>
        <Label className="text-sm font-medium block">Colors</Label>
        {colorSettingControls.map(control => renderSlider(control))}
      </div>
      
      <Separator className="my-4" />

      <div>
        <Label className="text-sm font-medium block">Tint</Label>
        {renderTintControlGroup('shadows', 'Shadows', settings.tintShadowsColor, settings.tintShadowsIntensity, settings.tintShadowsSaturation)}
        {renderTintControlGroup('highlights', 'Highlights', settings.tintHighlightsColor, settings.tintHighlightsIntensity, settings.tintHighlightsSaturation)}
      </div>

      <Separator className="my-4" />

      <div>
        <Label className="text-sm font-medium block">Effects</Label>
        {effectSettingControls.map(control => renderSlider(control))}
      </div>
    </div>
  );
}
