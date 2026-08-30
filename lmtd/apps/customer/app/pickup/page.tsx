'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { getBranches, Branch } from '../_api';
import { readCustomerToken } from '../_auth';
import { readCart } from '../_cart';
import { submitCheckout } from '../_checkout';
import { useLanguage } from '../_language';

export default function Pickup() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [branch, setBranch] = useState<Branch | null>(null);
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
          setError(ar ? 'الفرع الموجود في السلة لم يعد متاحاً.' : 'The branch in your cart is no longer available.');
          return;
        }
        setBranch(selected);
      })
      .catch(() => setError(ar ? 'تعذر التحقق من الفرع حالياً.' : 'Could not verify the branch.'))
      .finally(() => setLoadingBranch(false));
  }, [router, ar]);

  async function walkIn() {
    setLoading(true);
    setError('');
    try {
      const order = await submitCheckout({ pickupMethod: 'WALK_IN' });
      router.push(`/payment?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر إنشاء الطلب' : 'Could not create order'));
    } finally {
      setLoading(false);
    }
  }

  const unavailable = !branch || !branch.acceptsOrders || branch.isOpenOverride === false;
  const branchName = branch ? (ar ? (branch.nameAr || branch.nameEn) : (branch.nameEn || branch.nameAr)) : 'LMTD Coffee';

  return (
    <AppScreen>
      <Header title="طريقة الاستلام" titleEn="Pickup method" back="/cart" />
      <div className="content" dir={dir}>
        <p className="kicker">LMTD COFFEE</p>
        <h1>{ar ? 'كيف تفضل تستلم؟' : 'How would you like to pick up?'}</h1>
        <p className="muted">{ar ? 'اختر الطريقة الأنسب لك، ونجهز طلبك قبل وصولك.' : 'Choose what works best and we will prepare your order before you arrive.'}</p>

        <button className="pickupCard" type="button" onClick={walkIn} disabled={loading || loadingBranch || unavailable}>
          <span className="lineIcon">↥</span>
          <div><b>{loading ? (ar ? 'جاري إنشاء الطلب...' : 'Creating order...') : (ar ? 'استلام من الكاونتر' : 'Counter pickup')}</b><small>{ar ? 'ادخل الفرع وخذ طلبك مباشرة' : 'Walk in and collect your order at the counter'}</small></div>
          <span>←</span>
        </button>

        {unavailable ? (
          <span className="pickupCard" aria-disabled="true" style={{ opacity: 0.45 }}>
            <span className="lineIcon">▱</span><span>{ar ? 'الاستلام من السيارة غير متاح حتى يتم التحقق من الفرع' : 'Vehicle pickup is unavailable until the branch is verified'}</span><span>—</span>
          </span>
        ) : (
          <Link className="pickupCard" href="/vehicle">
            <span className="lineIcon">▱</span>
            <div><b>{ar ? 'استلام من السيارة' : 'Vehicle pickup'}</b><small>{ar ? 'سجل مركبتك ونوصل لك الطلب عند وصولك' : 'Add your vehicle and we will bring the order when you arrive'}</small></div>
            <span>←</span>
          </Link>
        )}

        {error && <p>{error}</p>}
        <div className="pickupInfo">
          <b>{branchName}</b>
          <span>{branch ? (ar ? `وقت التجهيز المتوقع ${branch.prepTimeMin}–${branch.prepTimeMax} دقيقة` : `Estimated prep time ${branch.prepTimeMin}–${branch.prepTimeMax} min`) : (ar ? 'جاري التحقق من الفرع المختار' : 'Checking selected branch')}</span>
        </div>
      </div>
    </AppScreen>
  );
}
