
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider'; 
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, CropIcon as Crop, ZoomIn, MoveHorizontal, MoveVertical, RefreshCcw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

export function TransformsSection() {
  const { dispatchSettings, settings, originalImage, setIsPreviewing } = useImageEditor();

  const handleTransformSliderChange = (
    type: 'cropZoom' | 'cropOffsetX' | 'cropOffsetY',
    value: number
  ) => {
    if (!originalImage) return;
    setIsPreviewing(true);
    if (type === 'cropZoom') {
      dispatchSettings({ type: 'SET_CROP_ZOOM', payload: value });
    } else if (type === 'cropOffsetX') {
      dispatchSettings({ type: 'SET_CROP_OFFSET_X', payload: value });
    } else if (type === 'cropOffsetY') {
      dispatchSettings({ type: 'SET_CROP_OFFSET_Y', payload: value });
    }
  };

  const handleResetCropAndAngle = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_CROP_AND_ANGLE' });
    setIsPreviewing(false);
  };

  const transformControls = [
    { id: 'cropZoom', label: 'Zoom', icon: ZoomIn, value: settings.cropZoom, min: 1, max: 4, step: 0.01 },
    { id: 'cropOffsetX', label: 'Offset X', icon: MoveHorizontal, value: settings.cropOffsetX, min: -1, max: 1, step: 0.01, condition: () => settings.cropZoom >= 1.01 },
    { id: 'cropOffsetY', label: 'Offset Y', icon: MoveVertical, value: settings.cropOffsetY, min: -1, max: 1, step: 0.01, condition: () => settings.cropZoom >= 1.01 },
  ];

  const renderTransformSlider = (control: any) => {
    if (!control) {
      return null;
    }
    if (control.condition && !control.condition()) {
      return null;
    }

    const currentValue = typeof control.value === 'number' 
      ? control.value 
      : (control.id === 'cropZoom' ? 1 : 0);

    const displayText = currentValue.toFixed(2);
    
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
  }
  
  return (
    <div className="space-y-4 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Transforms</Label>
      <div className="grid grid-cols-4 gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => dispatchSettings({ type: 'ROTATE_CCW' })} disabled={!originalImage}>
              <RotateCcw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Rotate Left</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => dispatchSettings({ type: 'ROTATE_CW' })} disabled={!originalImage}>
              <RotateCw />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Rotate Right</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => dispatchSettings({ type: 'FLIP_HORIZONTAL' })} disabled={!originalImage}>
              <FlipHorizontal />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Flip Horizontal</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" onClick={() => dispatchSettings({ type: 'FLIP_VERTICAL' })} disabled={!originalImage}>
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
            <Crop className="mr-2 h-4 w-4 text-muted-foreground" />
            <Label className="text-xs text-muted-foreground">Zoom & Pan</Label>
        </div>
        {transformControls.map(control => renderTransformSlider(control))}
        <Button 
            variant="outline" 
            size="sm" 
            className="w-full mt-2" 
            onClick={handleResetCropAndAngle} 
            disabled={!originalImage || (settings.cropZoom === 1 && settings.cropOffsetX === 0 && settings.cropOffsetY === 0)}
        >
            <RefreshCcw className="mr-2 h-3 w-3" />
            Reset Crop
        </Button>
        <p className="text-xs text-muted-foreground mt-1">Crop maintains original aspect ratio.</p>
      </div>
    </div>
  );
}
