
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, CropIcon as Crop } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';


export function TransformsSection() {
  const { dispatchSettings, settings, originalImage } = useImageEditor();

  const handleCropChange = (axis: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;

    const currentCrop = settings.crop || { x: 0, y: 0, width: 100, height: 100, unit: '%'}; // Default to % for safety, will be px after first input
    dispatchSettings({ type: 'SET_CROP', payload: { ...currentCrop, [axis]: numValue, unit: 'px' } }); // Force unit to px on change
  };
  
  const cropX = settings.crop?.x ?? 0;
  const cropY = settings.crop?.y ?? 0;
  const cropWidth = settings.crop?.width ?? (originalImage ? originalImage.naturalWidth : 100);
  const cropHeight = settings.crop?.height ?? (originalImage ? originalImage.naturalHeight : 100);
  // const cropUnit = settings.crop?.unit ?? 'px'; // Default to px if not set, or could be % - now forced to px

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
      
      <div className="space-y-2 pt-2">
        <div className="flex items-center">
            <Crop className="mr-2 h-4 w-4 text-muted-foreground" />
            <Label htmlFor="cropX" className="text-xs text-muted-foreground">Crop (X, Y, Width, Height - px)</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input id="cropX" type="number" placeholder="X" value={settings.crop?.x ?? ''} onChange={(e) => handleCropChange('x', e.target.value)} disabled={!originalImage} />
          <Input id="cropY" type="number" placeholder="Y" value={settings.crop?.y ?? ''} onChange={(e) => handleCropChange('y', e.target.value)} disabled={!originalImage} />
          <Input id="cropWidth" type="number" placeholder="Width" value={settings.crop?.width ?? ''} onChange={(e) => handleCropChange('width', e.target.value)} disabled={!originalImage} />
          <Input id="cropHeight" type="number" placeholder="Height" value={settings.crop?.height ?? ''} onChange={(e) => handleCropChange('height', e.target.value)} disabled={!originalImage} />
        </div>
        <Button variant="outline" size="sm" className="w-full mt-1" onClick={() => dispatchSettings({ type: 'SET_CROP', payload: null })} disabled={!originalImage || !settings.crop}>
            Remove Crop
        </Button>
        <p className="text-xs text-muted-foreground mt-1">Note: Crop values are in pixels, based on original image dimensions. Empty fields mean no crop or use full dimension.</p>
      </div>
    </div>
  );
}
