'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav, Header } from '../_components';
import { getMenu, MenuProduct } from '../_api';
import { useLanguage } from '../_language';

export default function Menu() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const allLabel = ar ? 'الكل' : 'All';
  const [branchId, setBranchId] = useState('');
  const [branchName, setBranchName] = useState('LMTD Coffee');
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(allLabel);
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
    setLoading(true);
    getMenu(selected)
      .then((data) => {
        const name = ar ? (data.branch.nameAr || data.branch.nameEn || 'LMTD Coffee') : (data.branch.nameEn || data.branch.nameAr || 'LMTD Coffee');
        setBranchName(name);
        setProducts(data.products);
        localStorage.setItem('lmtd_branch_id', selected);
        localStorage.setItem('lmtd_branch_name', name);
        setCategory(requestedCategory || allLabel);
      })
      .catch(() => setError(ar ? 'تعذر تحميل المنيو حالياً. حاول مرة أخرى.' : 'Could not load the menu. Please try again.'))
      .finally(() => setLoading(false));
  }, [router, ar, allLabel]);

  const categories = useMemo(() => {
    const values = products.map((p) => ar ? (p.category?.nameAr || p.category?.nameEn) : (p.category?.nameEn || p.category?.nameAr)).filter(Boolean) as string[];
    return [allLabel, ...Array.from(new Set(values))];
  }, [products, ar, allLabel]);

  useEffect(() => {
    if (category !== allLabel && categories.length > 1 && !categories.includes(category)) setCategory(allLabel);
  }, [categories, category, allLabel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const cat = ar ? (p.category?.nameAr || p.category?.nameEn || '') : (p.category?.nameEn || p.category?.nameAr || '');
      const categoryMatch = category === allLabel || cat === category;
      const text = `${p.nameAr} ${p.nameEn ?? ''} ${p.category?.nameAr ?? ''} ${p.category?.nameEn ?? ''}`.toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    });
  }, [products, query, category, allLabel, ar]);

  return (
    <AppScreen>
      <Header title="المنيو" titleEn="Menu" back="/home" cart />
      <div className="content menuContent" dir={dir}>
        <Link href="/branches" className="miniBranch"><span>{ar ? 'الاستلام من' : 'Pickup from'}</span><b>{branchName}</b></Link>

        <div className="searchInput">
          <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={ar ? 'البحث في المنيو' : 'Search menu'} placeholder={ar ? 'ابحث عن مشروبك' : 'Search your drink'} />
          <span>⌕</span>
        </div>

        <div className="chips scroll">
          {categories.map((item) => (
            <button key={item} type="button" className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>

        <h1>{ar ? 'المنيو' : 'Menu'}</h1>
        {loading && <p>{ar ? 'جاري تحميل المنيو...' : 'Loading menu...'}</p>}
        {error && <p>{error}</p>}

        <div className="productList">
          {filtered.map((product) => {
            const name = ar ? (product.nameAr || product.nameEn) : (product.nameEn || product.nameAr);
            const cat = ar ? (product.category?.nameAr || product.category?.nameEn || '') : (product.category?.nameEn || product.category?.nameAr || '');
            const body = (
              <>
                {product.imageUrl ? <img src={product.imageUrl} alt={name || 'Product'} /> : <div className="productImagePlaceholder" />}
                <div className="productCopy">
                  <small>{cat}</small>
                  <b>{name}</b>
                  <span>AED {product.price.toFixed(2)}</span>
                  {!product.isAvailable && <small>{ar ? 'غير متوفر حالياً' : 'Currently unavailable'}</small>}
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

        {!loading && !error && filtered.length === 0 && <p>{ar ? 'لا توجد منتجات مطابقة.' : 'No matching products.'}</p>}
      </div>
      <BottomNav active="menu" />
    </AppScreen>
  );
}
