'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { getBranches, Branch } from '../_api';
import { submitCheckout } from '../_checkout';

export default function Pickup(){
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('LMTD Coffee');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const branchId = localStorage.getItem('lmtd_branch_id');
    setBranchName(localStorage.getItem('lmtd_branch_name') || 'LMTD Coffee');
    if (!branchId) return;
    getBranches().then((rows) => {
      const selected = rows.find((row) => row.id === branchId) || null;
      setBranch(selected);
      if (selected) setBranchName(selected.nameAr || selected.nameEn || 'LMTD Coffee');
    }).catch(() => undefined);
  }, []);

  async function walkIn(){
    setLoading(true); setError('');
    try {
      const order = await submitCheckout({ pickupMethod: 'WALK_IN' });
      router.push(`/payment?order=${order.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر إنشاء الطلب');
    } finally { setLoading(false); }
  }

  return <AppScreen><Header title="طريقة الاستلام" back="/cart"/><div className="content" dir="rtl"><p className="kicker">LMTD COFFEE</p><h1>كيف تفضل تستلم؟</h1><p className="muted">اختر الطريقة الأنسب لك، ونجهز طلبك قبل وصولك.</p>
    <button className="pickupCard" type="button" onClick={walkIn} disabled={loading}><span className="lineIcon">↥</span><div><b>{loading ? 'جاري تجهيز الطلب...' : 'استلام من الكاونتر'}</b><small>ادخل الفرع وخذ طلبك مباشرة</small></div><span>←</span></button>
    <Link className="pickupCard" href="/vehicle"><span className="lineIcon">▱</span><div><b>استلام من السيارة</b><small>سجل مركبتك ونوصل لك الطلب عند وصولك</small></div><span>←</span></Link>
    {error && <p>{error}</p>}
    <div className="pickupInfo"><b>{branchName}</b><span>{branch ? `وقت التجهيز المتوقع ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة` : 'وقت التجهيز يظهر حسب الفرع المختار'}</span></div>
  </div></AppScreen>
}
