'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { CreatedOrder, getOrder } from '../_api';

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار الدفع',
    PENDING: 'بانتظار قبول الفرع',
    ACCEPTED: 'تم قبول الطلب',
    PREPARING: 'جاري التحضير',
    READY: 'جاهز للاستلام',
    CUSTOMER_ARRIVED: 'تم تسجيل وصولك',
    COLLECTED: 'تم الاستلام',
    COMPLETED: 'مكتمل',
    REJECTED: 'مرفوض',
    CANCELLED: 'ملغي',
    PAYMENT_FAILED: 'فشل الدفع',
    REFUNDED: 'تم الاسترجاع',
  };
  return labels[status] || status;
}

export default function Orders() {
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let orderId = '';
    try {
      const pending = JSON.parse(localStorage.getItem('lmtd_pending_order') || 'null') as { id?: string } | null;
      orderId = pending?.id || '';
    } catch {
      orderId = '';
    }

    if (!orderId) {
      setLoading(false);
      return;
    }

    getOrder(orderId)
      .then(setOrder)
      .catch(() => setOrder(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppScreen>
      <Header title="طلباتي" back="/home" />
      <div className="content" dir="rtl">
        <h1>طلباتي</h1>
        {loading && <p className="muted">جاري تحميل آخر طلب...</p>}
        {!loading && order && (
          <div className="orderCard current">
            <div className="orderTop"><span>آخر طلب على هذا الجهاز</span><b>#{order.orderNumber}</b></div>
            <div className="orderState">{statusLabel(order.status)}</div>
            <div className="bill">
              <div><span>الفرع</span><b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b></div>
              <div><span>الإجمالي</span><b>AED {Number(order.total).toFixed(2)}</b></div>
            </div>
            <Link className="blackCta" href={`/tracking?order=${order.id}`}>عرض حالة الطلب <span>←</span></Link>
          </div>
        )}
        {!loading && !order && (
          <div className="emptyState">
            <b>لا يوجد طلب محفوظ على هذا الجهاز</b>
            <span>ستظهر هنا آخر عملية Checkout حقيقية. سجل الطلبات الكامل سيعمل بعد تفعيل حساب العميل.</span>
          </div>
        )}
        <Link className="outlineCta" href="/branches">ابدأ طلباً جديداً</Link>
      </div>
      <BottomNav active="orders" />
    </AppScreen>
  );
}
