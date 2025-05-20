
"use client";

import React from 'react';
import { useImageEditor } from '@/contexts/ImageEditorContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { XIcon } from 'lucide-react';
import Image from 'next/image'; // Using next/image for optimized thumbnails
import { cn } from '@/lib/utils';

export function ImageThumbnailSidebar() {
  const { allImages, activeImageId, setActiveImageId, removeImage } = useImageEditor();

  if (allImages.length === 0) {
    return null; // Don't render if no images
  }

  return (
    <aside className="w-24 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      <div className="p-2 text-center border-b border-border">
        <h3 className="text-sm font-semibold text-primary">Images</h3>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {allImages.map((imgObj) => (
            <div key={imgObj.id} className="relative group">
              <Button
                variant="ghost"
                className={cn(
                  "w-full h-20 p-0.5 border-2 rounded-md overflow-hidden",
                  activeImageId === imgObj.id ? "border-primary ring-2 ring-primary" : "border-transparent hover:border-muted-foreground"
                )}
                onClick={() => setActiveImageId(imgObj.id)}
                title={`Edit ${imgObj.baseFileName}`}
              >
                {imgObj.thumbnailDataUrl && (
                  <Image
                    src={imgObj.thumbnailDataUrl}
                    alt={`Thumbnail of ${imgObj.baseFileName}`}
                    width={70} // Adjusted for padding and border
                    height={70}
                    className="object-cover w-full h-full rounded-sm"
                  />
                )}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-0.5 right-0.5 w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering image selection
                  removeImage(imgObj.id);
                }}
                title={`Remove ${imgObj.baseFileName}`}
              >
                <XIcon className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  );
}
