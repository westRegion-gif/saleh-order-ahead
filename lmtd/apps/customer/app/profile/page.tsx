'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AppScreen, BottomNav, Header } from '../_components';
import { CustomerProfile, getMe, updateMe } from '../_api';
import { clearCustomerSession, getCustomerToken } from '../_auth';

export default function Profile() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!getCustomerToken()) {
      setLoading(false);
      return;
    }
    getMe()
      .then((value) => { setProfile(value); setName(value.fullName || ''); })
      .catch(() => { clearCustomerSession(); setProfile(null); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setMessage('');
    try {
      const updated = await updateMe({ fullName: name });
      setProfile(updated);
      setMessage('تم حفظ البيانات');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'تعذر حفظ البيانات');
    }
  }

  function logout() {
    clearCustomerSession();
    setProfile(null);
    setName('');
  }

  return (
    <AppScreen>
      <Header title="حسابي" back="/home" />
      <div className="content" dir="rtl">
        {loading && <p className="muted">جاري تحميل الحساب...</p>}
        {!loading && !profile && (
          <>
            <div className="profileHero"><div className="avatar">L</div><div><h1>حسابك</h1><span>سجل الدخول لحفظ طلباتك ومعلوماتك.</span></div></div>
            <Link className="blackCta" href="/login">تسجيل الدخول <span>←</span></Link>
          </>
        )}
        {profile && (
          <>
            <div className="profileHero"><div className="avatar">{(profile.fullName || 'L').slice(0, 1)}</div><div><h1>{profile.fullName || 'حساب LMTD'}</h1><span>{profile.phone}</span></div></div>
            <div className="formCard">
              <label>الاسم<input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك" /></label>
              <button className="blackCta" type="button" onClick={save}>حفظ <span>✓</span></button>
              {message && <p className="secureNote">{message}</p>}
            </div>
            <button className="outlineCta" type="button" onClick={logout}>تسجيل الخروج</button>
          </>
        )}
        <div className="accountList">
          <Link href="/orders"><span>طلباتي</span><b>←</b></Link>
          <Link href="/favorites"><span>المفضلة</span><b>←</b></Link>
          <Link href="/wallet"><span>المحفظة والمكافآت</span><b>←</b></Link>
          <Link href="/more"><span>الإعدادات والمزيد</span><b>←</b></Link>
        </div>
      </div>
      <BottomNav active="profile" />
    </AppScreen>
  );
}
