'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { CreatedOrder, getOrders } from '../_api';
import { readCustomerToken } from '../_auth';
import { useLanguage } from '../_language';

function statusLabel(status: string, ar: boolean) {
  const labelsAr: Record<string, string> = {
    PAYMENT_PENDING: 'بانتظار الدفع', PENDING: 'بانتظار قبول الفرع', ACCEPTED: 'تم قبول الطلب', PREPARING: 'جاري التحضير',
    READY: 'جاهز للاستلام', CUSTOMER_ARRIVED: 'تم تسجيل وصولك', COLLECTED: 'تم الاستلام', COMPLETED: 'مكتمل',
    REJECTED: 'مرفوض', CANCELLED: 'ملغي', PAYMENT_FAILED: 'فشل الدفع', REFUNDED: 'تم الاسترجاع',
  };
  const labelsEn: Record<string, string> = {
    PAYMENT_PENDING: 'Awaiting payment', PENDING: 'Waiting for branch acceptance', ACCEPTED: 'Order accepted', PREPARING: 'Preparing',
    READY: 'Ready for pickup', CUSTOMER_ARRIVED: 'Arrival confirmed', COLLECTED: 'Collected', COMPLETED: 'Completed',
    REJECTED: 'Rejected', CANCELLED: 'Cancelled', PAYMENT_FAILED: 'Payment failed', REFUNDED: 'Refunded',
  };
  return (ar ? labelsAr : labelsEn)[status] || status;
}

export default function Orders() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
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
      .catch((err) => setError(err instanceof Error ? err.message : (ar ? 'تعذر تحميل الطلبات' : 'Could not load orders')))
      .finally(() => setLoading(false));
  }, [ar]);

  return (
    <AppScreen>
      <Header title="طلباتي" titleEn="My orders" back="/home" />
      <div className="content" dir={dir}>
        <h1>{ar ? 'طلباتي' : 'My orders'}</h1>
        {loading && <p className="muted">{ar ? 'جاري تحميل طلباتك...' : 'Loading your orders...'}</p>}
        {error && <div className="emptyState"><b>{error}</b></div>}
        {!loading && !readCustomerToken() && (
          <div className="emptyState"><b>{ar ? 'سجل الدخول لعرض طلباتك' : 'Sign in to view your orders'}</b><Link className="blackCta" href="/login">{ar ? 'تسجيل الدخول' : 'Sign in'} <span>←</span></Link></div>
        )}
        {orders.map((order, index) => {
          const branchName = ar ? (order.branch?.nameAr || order.branch?.nameEn) : (order.branch?.nameEn || order.branch?.nameAr);
          return (
            <div className={`orderCard ${index === 0 ? 'current' : ''}`} key={order.id}>
              <div className="orderTop"><span>{order.createdAt ? new Date(order.createdAt).toLocaleString(ar ? 'ar-AE' : 'en-AE') : (ar ? 'طلب' : 'Order')}</span><b>#{order.orderNumber}</b></div>
              <div className="orderState">{statusLabel(order.status, ar)}</div>
              <div className="bill">
                <div><span>{ar ? 'الفرع' : 'Branch'}</span><b>{branchName || 'LMTD Coffee'}</b></div>
                <div><span>{ar ? 'الإجمالي' : 'Total'}</span><b>AED {Number(order.total).toFixed(2)}</b></div>
              </div>
              <Link className="blackCta" href={order.status === 'PAYMENT_PENDING' || order.status === 'PAYMENT_FAILED' ? `/payment?order=${order.id}` : `/tracking?order=${order.id}`}>
                {order.status === 'PAYMENT_PENDING' || order.status === 'PAYMENT_FAILED' ? (ar ? 'إكمال الدفع' : 'Complete payment') : (ar ? 'عرض حالة الطلب' : 'View order status')} <span>←</span>
              </Link>
            </div>
          );
        })}
        {!loading && !error && readCustomerToken() && orders.length === 0 && <div className="emptyState"><b>{ar ? 'لا توجد طلبات بعد' : 'No orders yet'}</b><span>{ar ? 'ستظهر طلباتك الحقيقية هنا بعد أول طلب.' : 'Your orders will appear here after your first purchase.'}</span></div>}
        <Link className="outlineCta" href="/branches">{ar ? 'ابدأ طلباً جديداً' : 'Start a new order'}</Link>
      </div>
      <BottomNav active="orders" />
    </AppScreen>
  );
}
