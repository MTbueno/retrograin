
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, ZoomIn, MoveHorizontal, MoveVertical, RefreshCcw, Move } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';

export function TransformsSection() {
  const { dispatchSettings, settings, originalImage, setIsPreviewing } = useImageEditor();

  const handleTransformSliderChange = (
    type: 'cropZoom' | 'cropOffsetX' | 'cropOffsetY' | 'tiltAngle',
    value: number
  ) => {
    if (!originalImage) return;
    setIsPreviewing(true); // Keep for WebGL re-render on slider change
    if (type === 'cropZoom') {
      dispatchSettings({ type: 'SET_CROP_ZOOM', payload: value });
    } else if (type === 'cropOffsetX') {
      dispatchSettings({ type: 'SET_CROP_OFFSET_X', payload: value });
    } else if (type === 'cropOffsetY') {
      dispatchSettings({ type: 'SET_CROP_OFFSET_Y', payload: value });
    } else if (type === 'tiltAngle') {
      dispatchSettings({ type: 'SET_TILT_ANGLE', payload: value });
    }
  };

  const handleResetTransforms = () => {
    if (!originalImage) return;
    dispatchSettings({ type: 'RESET_CROP_AND_ANGLE' });
    setIsPreviewing(false); // Ensure a full quality re-render after reset
  };
  
  // Placeholder for a more suitable icon if needed
  const TiltIcon = Move; 

  const transformControls = [
    { id: 'tiltAngle', label: 'Inclinação', icon: TiltIcon, value: settings.tiltAngle, min: -45, max: 45, step: 0.1 },
    { id: 'cropZoom', label: 'Zoom', icon: ZoomIn, value: settings.cropZoom, min: 1, max: 5, step: 0.01 }, // Increased max zoom
    { id: 'cropOffsetX', label: 'Offset X', icon: MoveHorizontal, value: settings.cropOffsetX, min: -1, max: 1, step: 0.01, condition: () => (settings.cropZoom * calculateAutoZoomForTilt(settings.tiltAngle) >= 1.01) },
    { id: 'cropOffsetY', label: 'Offset Y', icon: MoveVertical, value: settings.cropOffsetY, min: -1, max: 1, step: 0.01, condition: () => (settings.cropZoom * calculateAutoZoomForTilt(settings.tiltAngle) >= 1.01) },
  ];
  
  // Simplified for condition check, actual autoZoomForTilt depends on viewport aspect ratio in ImageCanvas
  const calculateAutoZoomForTilt = (tiltAngleDeg: number) => {
    if (tiltAngleDeg === 0) return 1.0;
    const radTilt = Math.abs(tiltAngleDeg * Math.PI / 180.0);
    const cosA = Math.cos(radTilt);
    const sinA = Math.sin(radTilt);
    // This is an approximation; the real calculation uses viewport aspect ratio
    return Math.max(cosA + sinA, sinA + cosA); // Simplified for condition
  };


  const renderTransformSlider = (control: any) => {
    if (!control) return null;
    if (control.condition && !control.condition()) return null;

    const currentValue = typeof control.value === 'number' 
      ? control.value 
      : (control.id === 'cropZoom' ? 1 : 0);
    
    const displayText = control.id === 'tiltAngle' ? `${currentValue.toFixed(1)}°` : currentValue.toFixed(2);

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
    <TooltipProvider>
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
              {/* Using ZoomIn as a general icon for this section */}
              <ZoomIn className="mr-2 h-4 w-4 text-muted-foreground" /> 
              <Label className="text-xs text-muted-foreground">Inclinação, Zoom & Pan</Label>
          </div>
          {transformControls.map(control => renderTransformSlider(control))}
          <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleResetTransforms}
              disabled={!originalImage || (settings.cropZoom === 1 && settings.cropOffsetX === 0 && settings.cropOffsetY === 0 && settings.tiltAngle === 0)}
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

    