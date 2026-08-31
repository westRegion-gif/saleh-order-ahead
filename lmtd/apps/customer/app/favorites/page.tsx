'use client';

import Link from 'next/link';
import { AppScreen, Header } from '../_components';
import { useLanguage } from '../_language';

export default function Favorites() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  return (
    <AppScreen>
      <Header title="المفضلة" titleEn="Favorites" back="/profile" />
      <div className="content" dir={dir}>
        <h1>{ar ? 'طلباتك المفضلة' : 'Your favorites'}</h1>
        <div className="emptyState">
          <b>{ar ? 'المفضلة غير مفعلة بعد' : 'Favorites are not enabled yet'}</b>
          <span>{ar ? 'لن نعرض طلبات أو منتجات تجريبية. ستعمل هذه الصفحة بعد تفعيل حفظ المفضلة في السيرفر.' : 'We will not show fake products or orders. This page will become available once favorites are stored on the server.'}</span>
        </div>
        <Link className="outlineCta" href="/menu">{ar ? 'استكشف المنيو' : 'Explore the menu'}</Link>
      </div>
    </AppScreen>
  );
}
