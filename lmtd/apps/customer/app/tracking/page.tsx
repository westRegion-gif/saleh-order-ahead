'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { CreatedOrder, getOrder, OrderStatusSnapshot } from '../_api';
import { readCustomerToken } from '../_auth';

const FLOW = ['PAYMENT_PENDING', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COLLECTED', 'COMPLETED'];
const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED']);

function label(status: string) {
  const labels: Record<string, string> = {
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
  return labels[status] || status;
}

type DisplayStatus = OrderStatusSnapshot & { displayStatus?: string };

function buildDisplayHistory(history: OrderStatusSnapshot[]): DisplayStatus[] {
  const output: DisplayStatus[] = [];
  let sawPaymentPending = false;

  for (const entry of history) {
    if (entry.status === 'PAYMENT_PENDING') sawPaymentPending = true;

    if (entry.status === 'PENDING' && sawPaymentPending) {
      output.push({
        ...entry,
        id: `${entry.id}-payment-confirmed`,
        displayStatus: 'PAYMENT_CONFIRMED',
      });
      sawPaymentPending = false;
    }

    output.push(entry);
  }

  return output;
}

export default function Tracking() {
  const router = useRouter();
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
      setError('لا يوجد طلب للتتبع.');
      setLoading(false);
      return;
    }
    setOrderId(id);
  }, [router]);

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
        setError(err instanceof Error ? err.message : 'تعذر تحميل الطلب');
        setLoading(false);
        timer = setTimeout(refresh, 8000);
      }
    };
    refresh();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderId]);

  const currentIndex = useMemo(() => order ? FLOW.indexOf(order.status) : -1, [order]);
  const history = order?.statusHistory || [];
  const displayHistory = useMemo(() => buildDisplayHistory(history), [history]);

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
            <p className="eta">يتم تحديث الحالة تلقائياً من السيرفر.</p>

            {order.status === 'PAYMENT_FAILED' && <Link className="blackCta" href={`/payment?order=${order.id}`}>إعادة محاولة الدفع <span>←</span></Link>}

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
                    <b>{label(status)}</b>
                    <span>{new Date(entry.createdAt).toLocaleString('ar-AE')}</span>
                  </div>
                );
              }) : <div className="activeStatus"><b>{label(order.status)}</b></div>}
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
