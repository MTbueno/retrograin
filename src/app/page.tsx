
"use client";
import React from 'react';
import { ImageEditorProvider } from '@/contexts/ImageEditorContext';
import { ImageCanvas } from '@/components/image-editor/ImageCanvas';
import { ControlPanel } from '@/components/image-editor/ControlPanel';
import { ImageThumbnailSidebar } from '@/components/image-editor/ImageThumbnailSidebar'; // Import new sidebar
import { SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';

export default function RetroGrainPage() {
  const { isMobile, openMobile, setOpenMobile } = useSidebar(); // Get sidebar state for mobile

  return (
    <ImageEditorProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <ImageThumbnailSidebar /> {/* Add the new thumbnail sidebar here */}
        
        <SidebarInset className="flex-1 flex flex-col items-center justify-center p-4 bg-background relative">
          {isMobile && ( // Show mobile trigger for main canvas area if needed
             <div className="absolute top-4 left-4 z-10 md:hidden">
               {/* This trigger is for the main content if it were collapsible on mobile,
                   but ImageThumbnailSidebar is always visible.
                   The ControlPanel (right sidebar) has its own trigger below. */}
            </div>
          )}
          <div className="absolute top-4 right-4 z-10">
            <SidebarTrigger asChild> 
              <Button variant="ghost" size="icon">
                <PanelRightOpen />
                <span className="sr-only">Toggle Controls</span>
              </Button>
            </SidebarTrigger>
          </div>
          <div className="flex items-center justify-center w-full h-full">
            <ImageCanvas />
          </div>
        </SidebarInset>
        <ControlPanel />
      </div>
    </ImageEditorProvider>
  );
}
