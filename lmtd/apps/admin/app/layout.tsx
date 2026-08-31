import type { ReactNode } from 'react';
import './globals.css';
import AdminDomCleanup from './AdminDomCleanup';
import OpsQuickLink from './OpsQuickLink';
export const metadata = { title: 'LMTD Operations' };
const mobileEditorFix = `
@media (max-width: 760px) {
  .catalogGrid .editor:has(form) {
    position: fixed !important;
    top: 82px !important;
    right: 12px;
    bottom: 12px;
    left: 12px;
    z-index: 1000;
    height: auto !important;
    max-height: calc(100dvh - 94px);
    overflow-y: auto;
    overscroll-behavior: contain;
    border-radius: 22px;
    box-shadow: 0 0 0 100vmax rgba(0,0,0,.48), 0 24px 70px rgba(0,0,0,.28);
  }
  .catalogGrid .editor:has(form) > h2 {
    position: sticky;
    top: -16px;
    z-index: 2;
    background: #fff;
    padding: 6px 0 14px;
  }
  .catalogGrid .editor:has(form) .formBtns {
    position: sticky;
    bottom: -16px;
    z-index: 2;
    background: #fff;
    padding: 12px 0 6px;
  }
}
`;
export default function RootLayout({children}:{children:ReactNode}){return <html lang="en"><body><style>{mobileEditorFix}</style><AdminDomCleanup/><OpsQuickLink/>{children}</body></html>}
