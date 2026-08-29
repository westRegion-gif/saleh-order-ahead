'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, getOrder } from '../_api';

const FLOW = ['PAYMENT_PENDING', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'COMPLETED'];

function label(status: string) {
  const labels: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار الدفع',
    PENDING: 'تم استلام الطلب',
    ACCEPTED: 'تم قبول الطلب',
    PREPARING: 'جاري التحضير',
    READY: 'جاهز للاستلام',
    CUSTOMER_ARRIVED: 'تم تسجيل وصولك',
    COLLECTED: 'تم الاستلام',
    COMPLETED: 'اكتمل الطلب',
    REJECTED: 'تم رفض الطلب',
    CANCELLED: 'تم إلغاء الطلب',
    PAYMENT_FAILED: 'فشل الدفع',
    REFUNDED: 'تم استرجاع المبلغ',
  };
  return labels[status] || status;
}

export default function Tracking() {
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    let orderId = search.get('order') || '';

    if (!orderId) {
      try {
        const pending = JSON.parse(localStorage.getItem('lmtd_pending_order') || 'null') as { id?: string } | null;
        orderId = pending?.id || '';
      } catch {
        orderId = '';
      }
    }

    if (!orderId) {
      setError('لا يوجد طلب للتتبع.');
      setLoading(false);
      return;
    }

    getOrder(orderId)
      .then(setOrder)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الطلب'))
      .finally(() => setLoading(false));
  }, []);

  const currentIndex = useMemo(() => order ? FLOW.indexOf(order.status) : -1, [order]);
  const history = order?.statusHistory || [];

  return (
    <AppScreen>
      <Header title="طلبك" back="/orders" />
      <div className="content trackingPage" dir="rtl">
        {loading && <p className="muted">جاري تحميل حالة الطلب...</p>}
        {error && <div className="emptyState"><b>{error}</b></div>}
        {order && (
          <>
            <p className="kicker">ORDER #{order.orderNumber}</p>
            <h1>{label(order.status)}</h1>
            <p className="eta">الحالة المعروضة مأخوذة مباشرة من السيرفر.</p>

            {currentIndex >= 0 && (
              <div className="progressLine">
                {[0, 1, 2, 3].map((step) => {
                  const scaledIndex = Math.floor((currentIndex / Math.max(1, FLOW.length - 1)) * 3);
                  return <i key={step} className={step < scaledIndex ? 'done' : step === scaledIndex ? 'active' : ''} />;
                })}
              </div>
            )}

            <div className="statusList">
              {history.length > 0 ? history.map((entry, index) => (
                <div key={entry.id} className={index === history.length - 1 ? 'activeStatus' : 'doneStatus'}>
                  <b>{label(entry.status)}</b>
                  <span>{new Date(entry.createdAt).toLocaleString('ar-AE')}</span>
                </div>
              )) : <div className="activeStatus"><b>{label(order.status)}</b></div>}
            </div>

            <div className="pickupInfo">
              <b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b>
              <span>{order.items?.map((item) => `${item.productName} · ${item.quantity}`).join('، ') || 'تفاصيل الطلب محفوظة في السيرفر'}</span>
            </div>

            <Link className="outlineCta" href="/orders">عرض الطلبات</Link>
            <Link className="textLink" href="/home">العودة للرئيسية</Link>
          </>
        )}
      </div>
    </AppScreen>
  );
}
