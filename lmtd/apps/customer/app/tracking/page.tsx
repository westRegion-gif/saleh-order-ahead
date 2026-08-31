'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { API_URL, CreatedOrder, getOrder, OrderStatusSnapshot } from '../_api';
import { readCustomerToken } from '../_auth';
import { useLanguage } from '../_language';

const FLOW = ['PAYMENT_PENDING', 'PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'CUSTOMER_ARRIVED', 'COLLECTED', 'COMPLETED'];
const TERMINAL = new Set(['COMPLETED', 'CANCELLED', 'REJECTED', 'REFUNDED']);
const API_ORIGIN = API_URL.replace(/\/v1$/, '');

declare global { interface Window { io?: any } }

function label(status: string, ar: boolean) {
  const labelsAr: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار تأكيد الدفع', PAYMENT_CONFIRMED: 'تم تأكيد الدفع', PENDING: 'تم استلام الطلب', ACCEPTED: 'تم قبول الطلب',
    PREPARING: 'جاري التحضير', READY: 'جاهز للاستلام', CUSTOMER_ARRIVED: 'تم تسجيل وصولك', COLLECTED: 'تم الاستلام', COMPLETED: 'اكتمل الطلب',
    REJECTED: 'تم رفض الطلب', CANCELLED: 'تم إلغاء الطلب', PAYMENT_FAILED: 'فشل الدفع', REFUNDED: 'تم استرجاع المبلغ',
  };
  const labelsEn: Record<string, string> = {
    PAYMENT_PENDING: 'Awaiting payment confirmation', PAYMENT_CONFIRMED: 'Payment confirmed', PENDING: 'Order received', ACCEPTED: 'Order accepted',
    PREPARING: 'Preparing your order', READY: 'Ready for pickup', CUSTOMER_ARRIVED: 'Arrival confirmed', COLLECTED: 'Collected', COMPLETED: 'Order completed',
    REJECTED: 'Order rejected', CANCELLED: 'Order cancelled', PAYMENT_FAILED: 'Payment failed', REFUNDED: 'Payment refunded',
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

async function loadSocketClient() {
  if (window.io) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lmtd-socket]');
    if (existing) {
      if (window.io) { resolve(); return; }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('socket load failed')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = `${API_ORIGIN}/socket.io/socket.io.js`;
    script.async = true;
    script.dataset.lmtdSocket = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('socket load failed'));
    document.head.appendChild(script);
  });
}

export default function Tracking() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [orderId, setOrderId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [realtime, setRealtime] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [arrivalBusy, setArrivalBusy] = useState(false);
  const previousStatus = useRef('');

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
    if (typeof Notification !== 'undefined') setNotificationsEnabled(Notification.permission === 'granted');
  }, [router, ar]);

  const refreshOrder = useCallback(async () => {
    if (!orderId) return null;
    try {
      const next = await getOrder(orderId);
      const old = previousStatus.current;
      previousStatus.current = next.status;
      setOrder(next);
      setError('');
      setLoading(false);
      if (old && old !== next.status && typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        new Notification(label(next.status, ar), { body: ar ? `طلبك #${next.orderNumber} تم تحديثه.` : `Order #${next.orderNumber} was updated.` });
      }
      if (old && old !== next.status && navigator.vibrate) navigator.vibrate(80);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر تحميل الطلب' : 'Could not load order'));
      setLoading(false);
      return null;
    }
  }, [orderId, ar]);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      const next = await refreshOrder();
      if (!active) return;
      if (!next || !TERMINAL.has(next.status)) timer = setTimeout(loop, realtime ? 30000 : 12000);
    };
    void loop();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [orderId, refreshOrder, realtime]);

  useEffect(() => {
    if (!orderId) return;
    const token = readCustomerToken();
    if (!token) return;
    let socket: any;
    let cancelled = false;
    (async () => {
      try {
        await loadSocketClient();
        if (cancelled || !window.io) return;
        socket = window.io(API_ORIGIN, { path: '/socket.io', auth: { token }, transports: ['websocket', 'polling'] });
        socket.on('connect', () => setRealtime(true));
        socket.on('disconnect', () => setRealtime(false));
        socket.on('connect_error', () => setRealtime(false));
        socket.on('order:update', (payload: { id?: string }) => { if (payload?.id === orderId) void refreshOrder(); });
      } catch { setRealtime(false); }
    })();
    return () => { cancelled = true; socket?.disconnect?.(); };
  }, [orderId, refreshOrder]);

  async function enableNotifications() {
    if (typeof Notification === 'undefined') { setError(ar ? 'الإشعارات غير مدعومة على هذا الجهاز.' : 'Notifications are not supported on this device.'); return; }
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
    if (permission !== 'granted') setError(ar ? 'لم يتم السماح بإشعارات الطلب.' : 'Order notifications were not allowed.');
  }

  async function markArrived() {
    if (!order || arrivalBusy) return;
    const token = readCustomerToken();
    if (!token) return;
    setArrivalBusy(true); setError('');
    try {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(order.id)}/arrived`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(Array.isArray(body?.message) ? body.message.join('، ') : body?.message || (ar ? 'تعذر تسجيل وصولك' : 'Could not confirm arrival'));
      }
      await refreshOrder();
    } catch (err) { setError(err instanceof Error ? err.message : (ar ? 'تعذر تسجيل وصولك' : 'Could not confirm arrival')); }
    finally { setArrivalBusy(false); }
  }

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
            <p className="eta">{realtime ? (ar ? 'متصل بالتحديث المباشر.' : 'Live updates connected.') : (ar ? 'يتم تحديث الحالة تلقائياً من السيرفر.' : 'Status updates automatically from the server.')}</p>

            {order.status === 'PAYMENT_FAILED' && <Link className="blackCta" href={`/payment?order=${order.id}`}>{ar ? 'إعادة محاولة الدفع' : 'Retry payment'} <span>←</span></Link>}
            {order.status === 'READY' && order.pickupMethod === 'VEHICLE' && <button className="blackCta" type="button" onClick={markArrived} disabled={arrivalBusy}>{arrivalBusy ? (ar ? 'جاري تسجيل الوصول...' : 'Confirming arrival...') : (ar ? 'أنا وصلت' : "I'm here")} <span>✓</span></button>}
            {!TERMINAL.has(order.status) && !notificationsEnabled && <button className="outlineCta" type="button" onClick={enableNotifications}>{ar ? 'تفعيل إشعارات الطلب' : 'Enable order notifications'}</button>}

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
                return <div key={entry.id} className={index === displayHistory.length - 1 ? 'activeStatus' : 'doneStatus'}><b>{label(status, ar)}</b><span>{new Date(entry.createdAt).toLocaleString(ar ? 'ar-AE' : 'en-AE')}</span></div>;
              }) : <div className="activeStatus"><b>{label(order.status, ar)}</b></div>}
            </div>

            <div className="pickupInfo"><b>{branchName || 'LMTD Coffee'}</b><span>{order.items?.map((item) => `${item.productName} · ${item.quantity}`).join(ar ? '، ' : ', ') || (ar ? 'تفاصيل الطلب محفوظة في السيرفر' : 'Order details are saved on the server')}</span></div>
            <Link className="outlineCta" href="/orders">{ar ? 'عرض الطلبات' : 'View orders'}</Link>
            <Link className="textLink" href="/home">{ar ? 'العودة للرئيسية' : 'Back to home'}</Link>
          </>
        )}
      </div>
    </AppScreen>
  );
}
