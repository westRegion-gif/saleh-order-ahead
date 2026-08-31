'use client';

import Link from 'next/link';
import { useLanguage } from './_language';

const HEADER_EN: Record<string, string> = {
  'الرئيسية': 'Home',
  'المنيو': 'Menu',
  'طلباتي': 'My orders',
  'حسابي': 'My account',
  'المزيد': 'More',
  'السلة': 'Cart',
  'التفاصيل': 'Details',
  'اختيار الاستلام': 'Pickup',
  'بيانات السيارة': 'Vehicle details',
  'الدفع': 'Payment',
  'طلبك': 'Your order',
  'تسجيل الدخول': 'Sign in',
  'التحقق': 'Verification',
  'المفضلة': 'Favorites',
  'المحفظة': 'Wallet',
};

export function Header({ title, back = '/home', cart = false, titleEn }: { title: string; back?: string; cart?: boolean; titleEn?: string }) {
  const { language } = useLanguage();
  const displayTitle = language === 'en' ? (titleEn || HEADER_EN[title] || title) : title;
  return (
    <header className="appHeader">
      <Link href={back} className="iconLink" aria-label={language === 'ar' ? 'رجوع' : 'Back'}>←</Link>
      <b>{displayTitle}</b>
      {cart ? <Link href="/cart" className="iconLink" aria-label={language === 'ar' ? 'السلة' : 'Cart'}>▢</Link> : <span className="iconSpace" />}
    </header>
  );
}

export function BottomNav({ active }: { active: 'home' | 'menu' | 'orders' | 'profile' }) {
  const { language } = useLanguage();
  return (
    <nav className="bottomNav">
      <Link className={active === 'home' ? 'active' : ''} href="/home">{language === 'ar' ? 'الرئيسية' : 'Home'}</Link>
      <Link className={active === 'menu' ? 'active' : ''} href="/menu">{language === 'ar' ? 'المنيو' : 'Menu'}</Link>
      <Link className={active === 'orders' ? 'active' : ''} href="/orders">{language === 'ar' ? 'طلباتي' : 'Orders'}</Link>
      <Link className={active === 'profile' ? 'active' : ''} href="/profile">{language === 'ar' ? 'حسابي' : 'Account'}</Link>
    </nav>
  );
}

export function AppScreen({ children }: { children: React.ReactNode }) {
  const { dir } = useLanguage();
  return <main className="shell"><section className="appScreen" dir={dir}>{children}</section></main>;
}
