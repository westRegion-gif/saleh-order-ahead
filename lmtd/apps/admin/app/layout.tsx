import type { ReactNode } from 'react';
import './globals.css';
import AdminDomCleanup from './AdminDomCleanup';
export const metadata = { title: 'LMTD Operations' };
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body><AdminDomCleanup/>{children}</body></html>}
