'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { getBranches, Branch } from '../_api';
import { readCustomerToken } from '../_auth';
import { readCart } from '../_cart';
import { submitCheckout } from '../_checkout';

export default function Pickup() {
  const router = useRouter();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [branchName, setBranchName] = useState('LMTD Coffee');
  const [loading, setLoading] = useState(false);
  const [loadingBranch, setLoadingBranch] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readCustomerToken()) {
      sessionStorage.setItem('lmtd_login_return', '/pickup');
      router.replace('/login');
      return;
    }

    const cart = readCart();
    const branchId = cart[0]?.branchId || '';
    if (!branchId) {
      router.replace('/cart');
      return;
    }

    getBranches()
      .then((rows) => {
        const selected = rows.find((row) => row.id === branchId) || null;
        if (!selected) {
          setError('الفرع الموجود في السلة لم يعد متاحاً.');
          return;
        }
        setBranch(selected);
        setBranchName(selected.nameAr || selected.nameEn || 'LMTD Coffee');
      })
      .catch(() => setError('تعذر التحقق من الفرع حالياً.'))
      .finally(() => setLoadingBranch(false));
  }, [router]);

  async function walkIn() {
    setLoading(true);
    setError('');
    try {
      const order = await submitCheckout({ pickupMethod: 'WALK_IN' });
      router.push(`/payment?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الطلب');
    } finally {
      setLoading(false);
    }
  }

  const unavailable = !branch || !branch.acceptsOrders || branch.isOpenOverride === false;

  return (
    <AppScreen>
      <Header title="طريقة الاستلام" back="/cart" />
      <div className="content" dir="rtl">
        <p className="kicker">LMTD COFFEE</p>
        <h1>كيف تفضل تستلم؟</h1>
        <p className="muted">اختر الطريقة الأنسب لك، ونجهز طلبك قبل وصولك.</p>

        <button className="pickupCard" type="button" onClick={walkIn} disabled={loading || loadingBranch || unavailable}>
          <span className="lineIcon">↥</span>
          <div><b>{loading ? 'جاري إنشاء الطلب...' : 'استلام من الكاونتر'}</b><small>ادخل الفرع وخذ طلبك مباشرة</small></div>
          <span>←</span>
        </button>

        {unavailable ? (
          <span className="pickupCard" aria-disabled="true" style={{ opacity: 0.45 }}>
            <span className="lineIcon">▱</span><span>الاستلام من السيارة غير متاح حتى يتم التحقق من الفرع</span><span>—</span>
          </span>
        ) : (
          <Link className="pickupCard" href="/vehicle">
            <span className="lineIcon">▱</span>
            <div><b>استلام من السيارة</b><small>سجل مركبتك ونوصل لك الطلب عند وصولك</small></div>
            <span>←</span>
          </Link>
        )}

        {error && <p>{error}</p>}
        <div className="pickupInfo">
          <b>{branchName}</b>
          <span>{branch ? `وقت التجهيز المتوقع ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة` : 'جاري التحقق من الفرع المختار'}</span>
        </div>
      </div>
    </AppScreen>
  );
}
