'use client';

import Link from 'next/link';
import { AppScreen, Header } from '../_components';
import { LanguageToggle, useLanguage } from '../_language';

const rowStyle = { minHeight: 58, padding: '0 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee7df', gap: 12 } as const;

export default function More() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';

  return (
    <AppScreen>
      <Header title="المزيد" titleEn="More" back="/home" />
      <div className="content" dir={dir}>
        <h1>{ar ? 'المزيد' : 'More'}</h1>
        <div className="accountList">
          <Link href="/branches"><span>{ar ? 'تغيير الفرع' : 'Change branch'}</span><b>←</b></Link>
          <Link href="/profile"><span>{ar ? 'الملف الشخصي' : 'Profile'}</span><b>←</b></Link>
          <Link href="/favorites"><span>{ar ? 'المفضلة' : 'Favorites'}</span><b>←</b></Link>
          <Link href="/wallet"><span>{ar ? 'المحفظة والمكافآت' : 'Wallet & rewards'}</span><b>←</b></Link>
          <div style={rowStyle}><span>{ar ? 'اللغة' : 'Language'}</span><LanguageToggle /></div>
          <div style={{ ...rowStyle, borderBottom: 0 }}><span>{ar ? 'الإشعارات' : 'Notifications'}</span><b>{ar ? 'تُفعل بعد تسجيل الدخول' : 'Available after sign in'}</b></div>
        </div>
        <p className="version">LMTD COFFEE · UAE</p>
      </div>
    </AppScreen>
  );
}
