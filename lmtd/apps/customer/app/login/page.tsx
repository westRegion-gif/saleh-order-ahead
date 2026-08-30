'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { requestOtp } from '../_api';

export default function Login() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = phone.replace(/\D/g, '');
    if (!/^5\d{8}$/.test(local)) {
      setError('أدخل رقم إماراتي صحيح مثل 50 123 4567');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const normalized = `+971${local}`;
      await requestOtp(normalized);
      sessionStorage.setItem('lmtd_login_phone', normalized);
      router.push('/verify');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إرسال رمز التحقق');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <Header title="تسجيل الدخول" back="/" />
      <form className="content authPage" dir="rtl" onSubmit={submit}>
        <p className="kicker">LMTD COFFEE</p>
        <h1>تسجيل الدخول</h1>
        <p className="muted">سنرسل رمز تحقق من 6 أرقام إلى رقم هاتفك الإماراتي.</p>
        <label className="phoneField"><span>+971</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="50 123 4567" /></label>
        {error && <p className="muted">{error}</p>}
        <button className="blackCta" type="submit" disabled={busy}>{busy ? 'جاري الإرسال...' : 'إرسال رمز التحقق'} <span>←</span></button>
        <Link className="outlineCta" href="/branches">تصفح المنيو</Link>
        <p className="secureNote">يلزم تسجيل الدخول قبل إنشاء الطلب والدفع.</p>
      </form>
    </AppScreen>
  );
}
