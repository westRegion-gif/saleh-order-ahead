'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, createPaymentIntent, getOrder } from '../_api';
import { readCustomerToken } from '../_auth';

function paymentKey(orderId: string) {
  const key = `lmtd_payment_key_${orderId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, value);
  return value;
}

async function loadStripeJs() {
  if ((window as any).Stripe) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lmtd-stripe]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('تعذر تحميل بوابة الدفع')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.dataset.lmtdStripe = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('تعذر تحميل بوابة الدفع'));
    document.head.appendChild(script);
  });
}

export default function Payment() {
  const router = useRouter();
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentReady, setPaymentReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const stripeRef = useRef<any>(null);
  const elementsRef = useRef<any>(null);
  const mountedOrderRef = useRef('');

  useEffect(() => {
    if (!readCustomerToken()) {
      sessionStorage.setItem('lmtd_login_return', window.location.pathname + window.location.search);
      router.replace('/login');
      return;
    }
    const search = new URLSearchParams(window.location.search);
    let orderId = search.get('order') || '';
    if (!orderId) {
      try {
        const pending = JSON.parse(localStorage.getItem('lmtd_pending_order') || 'null') as { id?: string } | null;
        orderId = pending?.id || '';
      } catch { orderId = ''; }
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
  }, [router]);

  useEffect(() => {
    if (!order || mountedOrderRef.current === order.id) return;
    if (!['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) {
      if (['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'COMPLETED'].includes(order.status)) router.replace(`/tracking?order=${order.id}`);
      return;
    }
    mountedOrderRef.current = order.id;
    let cancelled = false;
    (async () => {
      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
        if (!publishableKey) throw new Error('بوابة الدفع غير مفعلة في إعدادات التطبيق بعد');
        const intent = await createPaymentIntent(order.id, paymentKey(order.id));
        await loadStripeJs();
        if (cancelled) return;
        const stripe = (window as any).Stripe(publishableKey);
        const elements = stripe.elements({ clientSecret: intent.clientSecret, appearance: { theme: 'stripe' } });
        const paymentElement = elements.create('payment', { layout: 'tabs' });
        paymentElement.mount('#lmtd-payment-element');
        stripeRef.current = stripe;
        elementsRef.current = elements;
        setPaymentReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'تعذر تجهيز الدفع');
      }
    })();
    return () => { cancelled = true; };
  }, [order, router]);

  async function pay() {
    if (!order || !stripeRef.current || !elementsRef.current) return;
    setPaying(true);
    setError('');
    try {
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: `${window.location.origin}/tracking?order=${order.id}` },
      });
      if (result?.error) setError(result.error.message || 'تعذر إتمام الدفع');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إتمام الدفع');
    } finally {
      setPaying(false);
    }
  }

  const total = Number(order?.total || 0);

  return (
    <AppScreen>
      <Header title="الدفع" back="/orders" />
      <div className="content" dir="rtl">
        <p className="kicker">SECURE CHECKOUT</p>
        <h1>إتمام الطلب</h1>
        {loading && <div className="checkoutSummary"><b>جاري تحميل الطلب...</b></div>}
        {order && (
          <div className="checkoutSummary">
            <div><span>رقم الطلب</span><b>{order.orderNumber}</b></div>
            <div><span>الفرع</span><b>{order.branch?.nameAr || order.branch?.nameEn || 'LMTD Coffee'}</b></div>
            <div><span>الاستلام</span><b>{order.pickupMethod === 'VEHICLE' ? 'استلام من السيارة' : 'استلام من الكاونتر'}</b></div>
            <div><span>الحالة</span><b>{order.status === 'PAYMENT_FAILED' ? 'فشل الدفع — حاول مرة أخرى' : 'بانتظار الدفع'}</b></div>
          </div>
        )}

        {error && <div className="emptyState"><b>{error}</b></div>}
        <div id="lmtd-payment-element" className="formCard" style={{ minHeight: 80 }} />

        {order && (
          <div className="bill">
            <div><span>المجموع الفرعي</span><b>AED {Number(order.subtotal).toFixed(2)}</b></div>
            <div><span>الخصم</span><b>AED {Number(order.discountTotal).toFixed(2)}</b></div>
            <div><span>الضريبة</span><b>AED {Number(order.taxTotal).toFixed(2)}</b></div>
            <div className="total"><span>الإجمالي</span><b>AED {total.toFixed(2)}</b></div>
          </div>
        )}

        <button className="blackCta" type="button" disabled={!paymentReady || paying || !order} onClick={pay}>
          {paying ? 'جاري تأكيد الدفع...' : 'ادفع الآن'} <span>AED {total.toFixed(2)}</span>
        </button>
        <p className="secureNote">يتم تأكيد الطلب فقط بعد استلام Webhook ناجح من مزود الدفع.</p>
      </div>
    </AppScreen>
  );
}
