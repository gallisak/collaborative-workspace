import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from '@/app/runtime';
import { serverEnv } from '@/shared/dal';
import '@/app/styles/globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'cyrillic'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin', 'cyrillic'] });

export const metadata: Metadata = {
  metadataBase: new URL(serverEnv.FRONTEND_URL),
  title: { default: 'Collab Docs', template: '%s · Collab Docs' },
  description: 'Collaborative documents with real-time editing',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
