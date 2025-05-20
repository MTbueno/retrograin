
"use client";

import { useImageEditor, type ImageSettings } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RotateCcw, RotateCw, FlipHorizontal, FlipVertical, CropIcon as Crop } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';


export function TransformsSection() {
  const { dispatchSettings, settings, originalImage } = useImageEditor();

  const handleCropChange = (axis: 'x' | 'y' | 'width' | 'height', value: string) => {
    const numValue = parseInt(value, 10);

    let currentX = settings.crop?.x ?? 0;
    let currentY = settings.crop?.y ?? 0;
    let currentWidth = settings.crop?.width ?? (originalImage ? originalImage.naturalWidth : 0);
    let currentHeight = settings.crop?.height ?? (originalImage ? originalImage.naturalHeight : 0);

    if (!settings.crop && originalImage) { // If was null, initialize with full dimensions
        currentWidth = originalImage.naturalWidth;
        currentHeight = originalImage.naturalHeight;
    }

    if (!isNaN(numValue)) {
      if (axis === 'x') currentX = numValue;
      else if (axis === 'y') currentY = numValue;
      else if (axis === 'width') currentWidth = numValue > 0 ? numValue : (originalImage ? originalImage.naturalWidth : 1);
      else if (axis === 'height') currentHeight = numValue > 0 ? numValue : (originalImage ? originalImage.naturalHeight : 1);
    } else {
      // Handle cleared input: reset to default for that axis
      if (axis === 'x') currentX = 0;
      else if (axis === 'y') currentY = 0;
      else if (axis === 'width') currentWidth = originalImage ? originalImage.naturalWidth : 1;
      else if (axis === 'height') currentHeight = originalImage ? originalImage.naturalHeight : 1;
    }
    
    // Ensure width/height are at least 1 if an image exists and crop is being applied
    if (originalImage) {
        currentWidth = Math.max(1, currentWidth);
        currentHeight = Math.max(1, currentHeight);
    }

    dispatchSettings({
      type: 'SET_CROP',
      payload: {
        x: currentX,
        y: currentY,
        width: currentWidth,
        height: currentHeight,
        unit: 'px',
      },
    });
  };
  
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
        <p className="text-xs text-muted-foreground mt-1">Note: Crop values are in pixels. Empty fields reset to defaults.</p>
      </div>
    </div>
  );
}
