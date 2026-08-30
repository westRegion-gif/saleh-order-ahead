'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { requestOtp } from '../_api';
import { setPendingPhone } from '../_auth';

export default function Login() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!phone.trim() || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await requestOtp(phone);
      setPendingPhone(result.phone);
      if (result.devCode) localStorage.setItem('lmtd_dev_otp', result.devCode);
      else localStorage.removeItem('lmtd_dev_otp');
      router.push('/verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رمز التحقق');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <Header title="تسجيل الدخول" back="/" />
      <div className="content authPage" dir="rtl">
        <p className="kicker">LMTD COFFEE</p>
        <h1>تسجيل الدخول</h1>
        <p className="muted">استخدم رقم موبايل إماراتي. سنرسل لك رمز تحقق من 6 أرقام.</p>
        <label className="phoneField"><span>+971</span><input inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="50 000 0000" /></label>
        {error && <p className="muted">{error}</p>}
        <button className="blackCta" type="button" onClick={submit} disabled={loading || !phone.trim()}>{loading ? 'جاري الإرسال...' : 'إرسال رمز التحقق'} <span>←</span></button>
        <Link className="outlineCta" href="/branches">المتابعة كضيف</Link>
        <p className="secureNote">الرمز صالح لمدة 5 دقائق.</p>
      </div>
    </AppScreen>
  );
}
