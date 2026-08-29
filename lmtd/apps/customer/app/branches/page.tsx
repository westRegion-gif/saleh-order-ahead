'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Branch, getBranches } from '../_api';

function branchStatus(branch: Branch) {
  if (!branch.acceptsOrders) return 'الطلبات متوقفة';
  if (branch.isOpenOverride === false) return 'مغلق حالياً';
  return 'متاح للطلب';
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getBranches()
      .then(setBranches)
      .catch(() => setError('تعذر تحميل الفروع حالياً. حاول مرة أخرى.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => `${b.nameAr} ${b.nameEn ?? ''} ${b.addressAr ?? ''} ${b.addressEn ?? ''}`.toLowerCase().includes(q));
  }, [branches, query]);

  function chooseBranch(branch: Branch) {
    localStorage.setItem('lmtd_branch_id', branch.id);
    localStorage.setItem('lmtd_branch_name', branch.nameAr || branch.nameEn || 'LMTD Coffee');
  }

  return (
    <main className="shell">
      <section className="screen screen-light approved-branch-screen" dir="rtl">
        <header className="topbar approved-topbar">
          <Link href="/" className="iconBtn" aria-label="رجوع">←</Link>
          <span className="brand">LMTD COFFEE</span>
          <span className="topbarSpacer" />
        </header>

        <div className="screenBody approved-branch-body">
          <div className="branchHeading">
            <div className="countrySelector">
              <span>الإمارات</span>
              <b>Abu Dhabi</b>
              <span className="chevron">⌄</span>
            </div>
            <h1>اختر الفرع</h1>
            <p className="muted">اختر الفرع الذي يناسبك للاستلام.</p>
          </div>

          <div className="branchTools">
            <div className="branchSearchWrap">
              <span className="searchIcon">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} className="branchSearch" aria-label="البحث عن فرع" placeholder="ابحث عن فرع" />
            </div>
          </div>

          {loading && <p className="muted">جاري تحميل الفروع...</p>}
          {error && <p className="muted">{error}</p>}

          <div className="approvedBranchList">
            {filtered.map((branch) => (
              <article className="approvedBranchCard" key={branch.id}>
                {branch.imageUrl ? (
                  <div className="branchImageWrap">
                    <img src={branch.imageUrl} alt={branch.nameAr || branch.nameEn || 'LMTD Coffee'} />
                    <span className="openBadge">{branchStatus(branch)}</span>
                  </div>
                ) : null}
                <div className="branchCardBody">
                  <div>
                    <span className="branchCity">{branch.code}</span>
                    <h2>{branch.nameAr || branch.nameEn}</h2>
                    {(branch.addressAr || branch.addressEn) && <p className="muted">{branch.addressAr || branch.addressEn}</p>}
                  </div>
                  <div className="branchMetaRow">
                    <span>{branchStatus(branch)}</span>
                    <span>التجهيز {branch.prepTimeMin}–{branch.prepTimeMax} دقيقة</span>
                  </div>
                  <Link onClick={() => chooseBranch(branch)} className="branchContinue" href={`/menu?branch=${branch.id}`}>اختيار هذا الفرع</Link>
                </div>
              </article>
            ))}
          </div>

          {!loading && !error && filtered.length === 0 && <p className="muted">لا توجد فروع مطابقة للبحث.</p>}
        </div>
      </section>
    </main>
  );
}
