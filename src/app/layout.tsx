
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';
import { PwaRegistry } from '@/components/PwaRegistry';
import { PwaInstallPrompt } from '@/components/PwaInstallPrompt'; // Import PwaInstallPrompt
import { AuthProvider } from '@/contexts/AuthContext';
import Script from 'next/script'; 

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'RetroGrain',
  description: 'Edit your photos with a retro touch.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RetroGrain',
  },
};

export const viewport: Viewport = {
  themeColor: '#FFB347',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
        <PwaRegistry />
        <PwaInstallPrompt /> {/* Add PwaInstallPrompt here */}
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          async
          defer
        />
      </body>
    </html>
  );
}

    