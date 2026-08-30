'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { requestOtp } from '../_api';
import { useLanguage } from '../_language';

export default function Login() {
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const local = phone.replace(/\D/g, '');
    if (!/^5\d{8}$/.test(local)) {
      setError(ar ? 'أدخل رقم إماراتي صحيح مثل 50 123 4567' : 'Enter a valid UAE mobile number, e.g. 50 123 4567');
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
      setError(err instanceof Error ? err.message : (ar ? 'تعذر إرسال رمز التحقق' : 'Could not send verification code'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <Header title="تسجيل الدخول" titleEn="Sign in" back="/" />
      <form className="content authPage" dir={dir} onSubmit={submit}>
        <p className="kicker">LMTD COFFEE</p>
        <h1>{ar ? 'تسجيل الدخول' : 'Sign in'}</h1>
        <p className="muted">{ar ? 'سنرسل رمز تحقق من 6 أرقام إلى رقم هاتفك الإماراتي.' : 'We will send a 6-digit verification code to your UAE mobile number.'}</p>
        <label className="phoneField"><span>+971</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="50 123 4567" /></label>
        {error && <p className="muted">{error}</p>}
        <button className="blackCta" type="submit" disabled={busy}>{busy ? (ar ? 'جاري الإرسال...' : 'Sending...') : (ar ? 'إرسال رمز التحقق' : 'Send verification code')} <span>←</span></button>
        <Link className="outlineCta" href="/branches">{ar ? 'تصفح المنيو' : 'Browse menu'}</Link>
        <p className="secureNote">{ar ? 'يلزم تسجيل الدخول قبل إنشاء الطلب والدفع.' : 'Sign in is required before creating and paying for an order.'}</p>
      </form>
    </AppScreen>
  );
}
