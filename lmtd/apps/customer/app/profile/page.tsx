'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, BottomNav, Header } from '../_components';
import { getMe, updateMe } from '../_api';
import { clearCustomerSession, CustomerProfile, readCustomerToken, saveCustomerSession } from '../_auth';
import { LanguageToggle, useLanguage } from '../_language';

export default function Profile() {
  const router = useRouter();
  const { language, dir, setLanguage } = useLanguage();
  const ar = language === 'ar';
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
    const preferredLanguage = String(form.get('preferredLanguage') || language) === 'en' ? 'en' : 'ar';
    setSaving(true);
    setMessage('');
    try {
      const customer = await updateMe({
        fullName: String(form.get('fullName') || ''),
        email: String(form.get('email') || ''),
        preferredLanguage,
      });
      const token = readCustomerToken();
      if (token) saveCustomerSession(token, customer);
      setProfile(customer);
      setLanguage(preferredLanguage);
      setEditing(false);
      setMessage(preferredLanguage === 'ar' ? 'تم حفظ بيانات الحساب.' : 'Account details saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (ar ? 'تعذر تحديث الحساب' : 'Could not update account'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppScreen>
      <Header title="حسابي" titleEn="My account" back="/home" />
      <div className="content" dir={dir}>
        {loading && <p className="muted">{ar ? 'جاري تحميل الحساب...' : 'Loading account...'}</p>}
        {!loading && profile ? (
          <>
            <div className="profileHero">
              <div className="avatar">{(profile.fullName || 'L').slice(0, 1)}</div>
              <div><h1>{profile.fullName || (ar ? 'عميل LMTD' : 'LMTD customer')}</h1><span>{profile.phone || ''}</span></div>
            </div>

            <div className="languageSettingCard">
              <span>{ar ? 'لغة التطبيق' : 'App language'}</span>
              <LanguageToggle />
            </div>

            {editing ? (
              <form className="formCard" onSubmit={save}>
                <label>{ar ? 'الاسم' : 'Name'}<input className="noteBox" name="fullName" defaultValue={profile.fullName || ''} autoComplete="name" placeholder={ar ? 'الاسم الكامل' : 'Full name'} /></label>
                <label>{ar ? 'البريد الإلكتروني' : 'Email'}<input className="noteBox" name="email" type="email" defaultValue={profile.email || ''} autoComplete="email" placeholder="name@example.com" /></label>
                <label>{ar ? 'اللغة المفضلة' : 'Preferred language'}<select className="noteBox" name="preferredLanguage" defaultValue={language}><option value="ar">العربية</option><option value="en">English</option></select></label>
                <button className="blackCta" type="submit" disabled={saving}>{saving ? (ar ? 'جاري الحفظ...' : 'Saving...') : (ar ? 'حفظ التغييرات' : 'Save changes')} <span>←</span></button>
                <button className="outlineCta" type="button" onClick={() => { setEditing(false); setMessage(''); }}>{ar ? 'إلغاء' : 'Cancel'}</button>
              </form>
            ) : (
              <>
                {profile.email && <p className="muted">{profile.email}</p>}
                <button className="outlineCta" type="button" onClick={() => { setEditing(true); setMessage(''); }}>{ar ? 'تعديل بيانات الحساب' : 'Edit account details'}</button>
              </>
            )}

            {message && <p className="muted">{message}</p>}

            <div className="accountList">
              <Link href="/orders"><span>{ar ? 'طلباتي' : 'My orders'}</span><b>←</b></Link>
              <Link href="/favorites"><span>{ar ? 'المفضلة' : 'Favorites'}</span><b>←</b></Link>
              <Link href="/wallet"><span>{ar ? 'المحفظة والمكافآت' : 'Wallet & rewards'}</span><b>←</b></Link>
              <Link href="/more"><span>{ar ? 'الإعدادات والمزيد' : 'Settings & more'}</span><b>←</b></Link>
            </div>
            <button className="outlineCta" type="button" onClick={logout}>{ar ? 'تسجيل الخروج' : 'Sign out'}</button>
          </>
        ) : !loading ? (
          <>
            <div className="profileHero">
              <div className="avatar">L</div>
              <div><h1>{ar ? 'حسابك' : 'Your account'}</h1><span>{ar ? 'سجل الدخول لمشاهدة طلباتك وحسابك.' : 'Sign in to view your orders and account.'}</span></div>
            </div>
            <div className="languageSettingCard"><span>{ar ? 'لغة التطبيق' : 'App language'}</span><LanguageToggle /></div>
            <Link className="blackCta" href="/login">{ar ? 'تسجيل الدخول' : 'Sign in'} <span>←</span></Link>
          </>
        ) : null}
      </div>
      <BottomNav active="profile" />
    </AppScreen>
  );
}
