'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, createPaymentIntent, getOrder } from '../_api';
import { readCustomerToken } from '../_auth';
import { useLanguage } from '../_language';

function paymentStorageKey(orderId: string) {
  return `lmtd_payment_key_${orderId}`;
}

function paymentKey(orderId: string) {
  const key = paymentStorageKey(orderId);
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, value);
  return value;
}

async function loadStripeJs(ar: boolean) {
  if ((window as any).Stripe) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lmtd-stripe]');
    if (existing) {
      if ((window as any).Stripe) { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(ar ? 'تعذر تحميل بوابة الدفع' : 'Could not load payment gateway')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.dataset.lmtdStripe = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(ar ? 'تعذر تحميل بوابة الدفع' : 'Could not load payment gateway'));
    document.head.appendChild(script);
  });
}

export default function Payment() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
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
      setError(ar ? 'لا يوجد طلب جاهز للدفع.' : 'There is no order ready for payment.');
      setLoading(false);
      return;
    }
    getOrder(orderId)
      .then((next) => {
        setOrder(next);
        if (!['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(next.status)) {
          localStorage.removeItem(paymentStorageKey(next.id));
          router.replace(`/tracking?order=${next.id}`);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : (ar ? 'تعذر تحميل الطلب' : 'Could not load order')))
      .finally(() => setLoading(false));
  }, [router, ar]);

  useEffect(() => {
    if (!order || mountedOrderRef.current === order.id) return;
    if (!['PAYMENT_PENDING', 'PAYMENT_FAILED'].includes(order.status)) return;
    mountedOrderRef.current = order.id;
    let cancelled = false;
    (async () => {
      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
        if (!publishableKey) throw new Error(ar ? 'بوابة الدفع غير مفعلة في إعدادات التطبيق بعد' : 'Payment gateway is not enabled yet');
        const intent = await createPaymentIntent(order.id, paymentKey(order.id));

        if (intent.status === 'succeeded') {
          localStorage.removeItem(paymentStorageKey(order.id));
          router.replace(`/tracking?order=${order.id}`);
          return;
        }

        await loadStripeJs(ar);
        if (cancelled) return;
        const stripe = (window as any).Stripe(publishableKey);
        if (!stripe) throw new Error(ar ? 'تعذر تشغيل بوابة الدفع' : 'Could not start payment gateway');
        const elements = stripe.elements({ clientSecret: intent.clientSecret, appearance: { theme: 'stripe' }, locale: ar ? 'ar' : 'en' });
        const paymentElement = elements.create('payment', {
          layout: 'tabs',
          wallets: { applePay: 'auto', googlePay: 'auto' },
        });
        paymentElement.mount('#lmtd-payment-element');
        paymentElement.on('ready', () => { if (!cancelled) setPaymentReady(true); });
        paymentElement.on('loaderror', (event: any) => { if (!cancelled) setError(event?.error?.message || (ar ? 'تعذر تحميل خيارات الدفع' : 'Could not load payment options')); });
        stripeRef.current = stripe;
        elementsRef.current = elements;
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : (ar ? 'تعذر تجهيز الدفع' : 'Could not prepare payment'));
      }
    })();
    return () => { cancelled = true; };
  }, [order, router, ar]);

  async function pay() {
    if (!order || !stripeRef.current || !elementsRef.current || paying) return;
    setPaying(true);
    setError('');
    try {
      const result = await stripeRef.current.confirmPayment({
        elements: elementsRef.current,
        confirmParams: { return_url: `${window.location.origin}/tracking?order=${order.id}` },
        redirect: 'if_required',
      });
      if (result?.error) {
        setError(result.error.message || (ar ? 'تعذر إتمام الدفع' : 'Could not complete payment'));
        return;
      }
      router.replace(`/tracking?order=${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر إتمام الدفع' : 'Could not complete payment'));
    } finally {
      setPaying(false);
    }
  }

  const total = Number(order?.total || 0);
  const branchName = order ? (ar ? (order.branch?.nameAr || order.branch?.nameEn) : (order.branch?.nameEn || order.branch?.nameAr)) : 'LMTD Coffee';

  return (
    <AppScreen>
      <Header title="الدفع" titleEn="Payment" back="/orders" />
      <div className="content" dir={dir}>
        <p className="kicker">SECURE CHECKOUT</p>
        <h1>{ar ? 'إتمام الطلب' : 'Complete your order'}</h1>
        {loading && <div className="checkoutSummary"><b>{ar ? 'جاري تحميل الطلب...' : 'Loading order...'}</b></div>}
        {order && (
          <div className="checkoutSummary">
            <div><span>{ar ? 'رقم الطلب' : 'Order number'}</span><b>{order.orderNumber}</b></div>
            <div><span>{ar ? 'الفرع' : 'Branch'}</span><b>{branchName || 'LMTD Coffee'}</b></div>
            <div><span>{ar ? 'الاستلام' : 'Pickup'}</span><b>{order.pickupMethod === 'VEHICLE' ? (ar ? 'استلام من السيارة' : 'Vehicle pickup') : (ar ? 'استلام من الكاونتر' : 'Counter pickup')}</b></div>
            <div><span>{ar ? 'الحالة' : 'Status'}</span><b>{order.status === 'PAYMENT_FAILED' ? (ar ? 'فشل الدفع — حاول مرة أخرى' : 'Payment failed — try again') : (ar ? 'بانتظار الدفع' : 'Awaiting payment')}</b></div>
          </div>
        )}

        {error && <div className="emptyState"><b>{error}</b></div>}
        <div id="lmtd-payment-element" className="formCard" style={{ minHeight: 80 }} />
        <p className="secureNote">{ar ? 'يظهر Apple Pay تلقائياً على الأجهزة والمتصفحات المؤهلة بعد التحقق من نطاق LMTD لدى Stripe.' : 'Apple Pay appears automatically on eligible devices and browsers once the LMTD domain is verified with Stripe.'}</p>

        {order && (
          <div className="bill">
            <div><span>{ar ? 'المجموع الفرعي' : 'Subtotal'}</span><b>AED {Number(order.subtotal).toFixed(2)}</b></div>
            <div><span>{ar ? 'الخصم' : 'Discount'}</span><b>AED {Number(order.discountTotal).toFixed(2)}</b></div>
            <div><span>{ar ? 'الضريبة' : 'Tax'}</span><b>AED {Number(order.taxTotal).toFixed(2)}</b></div>
            <div className="total"><span>{ar ? 'الإجمالي' : 'Total'}</span><b>AED {total.toFixed(2)}</b></div>
          </div>
        )}

        <button className="blackCta" type="button" disabled={!paymentReady || paying || !order} onClick={pay}>
          {paying ? (ar ? 'جاري تأكيد الدفع...' : 'Confirming payment...') : (ar ? 'ادفع الآن' : 'Pay now')} <span>AED {total.toFixed(2)}</span>
        </button>
        <p className="secureNote">{ar ? 'يتم تأكيد الطلب فقط بعد استلام Webhook ناجح من مزود الدفع.' : 'The order is confirmed only after a successful payment webhook is received.'}</p>
      </div>
    </AppScreen>
  );
}
