'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { getBranches, getMenu, MenuProduct } from '../_api';

export default function Menu() {
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

    async function load() {
      try {
        let id = selected;
        if (!id) {
          const branches = await getBranches();
          if (!branches.length) throw new Error('No branches');
          id = branches[0].id;
          localStorage.setItem('lmtd_branch_id', id);
          localStorage.setItem('lmtd_branch_name', branches[0].nameAr || branches[0].nameEn || 'LMTD Coffee');
        }
        setBranchId(id);
        const data = await getMenu(id);
        setBranchName(data.branch.nameAr || data.branch.nameEn || 'LMTD Coffee');
        setProducts(data.products);
        localStorage.setItem('lmtd_branch_id', id);
        localStorage.setItem('lmtd_branch_name', data.branch.nameAr || data.branch.nameEn || 'LMTD Coffee');
      } catch {
        setError('تعذر تحميل المنيو حالياً. حاول مرة أخرى.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const categories = useMemo(() => {
    const values = products.map((p) => p.category?.nameAr || p.category?.nameEn).filter(Boolean) as string[];
    return ['الكل', ...Array.from(new Set(values))];
  }, [products]);

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
          {filtered.map((product) => (
            <Link href={`/product/${product.id}?branch=${branchId}`} className={`menuProduct ${product.isAvailable ? '' : 'soldOut'}`} key={product.id}>
              {product.imageUrl ? <img src={product.imageUrl} alt={product.nameAr || product.nameEn || 'منتج'} /> : <div className="productImagePlaceholder" />}
              <div className="productCopy">
                <small>{product.category?.nameAr || product.category?.nameEn || ''}</small>
                <b>{product.nameAr || product.nameEn}</b>
                <span>AED {product.price.toFixed(2)}</span>
                {!product.isAvailable && <small>غير متوفر حالياً</small>}
              </div>
              <span className="plusCircle">{product.isAvailable ? '+' : '—'}</span>
            </Link>
          ))}
        </div>

        {!loading && !error && filtered.length === 0 && <p>لا توجد منتجات مطابقة.</p>}
      </div>
      <BottomNav active="menu" />
    </AppScreen>
  );
}
