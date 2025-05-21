
"use client";

import { useImageEditor } from '@/contexts/ImageEditorContext'; // Restored
import { Button } from '@/components/ui/button'; // Restored
import { Label } from '@/components/ui/label';
// import { Wand2 } from 'lucide-react'; // Can be added if desired for a general "apply filter" icon

const presetFilters = [ // Restored
  { id: 'grayscale(100%)', name: 'Grayscale' },
  { id: 'sepia(100%)', name: 'Sepia' },
  { id: 'invert(100%)', name: 'Invert' },
];

export function FiltersSection() {
  const { dispatchSettings, settings, originalImage } = useImageEditor(); // Restored

  const applyFilter = (filterId: string | null) => { // Restored
    dispatchSettings({ type: 'APPLY_FILTER', payload: filterId });
    if (originalImage) dispatchSettings({ type: 'LOAD_SETTINGS', payload: {...settings, filter: filterId } });
  };

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Preset Filters</Label>
      <div className="grid grid-cols-2 gap-2"> {/* Restored */}
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
      {settings.filter && ( // Restored
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
      {/* <p className="text-xs text-muted-foreground text-center">
        (Preset filters are temporarily unavailable)
      </p> */}
    </div>
  );
}

    