'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav } from '../_components';
import { Branch, getBranches, getMenu, MenuProduct } from '../_api';
import { useLanguage } from '../_language';

export default function Home() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [branch, setBranch] = useState<Branch | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const branchId = localStorage.getItem('lmtd_branch_id');
    if (!branchId) {
      router.replace('/branches');
      return;
    }

    Promise.all([getBranches(), getMenu(branchId)])
      .then(([branches, menu]) => {
        const selected = branches.find((row) => row.id === branchId) || null;
        if (!selected) {
          localStorage.removeItem('lmtd_branch_id');
          localStorage.removeItem('lmtd_branch_name');
          router.replace('/branches');
          return;
        }
        setBranch(selected);
        setProducts(menu.products);
      })
      .catch(() => setError(ar ? 'تعذر تحميل بيانات الفرع حالياً.' : 'Could not load branch details.'))
      .finally(() => setLoading(false));
  }, [router, ar]);

  const available = useMemo(() => products.filter((product) => product.isAvailable), [products]);
  const featured = available.slice(0, 2);
  const categories = useMemo(() => {
    const values = available.map((p) => ar ? (p.category?.nameAr || p.category?.nameEn) : (p.category?.nameEn || p.category?.nameAr)).filter(Boolean) as string[];
    return Array.from(new Set(values)).slice(0, 4);
  }, [available, ar]);
  const hero = available[0] || null;

  const branchLabel = branch ? (ar ? (branch.nameAr || branch.nameEn) : (branch.nameEn || branch.nameAr)) : 'LMTD Coffee';
  const branchUnavailable = branch && (!branch.acceptsOrders || branch.isOpenOverride === false);

  return (
    <AppScreen>
      <div className="homeTop" dir={dir}>
        <div><p className="kicker">LMTD COFFEE</p><h1>{ar ? 'مرحباً' : 'Welcome'}</h1></div>
        <Link href="/more" className="roundBtn">•••</Link>
      </div>
      <div className="content" dir={dir}>
        {loading && <p className="muted">{ar ? 'جاري تحميل الفرع...' : 'Loading branch...'}</p>}
        {error && <p className="muted">{error}</p>}
        {branch && (
          <Link href="/branches" className="branchBar">
            <span>
              <b>{branchLabel}</b>
              <small>{branchUnavailable ? (ar ? 'غير متاح للطلب حالياً' : 'Not available for ordering') : (ar ? `التجهيز ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة` : `Prep ${branch.prepTimeMin}–${branch.prepTimeMax} min`)}</small>
            </span>
            <b>{ar ? 'تغيير' : 'Change'}</b>
          </Link>
        )}

        {branch && !branchUnavailable && (
          <>
            <Link href={`/menu?branch=${branch.id}`} className="searchBar">{ar ? 'ابحث في المنيو' : 'Search the menu'} <span>⌕</span></Link>
            {hero && (
              <Link href={`/product/${hero.id}?branch=${branch.id}`} className="promo">
                <div>
                  <p>{ar ? 'من المنيو' : 'From the menu'}</p>
                  <h2>{ar ? (hero.nameAr || hero.nameEn) : (hero.nameEn || hero.nameAr)}</h2>
                  <span>{ar ? 'اطلب الآن ←' : 'Order now →'}</span>
                </div>
                {hero.imageUrl ? <img src={hero.imageUrl} alt={(ar ? (hero.nameAr || hero.nameEn) : (hero.nameEn || hero.nameAr)) || 'Product'} /> : <div className="productImagePlaceholder" />}
              </Link>
            )}

            {categories.length > 0 && (
              <section>
                <div className="sectionTitle"><h3>{ar ? 'التصنيفات' : 'Categories'}</h3><Link href={`/menu?branch=${branch.id}`}>{ar ? 'عرض الكل' : 'View all'}</Link></div>
                <div className="chips">
                  {categories.map((item) => <Link key={item} href={`/menu?branch=${branch.id}&category=${encodeURIComponent(item)}`}>{item}</Link>)}
                </div>
              </section>
            )}

            {featured.length > 0 && (
              <section>
                <div className="sectionTitle"><h3>{ar ? 'مختارات من المنيو' : 'Menu picks'}</h3><Link href={`/menu?branch=${branch.id}`}>{ar ? 'المزيد' : 'More'}</Link></div>
                <div className="featuredGrid">
                  {featured.map((product) => (
                    <Link key={product.id} href={`/product/${product.id}?branch=${branch.id}`} className="featuredCard">
                      {product.imageUrl ? <img src={product.imageUrl} alt={(ar ? (product.nameAr || product.nameEn) : (product.nameEn || product.nameAr)) || 'Product'} /> : <div className="productImagePlaceholder" />}
                      <b>{ar ? (product.nameAr || product.nameEn) : (product.nameEn || product.nameAr)}</b>
                      <span>AED {product.price.toFixed(2)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {branchUnavailable && <Link className="outlineCta" href="/branches">{ar ? 'اختر فرعاً آخر' : 'Choose another branch'}</Link>}
      </div>
      <BottomNav active="home" />
    </AppScreen>
  );
}
