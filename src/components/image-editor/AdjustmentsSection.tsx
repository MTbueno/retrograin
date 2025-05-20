
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sun, Contrast, Droplets, Aperture, Palette, CircleDot, Film, Thermometer, Paintbrush } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const PRESET_TINT_COLORS = [
  '#FFB347', // Orange (Accent)
  '#FFD700', // Gold
  '#FFA07A', // LightSalmon
  '#E0FFFF', // LightCyan (Cool)
  '#ADD8E6', // LightBlue (Cool)
  '#FFC0CB', // Pink
  '#D8BFD8', // Thistle (Muted Purple)
  '#A9A9A9', // DarkGray
  '#778899', // LightSlateGray
  '#FFFFFF', // White
  '#000000', // Black
  '#800000', // Maroon
  '#008000', // Green
  '#000080', // Navy
  '#4B0082', // Indigo
];


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
    // Basic hex color validation
    const isValidHex = /^#[0-9A-F]{6}$/i.test(color) || /^#[0-9A-F]{3}$/i.test(color);
    if (!isValidHex && color !== '') { // Allow empty string to clear
        // Potentially show a toast message for invalid hex
        console.warn("Invalid hex color:", color);
        return;
    }

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

  const renderTintControlPopover = (
    tonalRange: 'shadows' | 'midtones' | 'highlights',
    label: string,
    colorValue: string,
    intensityValue: number
  ) => (
    <div key={tonalRange} className="space-y-3">
      {renderSlider({
        id: `tint${tonalRange.charAt(0).toUpperCase() + tonalRange.slice(1)}Intensity` as any,
        label: `${label} Tint`,
        icon: Paintbrush, 
        value: intensityValue,
        min: 0, max: 1, step: 0.01
      }, true)}

      {intensityValue > 0 && (
        <div className="flex items-center space-x-2">
          <Label htmlFor={`tint${tonalRange}ColorTrigger`} className="text-xs text-muted-foreground shrink-0">
            Color:
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id={`tint${tonalRange}ColorTrigger`}
                variant="outline"
                size="icon"
                className="h-6 w-6 p-0 border-input rounded-sm shrink-0"
                style={{ backgroundColor: colorValue || 'transparent' }}
                aria-label={`Select ${label} tint color`}
                disabled={!originalImage}
              />
            </PopoverTrigger>
            <PopoverContent 
              className="p-2 w-56 bg-popover/90 backdrop-blur-sm border-popover-foreground/30 shadow-xl rounded-md"
              side="bottom"
              align="center" 
            >
              <div className="space-y-3">
                <div>
                  <Label htmlFor={`tint${tonalRange}HexInput`} className="text-xs text-popover-foreground font-medium">
                    Hex Color
                  </Label>
                  <Input
                    id={`tint${tonalRange}HexInput`}
                    className="h-8 mt-1 bg-background/70 text-foreground placeholder:text-muted-foreground focus:ring-ring"
                    value={colorValue}
                    onChange={(e) => handleTintColorChange(tonalRange, e.target.value)}
                    placeholder="#RRGGBB"
                    disabled={!originalImage}
                  />
                </div>
                <div>
                    <Label className="text-xs text-popover-foreground font-medium mb-1 block">
                        Preset Colors
                    </Label>
                    <div className="grid grid-cols-5 gap-1.5">
                    {PRESET_TINT_COLORS.map((preset) => (
                        <Button
                        key={preset}
                        className="h-7 w-7 p-0 rounded-sm border border-border hover:opacity-80"
                        style={{ backgroundColor: preset }}
                        onClick={() => handleTintColorChange(tonalRange, preset)}
                        aria-label={`Select color ${preset}`}
                        disabled={!originalImage}
                        />
                    ))}
                    </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
      {renderTintControlPopover('shadows', 'Shadows', settings.tintShadowsColor, settings.tintShadowsIntensity)}
      {renderTintControlPopover('midtones', 'Midtones', settings.tintMidtonesColor, settings.tintMidtonesIntensity)}
      {renderTintControlPopover('highlights', 'Highlights', settings.tintHighlightsColor, settings.tintHighlightsIntensity)}

      <Separator className="my-4" />
      <Label className="text-sm font-medium block">Effects</Label>
      {effectAdjustments.map(control => renderSlider(control))}
    </div>
  );
}
