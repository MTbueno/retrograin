
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Wand2 } from 'lucide-react';

const presetFilters = [
  { id: 'grayscale', name: 'Grayscale' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'invert', name: 'Invert' },
  // Add more filters here
];

export function FiltersSection() {
  const { dispatchSettings, settings, originalImage } = useImageEditor();

  const applyFilter = (filterId: string | null) => {
    dispatchSettings({ type: 'APPLY_FILTER', payload: filterId });
  };

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Preset Filters</Label>
      <div className="grid grid-cols-2 gap-2">
        {presetFilters.map(filter => (
          <Button
            key={filter.id}
            variant={settings.filter === filter.id ? 'default' : 'outline'}
            onClick={() => applyFilter(filter.id)}
            disabled={!originalImage}
          >
            {filter.name}
          </Button>
        ))}
      </div>
      {settings.filter && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => applyFilter(null)}
          disabled={!originalImage}
        >
          Remove Filter
        </Button>
      )}
    </div>
  );
}
