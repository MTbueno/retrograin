
import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';
import { PwaRegistry } from '@/components/PwaRegistry';
import { AuthProvider } from '@/contexts/AuthContext';
import Script from 'next/script'; // Import Next.js Script component

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
        {/* Google API client library script for gapi (Drive API operations) */}
        <Script src="https://apis.google.com/js/api.js" strategy="afterInteractive" />
        {/* Google Identity Services (GIS) client script for OAuth2 tokens */}
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
