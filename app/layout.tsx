import type { Metadata, Viewport } from 'next';
import './globals.css';
import { NavigationHeader } from '@/components/NavigationHeader';
import { ServiceWorkerBootstrap } from '@/components/system/ServiceWorkerBootstrap';
import { Toaster } from '@/components/system/Toaster';
import { AiTutorProvider } from '@/components/ai/tutor-bridge';

// `themeColor` moved out of `Metadata` into a dedicated `viewport` export in Next 14+;
// leaving it in `metadata` triggers a build-time warning and is silently dropped.
export const viewport: Viewport = {
  themeColor: '#059669',
};

export const metadata: Metadata = {
  title: 'NurulQuran — Quran Reading & Memorization',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NurulQuran',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  description: 'Local-first Quran reading and memorization: Tajweed and Arabic lessons, ten memorization modes, spaced repetition, English and Tamil translations, and word morphology.',
  openGraph: {
    title: 'NurulQuran — Quran Reading & Memorization',
    description: 'Local-first Quran reading and memorization: Tajweed and Arabic lessons, ten memorization modes, spaced repetition, English and Tamil translations, and word morphology.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NurulQuran — Quran Reading & Memorization',
    description: 'Local-first Quran reading and memorization: Tajweed and Arabic lessons, ten memorization modes, spaced repetition, English and Tamil translations, and word morphology.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||((!t||t==='system')&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased flex flex-col">
        <AiTutorProvider>
          <ServiceWorkerBootstrap />
          <NavigationHeader />
          <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>
          {/* Mounted once: every save in the app reports through this one stack. */}
          <Toaster />
        </AiTutorProvider>
      </body>
    </html>
  );
}
