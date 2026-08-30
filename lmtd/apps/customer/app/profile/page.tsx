'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav, Header } from '../_components';
import { getMe, updateMe } from '../_api';
import { clearCustomerSession, CustomerProfile, readCustomerToken, saveCustomerSession } from '../_auth';

export default function Profile() {
  const router = useRouter();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage('');
    try {
      const customer = await updateMe({
        fullName: String(form.get('fullName') || ''),
        email: String(form.get('email') || ''),
        preferredLanguage: String(form.get('preferredLanguage') || 'ar') === 'en' ? 'en' : 'ar',
      });
      const token = readCustomerToken();
      if (token) saveCustomerSession(token, customer);
      setProfile(customer);
      setEditing(false);
      setMessage('تم حفظ بيانات الحساب.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'تعذر تحديث الحساب');
    } finally {
      setSaving(false);
    }
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

            {editing ? (
              <form className="formCard" onSubmit={save}>
                <label>الاسم<input className="noteBox" name="fullName" defaultValue={profile.fullName || ''} autoComplete="name" placeholder="الاسم الكامل" /></label>
                <label>البريد الإلكتروني<input className="noteBox" name="email" type="email" defaultValue={profile.email || ''} autoComplete="email" placeholder="name@example.com" /></label>
                <label>اللغة المفضلة<select className="noteBox" name="preferredLanguage" defaultValue={profile.preferredLanguage || 'ar'}><option value="ar">العربية</option><option value="en">English</option></select></label>
                <button className="blackCta" type="submit" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ التغييرات'} <span>←</span></button>
                <button className="outlineCta" type="button" onClick={() => { setEditing(false); setMessage(''); }}>إلغاء</button>
              </form>
            ) : (
              <>
                {profile.email && <p className="muted">{profile.email}</p>}
                <button className="outlineCta" type="button" onClick={() => { setEditing(true); setMessage(''); }}>تعديل بيانات الحساب</button>
              </>
            )}

            {message && <p className="muted">{message}</p>}

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
