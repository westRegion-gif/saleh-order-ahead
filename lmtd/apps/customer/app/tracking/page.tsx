'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, getOrder, OrderStatusSnapshot } from '../_api';
import { readCustomerToken } from '../_auth';
import { useLanguage } from '../_language';

const FLOW = ['PAYMENT_PENDING', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'COMPLETED'];
const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED']);

function label(status: string, ar: boolean) {
  const labelsAr: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار تأكيد الدفع',
    PAYMENT_CONFIRMED: 'تم تأكيد الدفع',
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
  const labelsEn: Record<string, string> = {
    PAYMENT_PENDING: 'Awaiting payment confirmation',
    PAYMENT_CONFIRMED: 'Payment confirmed',
    PENDING: 'Order received',
    ACCEPTED: 'Order accepted',
    PREPARING: 'Preparing your order',
    READY: 'Ready for pickup',
    CUSTOMER_ARRIVED: 'Arrival confirmed',
    COLLECTED: 'Collected',
    COMPLETED: 'Order completed',
    REJECTED: 'Order rejected',
    CANCELLED: 'Order cancelled',
    PAYMENT_FAILED: 'Payment failed',
    REFUNDED: 'Payment refunded',
  };
  return (ar ? labelsAr : labelsEn)[status] || status;
}

type DisplayStatus = OrderStatusSnapshot & { displayStatus?: string };

function buildDisplayHistory(history: OrderStatusSnapshot[]): DisplayStatus[] {
  const output: DisplayStatus[] = [];
  let sawPaymentPending = false;
  for (const entry of history) {
    if (entry.status === 'PAYMENT_PENDING') sawPaymentPending = true;
    if (entry.status === 'PENDING' && sawPaymentPending) {
      output.push({ ...entry, id: `${entry.id}-payment-confirmed`, displayStatus: 'PAYMENT_CONFIRMED' });
      sawPaymentPending = false;
    }
    output.push(entry);
  }
  return output;
}

export default function Tracking() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!readCustomerToken()) {
      sessionStorage.setItem('lmtd_login_return', window.location.pathname + window.location.search);
      router.replace('/login');
      return;
    }
    const search = new URLSearchParams(window.location.search);
    let id = search.get('order') || '';
    if (!id) {
      try {
        const pending = JSON.parse(localStorage.getItem('lmtd_pending_order') || 'null') as { id?: string } | null;
        id = pending?.id || '';
      } catch { id = ''; }
    }
    if (!id) {
      setError(ar ? 'لا يوجد طلب للتتبع.' : 'There is no order to track.');
      setLoading(false);
      return;
    }
    setOrderId(id);
  }, [router, ar]);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      try {
        const next = await getOrder(orderId);
        if (!active) return;
        setOrder(next);
        setError('');
        setLoading(false);
        if (!TERMINAL.has(next.status)) timer = setTimeout(refresh, 4000);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : (ar ? 'تعذر تحميل الطلب' : 'Could not load order'));
        setLoading(false);
        timer = setTimeout(refresh, 8000);
      }
    };
    refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderId, ar]);

  const currentIndex = useMemo(() => order ? FLOW.indexOf(order.status) : -1, [order]);
  const history = order?.statusHistory || [];
  const displayHistory = useMemo(() => buildDisplayHistory(history), [history]);
  const branchName = order ? (ar ? (order.branch?.nameAr || order.branch?.nameEn) : (order.branch?.nameEn || order.branch?.nameAr)) : 'LMTD Coffee';

  return (
    <AppScreen>
      <Header title="طلبك" titleEn="Your order" back="/orders" />
      <div className="content trackingPage" dir={dir}>
        {loading && <p className="muted">{ar ? 'جاري تحميل حالة الطلب...' : 'Loading order status...'}</p>}
        {error && <div className="emptyState"><b>{error}</b></div>}
        {order && (
          <>
            <p className="kicker">ORDER #{order.orderNumber}</p>
            <h1>{label(order.status, ar)}</h1>
            <p className="eta">{ar ? 'يتم تحديث الحالة تلقائياً من السيرفر.' : 'Status updates automatically from the server.'}</p>

            {order.status === 'PAYMENT_FAILED' && <Link className="blackCta" href={`/payment?order=${order.id}`}>{ar ? 'إعادة محاولة الدفع' : 'Retry payment'} <span>←</span></Link>}

            {currentIndex >= 0 && (
              <div className="progressLine">
                {[0, 1, 2, 3].map((step) => {
                  const scaledIndex = Math.floor((currentIndex / Math.max(1, FLOW.length - 1)) * 3);
                  return <i key={step} className={step < scaledIndex ? 'done' : step === scaledIndex ? 'active' : ''} />;
                })}
              </div>
            )}

            <div className="statusList">
              {displayHistory.length > 0 ? displayHistory.map((entry, index) => {
                const status = entry.displayStatus || entry.status;
                return (
                  <div key={entry.id} className={index === displayHistory.length - 1 ? 'activeStatus' : 'doneStatus'}>
                    <b>{label(status, ar)}</b>
                    <span>{new Date(entry.createdAt).toLocaleString(ar ? 'ar-AE' : 'en-AE')}</span>
                  </div>
                );
              }) : <div className="activeStatus"><b>{label(order.status, ar)}</b></div>}
            </div>

            <div className="pickupInfo">
              <b>{branchName || 'LMTD Coffee'}</b>
              <span>{order.items?.map((item) => `${item.productName} · ${item.quantity}`).join(ar ? '، ' : ', ') || (ar ? 'تفاصيل الطلب محفوظة في السيرفر' : 'Order details are saved on the server')}</span>
            </div>

            <Link className="outlineCta" href="/orders">{ar ? 'عرض الطلبات' : 'View orders'}</Link>
            <Link className="textLink" href="/home">{ar ? 'العودة للرئيسية' : 'Back to home'}</Link>
          </>
        )}
      </div>
    </AppScreen>
  );
}
