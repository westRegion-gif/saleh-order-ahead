'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { CreatedOrder, getMyOrders, getOrder } from '../_api';
import { getCustomerToken } from '../_auth';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار الدفع', PENDING: 'بانتظار قبول الفرع', ACCEPTED: 'تم قبول الطلب', PREPARING: 'جاري التحضير', READY: 'جاهز للاستلام', CUSTOMER_ARRIVED: 'تم تسجيل وصولك', COLLECTED: 'تم الاستلام', COMPLETED: 'مكتمل', REJECTED: 'مرفوض', CANCELLED: 'ملغي', PAYMENT_FAILED: 'فشل الدفع', REFUNDED: 'تم الاسترجاع',
  };
  return labels[status] || status;
}

export default function Orders() {
  const [orders, setOrders] = useState<CreatedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    const token = getCustomerToken();
    setSignedIn(!!token);
    if (token) {
      getMyOrders().then(setOrders).catch(() => setOrders([])).finally(() => setLoading(false));
      return;
    }

    let orderId = '';
    try {
      const pending = JSON.parse(localStorage.getItem('lmtd_pending_order') || 'null') as { id?: string } | null;
      orderId = pending?.id || '';
    } catch {
      orderId = '';
    }
    if (!orderId) { setLoading(false); return; }
    getOrder(orderId).then((order) => setOrders([order])).catch(() => setOrders([])).finally(() => setLoading(false));
  }, []);

  return (
    <AppScreen>
      <Header title="طلباتي" back="/home" />
      <div className="content" dir="rtl">
        <h1>طلباتي</h1>
        {loading && <p className="muted">جاري تحميل الطلبات...</p>}
        {!loading && orders.map((order, index) => (
          <div className={`orderCard ${index === 0 ? 'current' : ''}`} key={order.id}>
            <div className="orderTop"><span>{index === 0 ? 'آخر طلب' : 'طلب سابق'}</span><b>#{order.orderNumber}</b></div>
            <div className="orderState">{statusLabel(order.status)}</div>
            <div className="bill">
              <div><span>الفرع</span><b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b></div>
              <div><span>الإجمالي</span><b>AED {Number(order.total).toFixed(2)}</b></div>
            </div>
            <Link className="blackCta" href={`/tracking?order=${order.id}`}>عرض حالة الطلب <span>←</span></Link>
          </div>
        ))}
        {!loading && orders.length === 0 && (
          <div className="emptyState"><b>لا توجد طلبات حتى الآن</b><span>{signedIn ? 'ستظهر طلباتك هنا بعد أول عملية شراء.' : 'سجل الدخول لعرض سجل طلباتك على جميع أجهزتك.'}</span></div>
        )}
        {!signedIn && <Link className="outlineCta" href="/login">تسجيل الدخول</Link>}
        <Link className="outlineCta" href="/branches">ابدأ طلباً جديداً</Link>
      </div>
      <BottomNav active="orders" />
    </AppScreen>
  );
}
