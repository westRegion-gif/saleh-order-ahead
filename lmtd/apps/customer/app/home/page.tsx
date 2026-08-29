'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav } from '../_components';
import { Branch, getBranches, getMenu, MenuProduct } from '../_api';

export default function Home() {
  const router = useRouter();
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
      .catch(() => setError('تعذر تحميل بيانات الفرع حالياً.'))
      .finally(() => setLoading(false));
  }, [router]);

  const available = useMemo(() => products.filter((product) => product.isAvailable), [products]);
  const featured = available.slice(0, 2);
  const categories = useMemo(() => {
    const values = available.map((p) => p.category?.nameAr || p.category?.nameEn).filter(Boolean) as string[];
    return Array.from(new Set(values)).slice(0, 4);
  }, [available]);
  const hero = available[0] || null;

  const branchLabel = branch?.nameAr || branch?.nameEn || 'LMTD Coffee';
  const branchUnavailable = branch && (!branch.acceptsOrders || branch.isOpenOverride === false);

  return (
    <AppScreen>
      <div className="homeTop">
        <div><p className="kicker">LMTD COFFEE</p><h1>مرحباً</h1></div>
        <Link href="/more" className="roundBtn">•••</Link>
      </div>
      <div className="content" dir="rtl">
        {loading && <p className="muted">جاري تحميل الفرع...</p>}
        {error && <p className="muted">{error}</p>}
        {branch && (
          <Link href="/branches" className="branchBar">
            <span>
              <b>{branchLabel}</b>
              <small>{branchUnavailable ? 'غير متاح للطلب حالياً' : `التجهيز ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة`}</small>
            </span>
            <b>تغيير</b>
          </Link>
        )}

        {branch && !branchUnavailable && (
          <>
            <Link href={`/menu?branch=${branch.id}`} className="searchBar">ابحث في المنيو <span>⌕</span></Link>
            {hero && (
              <Link href={`/product/${hero.id}?branch=${branch.id}`} className="promo">
                <div>
                  <p>من المنيو</p>
                  <h2>{hero.nameAr || hero.nameEn}</h2>
                  <span>اطلب الآن ←</span>
                </div>
                {hero.imageUrl ? <img src={hero.imageUrl} alt={hero.nameAr || hero.nameEn || 'منتج'} /> : <div className="productImagePlaceholder" />}
              </Link>
            )}

            {categories.length > 0 && (
              <section>
                <div className="sectionTitle"><h3>التصنيفات</h3><Link href={`/menu?branch=${branch.id}`}>عرض الكل</Link></div>
                <div className="chips">
                  {categories.map((item) => <Link key={item} href={`/menu?branch=${branch.id}&category=${encodeURIComponent(item)}`}>{item}</Link>)}
                </div>
              </section>
            )}

            {featured.length > 0 && (
              <section>
                <div className="sectionTitle"><h3>مختارات من المنيو</h3><Link href={`/menu?branch=${branch.id}`}>المزيد</Link></div>
                <div className="featuredGrid">
                  {featured.map((product) => (
                    <Link key={product.id} href={`/product/${product.id}?branch=${branch.id}`} className="featuredCard">
                      {product.imageUrl ? <img src={product.imageUrl} alt={product.nameAr || product.nameEn || 'منتج'} /> : <div className="productImagePlaceholder" />}
                      <b>{product.nameAr || product.nameEn}</b>
                      <span>AED {product.price.toFixed(2)}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {branchUnavailable && <Link className="outlineCta" href="/branches">اختر فرعاً آخر</Link>}
      </div>
      <BottomNav active="home" />
    </AppScreen>
  );
}
