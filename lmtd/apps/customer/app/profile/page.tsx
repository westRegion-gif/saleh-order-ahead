'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav, Header } from '../_components';
import { getMe } from '../_api';
import { clearCustomerSession, CustomerProfile, readCustomerToken, saveCustomerSession } from '../_auth';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!readCustomerToken()) {
      setLoading(false);
      return;
    }
    getMe()
      .then((customer) => {
        setProfile(customer);
        const token = readCustomerToken();
        if (token) saveCustomerSession(token, customer);
      })
      .catch(() => {
        clearCustomerSession();
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function logout() {
    clearCustomerSession();
    router.replace('/');
  }

  return (
    <AppScreen>
      <Header title="حسابي" back="/home" />
      <div className="content" dir="rtl">
        {loading && <p className="muted">جاري تحميل الحساب...</p>}
        {!loading && profile ? (
          <>
            <div className="profileHero">
              <div className="avatar">{(profile.fullName || 'L').slice(0, 1)}</div>
              <div><h1>{profile.fullName || 'عميل LMTD'}</h1><span>{profile.phone || ''}</span></div>
            </div>
            <div className="accountList">
              <Link href="/orders"><span>طلباتي</span><b>←</b></Link>
              <Link href="/favorites"><span>المفضلة</span><b>←</b></Link>
              <Link href="/wallet"><span>المحفظة والمكافآت</span><b>←</b></Link>
              <Link href="/more"><span>الإعدادات والمزيد</span><b>←</b></Link>
            </div>
            <button className="outlineCta" type="button" onClick={logout}>تسجيل الخروج</button>
          </>
        ) : !loading ? (
          <>
            <div className="profileHero">
              <div className="avatar">L</div>
              <div><h1>حسابك</h1><span>سجل الدخول لمشاهدة طلباتك وحسابك.</span></div>
            </div>
            <Link className="blackCta" href="/login">تسجيل الدخول <span>←</span></Link>
          </>
        ) : null}
      </div>
      <BottomNav active="profile" />
    </AppScreen>
  );
}
