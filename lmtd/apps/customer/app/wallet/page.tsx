'use client';

import Link from 'next/link';
import { AppScreen, Header } from '../_components';
import { useLanguage } from '../_language';

export default function Wallet() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  return (
    <AppScreen>
      <Header title="المحفظة" titleEn="Wallet" back="/profile" />
      <div className="content" dir={dir}>
        <h1>{ar ? 'المحفظة والمكافآت' : 'Wallet & rewards'}</h1>
        <div className="emptyState">
          <b>{ar ? 'المحفظة غير مفعلة بعد' : 'Wallet is not enabled yet'}</b>
          <span>{ar ? 'لن نعرض رصيداً أو نقاطاً تجريبية. سيتم ربط الرصيد والمكافآت بسجل حقيقي في السيرفر عند تفعيل هذه الميزة.' : 'We will not show fake balances or points. Wallet and rewards will use a real server ledger when this feature is enabled.'}</span>
        </div>
        <Link className="outlineCta" href="/menu">{ar ? 'ابدأ طلباً جديداً' : 'Start a new order'}</Link>
      </div>
    </AppScreen>
  );
}
