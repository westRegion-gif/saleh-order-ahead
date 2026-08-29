'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav, Header } from '../_components';
import { getMenu, MenuProduct } from '../_api';

export default function Menu() {
  const router = useRouter();
  const [branchId, setBranchId] = useState('');
  const [branchName, setBranchName] = useState('LMTD Coffee');
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('الكل');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get('branch') || localStorage.getItem('lmtd_branch_id') || '';
    const requestedCategory = params.get('category');

    if (!selected) {
      router.replace('/branches');
      return;
    }

    setBranchId(selected);
    getMenu(selected)
      .then((data) => {
        const name = data.branch.nameAr || data.branch.nameEn || 'LMTD Coffee';
        setBranchName(name);
        setProducts(data.products);
        localStorage.setItem('lmtd_branch_id', selected);
        localStorage.setItem('lmtd_branch_name', name);
        if (requestedCategory) setCategory(requestedCategory);
      })
      .catch(() => setError('تعذر تحميل المنيو حالياً. حاول مرة أخرى.'))
      .finally(() => setLoading(false));
  }, [router]);

  const categories = useMemo(() => {
    const values = products.map((p) => p.category?.nameAr || p.category?.nameEn).filter(Boolean) as string[];
    return ['الكل', ...Array.from(new Set(values))];
  }, [products]);

  useEffect(() => {
    if (category !== 'الكل' && categories.length > 1 && !categories.includes(category)) setCategory('الكل');
  }, [categories, category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const cat = p.category?.nameAr || p.category?.nameEn || '';
      const categoryMatch = category === 'الكل' || cat === category;
      const text = `${p.nameAr} ${p.nameEn ?? ''} ${cat}`.toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    });
  }, [products, query, category]);

  return (
    <AppScreen>
      <Header title="المنيو" back="/home" cart />
      <div className="content menuContent" dir="rtl">
        <Link href="/branches" className="miniBranch"><span>الاستلام من</span><b>{branchName}</b></Link>

        <div className="searchInput">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="البحث في المنيو" placeholder="ابحث عن مشروبك" />
          <span>⌕</span>
        </div>

        <div className="chips scroll">
          {categories.map((item) => (
            <button key={item} type="button" className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>

        <h1>المنيو</h1>
        {loading && <p>جاري تحميل المنيو...</p>}
        {error && <p>{error}</p>}

        <div className="productList">
          {filtered.map((product) => {
            const body = (
              <>
                {product.imageUrl ? <img src={product.imageUrl} alt={product.nameAr || product.nameEn || 'منتج'} /> : <div className="productImagePlaceholder" />}
                <div className="productCopy">
                  <small>{product.category?.nameAr || product.category?.nameEn || ''}</small>
                  <b>{product.nameAr || product.nameEn}</b>
                  <span>AED {product.price.toFixed(2)}</span>
                  {!product.isAvailable && <small>غير متوفر حالياً</small>}
                </div>
                <span className="plusCircle">{product.isAvailable ? '+' : '—'}</span>
              </>
            );

            return product.isAvailable ? (
              <Link href={`/product/${product.id}?branch=${branchId}`} className="menuProduct" key={product.id}>{body}</Link>
            ) : (
              <div className="menuProduct soldOut" aria-disabled="true" key={product.id}>{body}</div>
            );
          })}
        </div>

        {!loading && !error && filtered.length === 0 && <p>لا توجد منتجات مطابقة.</p>}
      </div>
      <BottomNav active="menu" />
    </AppScreen>
  );
}
