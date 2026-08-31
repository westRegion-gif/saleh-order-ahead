import type { ReactNode } from 'react';
import './globals.css';
import './language.css';
import { LanguageProvider } from './_language';

export const metadata = { title: 'LMTD Coffee', description: 'LMTD order ahead' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
