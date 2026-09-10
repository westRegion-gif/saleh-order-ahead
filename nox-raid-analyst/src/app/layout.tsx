import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NOX Raid Analyst',
  description:
    'Evidence-based Warcraft Logs raid coaching for guild leadership. From the pull to the player.',
};

export const viewport: Viewport = {
  themeColor: '#08080b',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
