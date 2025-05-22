
"use client";

import React, { useCallback } from 'react';
import { useImageEditor, type SettingsAction } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, ZoomIn, MoveHorizontal, MoveVertical, RefreshCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import { throttle } from 'lodash';

const THROTTLE_WAIT = 100; // ms

export function TransformsSection() {
  const { dispatchSettings, settings, originalImage, setIsPreviewing } = useImageEditor();

  const throttledDispatch = useCallback(
    throttle((action: SettingsAction) => {
      dispatchSettings(action);
    }, THROTTLE_WAIT, { leading: true, trailing: true }),
    [dispatchSettings]
  );

  const handleTransformSliderChange = (
    type: 'cropZoom' | 'cropOffsetX' | 'cropOffsetY',
    value: number
  ) => {
    if (!originalImage) return;
    if (setIsPreviewing) setIsPreviewing(true); 
    let action: SettingsAction | null = null;
    if (type === 'cropZoom') {
      action = { type: 'SET_CROP_ZOOM', payload: value };
    } else if (type === 'cropOffsetX') {
      action = { type: 'SET_CROP_OFFSET_X', payload: value };
    } else if (type === 'cropOffsetY') {
      action = { type: 'SET_CROP_OFFSET_Y', payload: value };
    }
    if (action) {
      throttledDispatch(action);
    }
  };

  const handleTransformSliderCommit = (
    type: 'cropZoom' | 'cropOffsetX' | 'cropOffsetY',
    value: number
  ) => {
    if (!originalImage) return;
    let action: SettingsAction | null = null;
    if (type === 'cropZoom') {
      action = { type: 'SET_CROP_ZOOM', payload: value };
    } else if (type === 'cropOffsetX') {
      action = { type: 'SET_CROP_OFFSET_X', payload: value };
    } else if (type === 'cropOffsetY') {
      action = { type: 'SET_CROP_OFFSET_Y', payload: value };
    }
    if (action) {
      dispatchSettings(action); 
    }
    if (setIsPreviewing) setIsPreviewing(false);
  };

  const handleTransformButtonClick = (actionType: 'ROTATE_CW' | 'ROTATE_CCW' | 'FLIP_HORIZONTAL' | 'FLIP_VERTICAL') => {
    if (!originalImage) return;
    dispatchSettings({ type: actionType });
    if (setIsPreviewing) setIsPreviewing(false);
  };

  const handleResetTransforms = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_CROP_AND_TRANSFORMS' });
    if (setIsPreviewing) setIsPreviewing(false); 
  };
  
  const transformControls = [
    { id: 'cropZoom', label: 'Zoom', icon: ZoomIn, value: settings.cropZoom, min: 1, max: 5, step: 0.01 },
    { id: 'cropOffsetX', label: 'Offset X', icon: MoveHorizontal, value: settings.cropOffsetX, min: -1, max: 1, step: 0.01, condition: () => (settings.cropZoom >= 1.01) },
    { id: 'cropOffsetY', label: 'Offset Y', icon: MoveVertical, value: settings.cropOffsetY, min: -1, max: 1, step: 0.01, condition: () => (settings.cropZoom >= 1.01) },
  ];
  
  const renderTransformSlider = (control: any) => {
    if (!control) return null;
    if (control.condition && !control.condition()) return null;

    const currentValue = typeof control.value === 'number' 
      ? control.value 
      : (control.id === 'cropZoom' ? 1 : 0);
    
    const displayText = (currentValue ?? 0).toFixed(2);

    return (
      <div key={control.id} className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={control.id} className="flex items-center text-xs text-muted-foreground">
            {control.icon && <control.icon className="mr-2 h-4 w-4" />}
            {control.label}
          </Label>
          <span className="text-xs text-muted-foreground">
            {displayText}
          </span>
        </div>
        <Slider
          id={control.id}
          min={control.min}
          max={control.max}
          step={control.step}
          value={[currentValue]}
          onValueChange={(val) => handleTransformSliderChange(control.id as any, val[0])}
          onValueCommit={(val) => handleTransformSliderCommit(control.id as any, val[0])}
          onPointerDown={() => {
            if (!originalImage) return;
            if (setIsPreviewing) setIsPreviewing(true);
          }}
          disabled={!originalImage}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4 w-full max-w-[14rem] mx-auto">
        <Label className="text-sm font-medium block mb-2">Transforms</Label>
        <div className="grid grid-cols-4 gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => handleTransformButtonClick('ROTATE_CCW')} disabled={!originalImage}>
                <RotateCcw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rotate Left</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => handleTransformButtonClick('ROTATE_CW')} disabled={!originalImage}>
                <RotateCw />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rotate Right</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => handleTransformButtonClick('FLIP_HORIZONTAL')} disabled={!originalImage}>
                <FlipHorizontal />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Flip Horizontal</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => handleTransformButtonClick('FLIP_VERTICAL')} disabled={!originalImage}>
                <FlipVertical />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Flip Vertical</p>
            </TooltipContent>
          </Tooltip>
        </div>

        <Separator className="my-3" />

        <div className="space-y-3">
          <div className="flex items-center">
              <ZoomIn className="mr-2 h-4 w-4 text-muted-foreground" /> 
              <Label className="text-xs text-muted-foreground">Zoom & Pan</Label>
          </div>
          {transformControls.map(control => renderTransformSlider(control))}
          <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleResetTransforms}
              disabled={!originalImage || (settings.cropZoom === 1 && settings.cropOffsetX === 0 && settings.cropOffsetY === 0 && settings.rotation === 0 && settings.scaleX === 1 && settings.scaleY === 1)}
          >
              <RefreshCcw className="mr-2 h-3 w-3" />
              Resetar Transformações
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Crop mantém proporção original.</p>
        </div>
      </div>
    </TooltipProvider>
  );
}
