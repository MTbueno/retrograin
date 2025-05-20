
"use client";
import React from 'react';
import { ImageEditorProvider } from '@/contexts/ImageEditorContext';
import { ImageCanvas } from '@/components/image-editor/ImageCanvas';
import { ControlPanel } from '@/components/image-editor/ControlPanel';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { PanelRightOpen } from 'lucide-react';

export default function RetroGrainPage() {
  // canvasRef is now managed by ImageEditorProvider
  return (
    <ImageEditorProvider>
      <div className="flex h-screen w-screen overflow-hidden">
        <SidebarInset className="flex-1 flex flex-col items-center justify-center p-4 bg-background relative">
          <div className="absolute top-4 left-4 z-10 md:hidden">
             {/* Mobile sidebar trigger, if needed, or rely on default sidebar behavior */}
          </div>
          <div className="absolute top-4 right-4 z-10">
            <SidebarTrigger asChild>
              <Button variant="ghost" size="icon">
                <PanelRightOpen />
                <span className="sr-only">Toggle Sidebar</span>
              </Button>
            </SidebarTrigger>
          </div>
          <div className="flex items-center justify-center w-full h-full">
            {/* ImageCanvas no longer needs canvasRef prop */}
            <ImageCanvas />
          </div>
        </SidebarInset>
        <ControlPanel />
      </div>
    </ImageEditorProvider>
  );
}
