'use client';

import { useEffect, useState } from 'react';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, getOrder } from '../_api';

export default function Payment() {
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
      setError('لا يوجد طلب جاهز للدفع.');
      setLoading(false);
      return;
    }

    getOrder(orderId)
      .then(setOrder)
      .catch((err) => setError(err instanceof Error ? err.message : 'تعذر تحميل الطلب'))
      .finally(() => setLoading(false));
  }, []);

  const total = Number(order?.total || 0);

  return (
    <AppScreen>
      <Header title="الدفع" back="/pickup" />
      <div className="content" dir="rtl">
        <p className="kicker">CHECKOUT</p>
        <h1>إتمام الطلب</h1>

        {loading && <div className="checkoutSummary"><b>جاري تحميل الطلب...</b></div>}
        {error && <div className="checkoutSummary"><b>{error}</b></div>}
        {order && (
          <div className="checkoutSummary">
            <div><span>رقم الطلب</span><b>{order.orderNumber}</b></div>
            <div><span>الفرع</span><b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b></div>
            <div><span>الاستلام</span><b>{order.pickupMethod === 'VEHICLE' ? 'استلام من السيارة' : 'استلام من الكاونتر'}</b></div>
            <div><span>الحالة</span><b>{order.status === 'PAYMENT_PENDING' ? 'بانتظار الدفع' : order.status}</b></div>
          </div>
        )}

        <h3>طريقة الدفع</h3>
        <label className="payCard selectedPay">
          <div><span className="cardGlyph">▰</span><span><b>بطاقة بنكية</b><small>سيتم ربط بوابة الدفع في الخطوة التالية</small></span></div>
          <input type="radio" name="pay" defaultChecked disabled />
        </label>
        <label className="payCard">
          <div><span className="cardGlyph">◉</span><span><b>Apple Pay</b><small>سيتم تفعيله مع مزود الدفع</small></span></div>
          <input type="radio" name="pay" disabled />
        </label>

        {order && (
          <div className="bill">
            <div><span>المجموع الفرعي</span><b>AED {Number(order.subtotal).toFixed(2)}</b></div>
            <div><span>الخصم</span><b>AED {Number(order.discountTotal).toFixed(2)}</b></div>
            <div><span>الضريبة</span><b>AED {Number(order.taxTotal).toFixed(2)}</b></div>
            <div className="total"><span>الإجمالي</span><b>AED {total.toFixed(2)}</b></div>
          </div>
        )}

        <button className="blackCta" type="button" disabled>الدفع غير مفعل بعد <span>AED {total.toFixed(2)}</span></button>
        <p className="secureNote">لن يتم تأكيد الطلب أو إرساله للتجهيز قبل نجاح الدفع.</p>
      </div>
    </AppScreen>
  );
}
