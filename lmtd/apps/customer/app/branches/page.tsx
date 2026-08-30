'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Branch, getBranches } from '../_api';
import { readCart, writeCart } from '../_cart';
import { useLanguage } from '../_language';

function branchStatus(branch: Branch, ar: boolean) {
  if (!branch.acceptsOrders) return ar ? 'الطلبات متوقفة' : 'Orders paused';
  if (branch.isOpenOverride === false) return ar ? 'مغلق حالياً' : 'Closed now';
  return ar ? 'متاح للطلب' : 'Available to order';
}

function canOrder(branch: Branch) {
  return branch.acceptsOrders && branch.isOpenOverride !== false;
}

export default function BranchesPage() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getBranches()
      .then(setBranches)
      .catch(() => setError(ar ? 'تعذر تحميل الفروع حالياً. حاول مرة أخرى.' : 'Could not load branches. Please try again.'))
      .finally(() => setLoading(false));
  }, [ar]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => `${b.nameAr} ${b.nameEn ?? ''} ${b.addressAr ?? ''} ${b.addressEn ?? ''}`.toLowerCase().includes(q));
  }, [branches, query]);

  function chooseBranch(branch: Branch) {
    if (!canOrder(branch)) return;
    const cart = readCart();
    if (cart.length > 0 && cart.some((item) => item.branchId !== branch.id)) writeCart([]);
    localStorage.setItem('lmtd_branch_id', branch.id);
    localStorage.setItem('lmtd_branch_name', ar ? (branch.nameAr || branch.nameEn || 'LMTD Coffee') : (branch.nameEn || branch.nameAr || 'LMTD Coffee'));
  }

  return (
    <main className="shell">
      <section className="screen screen-light approved-branch-screen" dir={dir}>
        <header className="topbar approved-topbar">
          <Link href="/" className="iconBtn" aria-label={ar ? 'رجوع' : 'Back'}>←</Link>
          <span className="brand">LMTD COFFEE</span>
          <span className="topbarSpacer" />
        </header>

        <div className="screenBody approved-branch-body">
          <div className="branchHeading">
            <div className="countrySelector">
              <span>{ar ? 'الإمارات' : 'UAE'}</span>
              <b>Abu Dhabi</b>
              <span className="chevron">⌄</span>
            </div>
            <h1>{ar ? 'اختر الفرع' : 'Choose a branch'}</h1>
            <p className="muted">{ar ? 'اختر الفرع الذي يناسبك للاستلام.' : 'Choose the most convenient branch for pickup.'}</p>
          </div>

          <div className="branchTools">
            <div className="branchSearchWrap">
              <span className="searchIcon">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="branchSearch" aria-label={ar ? 'البحث عن فرع' : 'Search branches'} placeholder={ar ? 'ابحث عن فرع' : 'Search branches'} />
            </div>
          </div>

          {loading && <p className="muted">{ar ? 'جاري تحميل الفروع...' : 'Loading branches...'}</p>}
          {error && <p className="muted">{error}</p>}

          <div className="approvedBranchList">
            {filtered.map((branch) => {
              const available = canOrder(branch);
              const name = ar ? (branch.nameAr || branch.nameEn) : (branch.nameEn || branch.nameAr);
              const address = ar ? (branch.addressAr || branch.addressEn) : (branch.addressEn || branch.addressAr);
              return (
                <article className="approvedBranchCard" key={branch.id}>
                  {branch.imageUrl ? (
                    <div className="branchImageWrap">
                      <img src={branch.imageUrl} alt={name || 'LMTD Coffee'} />
                      <span className="openBadge">{branchStatus(branch, ar)}</span>
                    </div>
                  ) : null}
                  <div className="branchCardBody">
                    <div>
                      <span className="branchCity">{branch.code}</span>
                      <h2>{name}</h2>
                      {address && <p className="muted">{address}</p>}
                    </div>
                    <div className="branchMetaRow">
                      <span>{branchStatus(branch, ar)}</span>
                      <span>{ar ? `التجهيز ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة` : `Prep ${branch.prepTimeMin}–${branch.prepTimeMax} min`}</span>
                    </div>
                    {available ? (
                      <Link onClick={() => chooseBranch(branch)} className="branchContinue" href={`/menu?branch=${branch.id}`}>{ar ? 'اختيار هذا الفرع' : 'Choose this branch'}</Link>
                    ) : (
                      <span className="branchContinue" aria-disabled="true" style={{ opacity: 0.45, pointerEvents: 'none' }}>{ar ? 'غير متاح للطلب حالياً' : 'Not available for ordering'}</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {!loading && !error && filtered.length === 0 && <p className="muted">{ar ? 'لا توجد فروع مطابقة للبحث.' : 'No branches match your search.'}</p>}
        </div>
      </section>
    </main>
  );
}
