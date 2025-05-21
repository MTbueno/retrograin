
"use client";
import React, { useState } from 'react';
import { ImageEditorProvider } from '@/contexts/ImageEditorContext';
import { ImageCanvas } from '@/components/image-editor/ImageCanvas';
import { ControlPanel } from '@/components/image-editor/ControlPanel';
import { ImageThumbnailSidebar } from '@/components/image-editor/ImageThumbnailSidebar';
import { SidebarInset } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelLeftClose } from 'lucide-react';

export default function RetroGrainPage() {
  const [isThumbnailSidebarVisible, setIsThumbnailSidebarVisible] = useState(true);

  return (
    <ImageEditorProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        {/* SidebarInset should act as a flex-row container for its direct child */}
        <SidebarInset className="flex flex-1 overflow-hidden"> 
          {/* This div is the direct child that will manage the horizontal layout of thumbnail sidebar and canvas area */}
          <div className="flex flex-1 h-full"> {/* Wrapper for thumbnail sidebar and canvas area */}
            {isThumbnailSidebarVisible && <ImageThumbnailSidebar />}
            
            <div className="relative flex-1 flex flex-col items-center justify-center p-4 bg-background"> {/* Canvas area - removed overflow-auto */}
              <div className="absolute top-4 left-4 z-10">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsThumbnailSidebarVisible(!isThumbnailSidebarVisible)}
                  title={isThumbnailSidebarVisible ? "Hide Thumbnails" : "Show Thumbnails"}
                >
                  {isThumbnailSidebarVisible ? <PanelLeftClose /> : <PanelLeftOpen />}
                </Button>
              </div>

              {/* Removed the SidebarTrigger for the right control panel */}

              <div className="flex items-center justify-center w-full h-full">
                <ImageCanvas />
              </div>
            </div>
          </div>
        </SidebarInset>
        <ControlPanel />
      </div>
    </ImageEditorProvider>
  );
}
