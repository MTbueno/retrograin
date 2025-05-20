import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AppLayout } from '@/components/layout/AppLayout';
import { PwaRegistry } from '@/components/PwaRegistry';

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
  // It's good practice to also include specific apple-touch-icon links here
  // if you have them, e.g., icons: { apple: '/icons/apple-touch-icon.png' }
};

export const viewport: Viewport = {
  themeColor: '#FFB347', // Corresponds to --primary in globals.css
  // You can also specify different theme colors for light/dark schemes:
  // themeColor: [
  //   { media: '(prefers-color-scheme: light)', color: '#FFB347' },
  //   { media: '(prefers-color-scheme: dark)', color: '#FFB347' },
  // ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      {/* No need to add <link rel="manifest"> or <meta name="theme-color"> here,
          Next.js handles it via the metadata and viewport exports. */}
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppLayout>{children}</AppLayout>
        <PwaRegistry />
      </body>
    </html>
  );
}
