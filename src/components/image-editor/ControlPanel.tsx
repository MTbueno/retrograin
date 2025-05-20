
"use client";

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { FileUploadSection } from './FileUploadSection';
import { AdjustmentsSection } from './AdjustmentsSection';
import { TransformsSection } from './TransformsSection';
import { FiltersSection } from './FiltersSection';
import { ActionButtonsSection } from './ActionButtonsSection';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ControlPanel() {
  return (
    <Sidebar side="right" variant="sidebar" collapsible="icon" className="border-l">
      <SidebarHeader className="p-4 border-b">
        <h2 className="text-xl font-semibold text-primary text-center">RetroGrain</h2>
      </SidebarHeader>
      <SidebarContent asChild>
        <ScrollArea className="h-full">
          <SidebarMenu className="p-4 space-y-6">
            <FileUploadSection />
            <SidebarSeparator />
            <AdjustmentsSection />
            <SidebarSeparator />
            <TransformsSection />
            <SidebarSeparator />
            <FiltersSection />
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <ActionButtonsSection />
      </SidebarFooter>
    </Sidebar>
  );
}
