
"use client";

import React, { useCallback } from 'react';
import { useImageEditor, SELECTIVE_COLOR_TARGETS, type SelectiveColorTarget, type SettingsAction } from '@/contexts/ImageEditorContext';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Palette, Droplets, Sun } from 'lucide-react';
import { throttle } from 'lodash';

const THROTTLE_WAIT = 100; // ms

const colorTargetDisplay: Record<SelectiveColorTarget, { name: string, colorClass: string }> = {
  reds: { name: 'Reds', colorClass: 'bg-red-500' },
  oranges: { name: 'Oranges', colorClass: 'bg-orange-500' },
  yellows: { name: 'Yellows', colorClass: 'bg-yellow-500' },
  greens: { name: 'Greens', colorClass: 'bg-green-500' },
  cyans: { name: 'Cyans', colorClass: 'bg-cyan-500' },
  blues: { name: 'Blues', colorClass: 'bg-blue-500' },
  purples: { name: 'Purples', colorClass: 'bg-purple-500' },
  magentas: { name: 'Magentas', colorClass: 'bg-pink-500' },
};

export function SelectiveColorSection() {
  const { settings, dispatchSettings, originalImage, setIsPreviewing } = useImageEditor();
  const activeTarget = settings.activeSelectiveColorTarget;
  const currentAdjustments = settings.selectiveColors[activeTarget];

  const throttledDispatch = useCallback(
    throttle((action: SettingsAction) => {
      dispatchSettings(action);
    }, THROTTLE_WAIT, { leading: true, trailing: true }),
    [dispatchSettings]
  );

  const handleTargetChange = (target: SelectiveColorTarget) => {
    dispatchSettings({ type: 'SET_ACTIVE_SELECTIVE_COLOR_TARGET', payload: target });
    setIsPreviewing(false); // Ensure preview updates if target changes
  };

  const handleAdjustmentChange = (
    type: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    setIsPreviewing(true);
    throttledDispatch({
      type: 'SET_SELECTIVE_COLOR_ADJUSTMENT',
      payload: {
        target: activeTarget,
        adjustment: { [type]: value },
      },
    });
  };

  const handleAdjustmentCommit = (
    type: 'hue' | 'saturation' | 'luminance',
    value: number
  ) => {
    dispatchSettings({
      type: 'SET_SELECTIVE_COLOR_ADJUSTMENT',
      payload: {
        target: activeTarget,
        adjustment: { [type]: value },
      },
    });
    setIsPreviewing(false);
  };

  const adjustmentControls = [
    { id: 'hue', label: 'Hue', icon: Palette, value: currentAdjustments.hue, min: -0.1, max: 0.1, step: 0.005 }, 
    { id: 'saturation', label: 'Saturation', icon: Droplets, value: currentAdjustments.saturation, min: -0.5, max: 0.5, step: 0.01 },
    { id: 'luminance', label: 'Luminance', icon: Sun, value: currentAdjustments.luminance, min: -0.5, max: 0.5, step: 0.01 },
  ];

  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Selective Color</Label>
      
      <div className="grid grid-cols-4 gap-1 mb-3">
        {SELECTIVE_COLOR_TARGETS.map((target) => (
          <Button
            key={target}
            variant={activeTarget === target ? 'default' : 'outline'}
            size="icon"
            onClick={() => handleTargetChange(target)}
            className={cn(
              "w-7 h-7 rounded-full border-2",
              activeTarget === target ? 'border-primary ring-2 ring-primary' : 'border-input'
            )}
            title={colorTargetDisplay[target].name}
            disabled={!originalImage}
          >
            <div className={cn("w-4 h-4 rounded-full", colorTargetDisplay[target].colorClass)}></div>
          </Button>
        ))}
      </div>

      {adjustmentControls.map(control => (
        <div key={control.id} className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor={`selective-${control.id}`} className="flex items-center text-xs text-muted-foreground">
              {control.icon && <control.icon className="mr-2 h-4 w-4" />}
              {control.label}
            </Label>
            <span className="text-xs text-muted-foreground">
              {control.id === 'hue' 
                ? `${Math.round((currentAdjustments.hue ?? 0) * 180 / (0.1 / 0.5))}°` // Adjusted display for new range
                : `${Math.round((control.value ?? 0) * 100)}%`}
            </span>
          </div>
          <Slider
            id={`selective-${control.id}`}
            min={control.min}
            max={control.max}
            step={control.step}
            value={[control.value ?? 0]}
            onValueChange={(val) => {
              handleAdjustmentChange(control.id as 'hue' | 'saturation' | 'luminance', val[0]);
            }}
            onValueCommit={(val) => {
              handleAdjustmentCommit(control.id as 'hue' | 'saturation' | 'luminance', val[0]);
            }}
            onPointerDown={() => {
              if (originalImage) setIsPreviewing(true);
            }}
            disabled={!originalImage}
          />
        </div>
      ))}
    </div>
  );
}
