
"use client";

// import { useImageEditor } from '@/contexts/ImageEditorContext'; // No longer needed
// import { Button } from '@/components/ui/button'; // No longer needed
import { Label } from '@/components/ui/label';
// import { Wand2 } from 'lucide-react'; // No longer needed

// const presetFilters = [ // Removed
//   { id: 'grayscale', name: 'Grayscale' },
//   { id: 'sepia', name: 'Sepia' },
//   { id: 'invert', name: 'Invert' },
// ];

export function FiltersSection() {
  // const { dispatchSettings, settings, originalImage } = useImageEditor(); // No longer needed

  // const applyFilter = (filterId: string | null) => { // Removed
  //   dispatchSettings({ type: 'APPLY_FILTER', payload: filterId });
  // };

  return (
    <div className="space-y-3 w-full max-w-[14rem] mx-auto">
      <Label className="text-sm font-medium block mb-2">Preset Filters</Label>
      {/* <div className="grid grid-cols-2 gap-2"> // Removed
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
      {settings.filter && ( // Removed
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-muted-foreground"
          onClick={() => applyFilter(null)}
          disabled={!originalImage}
        >
          Remove Filter
        </Button>
      )} */}
      <p className="text-xs text-muted-foreground text-center">
        (Preset filters are temporarily unavailable)
      </p>
    </div>
  );
}

    