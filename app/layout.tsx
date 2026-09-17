import type { Metadata } from 'next';
import './globals.css';
import { NavigationHeader } from '@/components/NavigationHeader';

export const metadata: Metadata = {
  title: 'NurulQuran — Quran Reading & Memorization',
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
        <NavigationHeader />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
