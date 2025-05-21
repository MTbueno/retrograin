
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
import { AuthSection } from './AuthSection';
import { ScrollArea } from '@/components/ui/scroll-area';

// Function to generate a timestamp string for versioning
const getVersionTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const APP_VERSION = getVersionTimestamp(); // Generate version on component load for now

export function ControlPanel() {
  return (
    <Sidebar side="right" variant="sidebar" collapsible="none" className="border-l">
      <SidebarHeader className="p-4 border-b">
        <h2 className="text-xl font-semibold text-primary text-center">RetroGrain</h2>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Versão: {APP_VERSION}
        </p>
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
      <SidebarFooter className="p-4 border-t space-y-4">
        <ActionButtonsSection />
        <SidebarSeparator />
        <AuthSection />
      </SidebarFooter>
    </Sidebar>
  );
}
