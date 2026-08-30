'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { verifyOtp } from '../_api';
import { saveCustomerSession } from '../_auth';

export default function Verify() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const value = sessionStorage.getItem('lmtd_login_phone') || '';
    if (!value) router.replace('/login');
    else setPhone(value);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('أدخل رمز التحقق المكون من 6 أرقام');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await verifyOtp(phone, code);
      saveCustomerSession(result.accessToken, result.customer);
      sessionStorage.removeItem('lmtd_login_phone');
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التحقق من الرمز');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppScreen>
      <Header title="التحقق" back="/login" />
      <form className="content authPage" dir="rtl" onSubmit={submit}>
        <p className="kicker">OTP VERIFICATION</p>
        <h1>رمز التحقق</h1>
        <p className="muted">أدخل الرمز المرسل إلى {phone || 'رقم هاتفك'}.</p>
        <input className="noteBox" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
        {error && <p className="muted">{error}</p>}
        <button className="blackCta" type="submit" disabled={busy || !phone}>{busy ? 'جاري التحقق...' : 'تأكيد الرمز'} <span>←</span></button>
        <Link className="textLink" href="/login">تغيير رقم الهاتف</Link>
      </form>
    </AppScreen>
  );
}
