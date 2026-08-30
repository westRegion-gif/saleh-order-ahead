'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { CreatedOrder, getOrders } from '../_api';
import { readCustomerToken } from '../_auth';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار الدفع', PENDING: 'بانتظار قبول الفرع', ACCEPTED: 'تم قبول الطلب', PREPARING: 'جاري التحضير',
    READY: 'جاهز للاستلام', CUSTOMER_ARRIVED: 'تم تسجيل وصولك', COLLECTED: 'تم الاستلام', COMPLETED: 'مكتمل',
    REJECTED: 'مرفوض', CANCELLED: 'ملغي', PAYMENT_FAILED: 'فشل الدفع', REFUNDED: 'تم الاسترجاع',
  };
  return labels[status] || status;
}

export default function Orders() {
  const [orders, setOrders] = useState<CreatedOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readCustomerToken()) {
      setLoading(false);
      return;
    }
    getOrders()
      .then(setOrders)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الطلبات'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppScreen>
      <Header title="طلباتي" back="/home" />
      <div className="content" dir="rtl">
        <h1>طلباتي</h1>
        {loading && <p className="muted">جاري تحميل طلباتك...</p>}
        {error && <div className="emptyState"><b>{error}</b></div>}
        {!loading && !readCustomerToken() && (
          <div className="emptyState"><b>سجل الدخول لعرض طلباتك</b><Link className="blackCta" href="/login">تسجيل الدخول <span>←</span></Link></div>
        )}
        {orders.map((order, index) => (
          <div className={`orderCard ${index === 0 ? 'current' : ''}`} key={order.id}>
            <div className="orderTop"><span>{order.createdAt ? new Date(order.createdAt).toLocaleString('ar-AE') : 'طلب'}</span><b>#{order.orderNumber}</b></div>
            <div className="orderState">{statusLabel(order.status)}</div>
            <div className="bill">
              <div><span>الفرع</span><b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b></div>
              <div><span>الإجمالي</span><b>AED {Number(order.total).toFixed(2)}</b></div>
            </div>
            <Link className="blackCta" href={order.status === 'PAYMENT_PENDING' || order.status === 'PAYMENT_FAILED' ? `/payment?order=${order.id}` : `/tracking?order=${order.id}`}>
              {order.status === 'PAYMENT_PENDING' || order.status === 'PAYMENT_FAILED' ? 'إكمال الدفع' : 'عرض حالة الطلب'} <span>←</span>
            </Link>
          </div>
        ))}
        {!loading && !error && readCustomerToken() && orders.length === 0 && <div className="emptyState"><b>لا توجد طلبات بعد</b><span>ستظهر طلباتك الحقيقية هنا بعد أول طلب.</span></div>}
        <Link className="outlineCta" href="/branches">ابدأ طلباً جديداً</Link>
      </div>
      <BottomNav active="orders" />
    </AppScreen>
  );
}
