'use client';

import Link from 'next/link';
import { LanguageToggle, useLanguage } from './_language';

export default function LaunchPage() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';

  return (
    <main className="shell">
      <section className="launch approved-launch" dir={dir}>
        <div className="launchLanguage"><LanguageToggle compact /></div>
        <div className="launchBrand">LMTD COFFEE</div>
        <div className="launchVisualWrap">
          <div className="launchGlow" />
          <img
            className="launchCup"
            src="https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/spanish-latte-cold.png"
            alt="LMTD iced Spanish latte"
          />
        </div>
        <div className="launchContent approved-launch-content">
          <div>
            <h1>{ar ? 'قهوتك، جاهزة قبل وصولك.' : 'Your coffee, ready before you arrive.'}</h1>
            <p className="launchCopy">{ar ? 'اختر الفرع، اطلب مسبقاً، واستلم طلبك بدون انتظار.' : 'Choose a branch, order ahead, and pick up without waiting.'}</p>
          </div>
          <div className="launchActions">
            <Link className="primary launchPrimary" href="/branches">{ar ? 'ابدأ الطلب' : 'Start order'}</Link>
            <Link className="secondary launchSecondary" href="/login">{ar ? 'تسجيل الدخول / إنشاء حساب' : 'Sign in / Create account'}</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
