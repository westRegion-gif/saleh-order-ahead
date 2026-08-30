'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { requestOtp, verifyOtp } from '../_api';
import { saveCustomerSession } from '../_auth';

export default function Verify() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIn, setResendIn] = useState(60);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const value = sessionStorage.getItem('lmtd_login_phone') || '';
    if (!value) router.replace('/login');
    else setPhone(value);
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setInterval(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendIn]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError('أدخل رمز التحقق المكون من 6 أرقام');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await verifyOtp(phone, code);
      saveCustomerSession(result.accessToken, result.customer);
      sessionStorage.removeItem('lmtd_login_phone');
      const destination = sessionStorage.getItem('lmtd_login_return') || '/home';
      sessionStorage.removeItem('lmtd_login_return');
      router.replace(destination.startsWith('/') ? destination : '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر التحقق من الرمز');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!phone || resendIn > 0 || resending) return;
    setResending(true);
    setError('');
    setMessage('');
    try {
      await requestOtp(phone);
      setCode('');
      setResendIn(60);
      setMessage('تم إرسال رمز تحقق جديد.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إعادة إرسال رمز التحقق');
    } finally {
      setResending(false);
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
        {message && <p className="muted">{message}</p>}
        <button className="blackCta" type="submit" disabled={busy || !phone}>{busy ? 'جاري التحقق...' : 'تأكيد الرمز'} <span>←</span></button>
        <button className="outlineCta" type="button" disabled={!phone || resendIn > 0 || resending} onClick={resend}>
          {resending ? 'جاري الإرسال...' : resendIn > 0 ? `إعادة الإرسال بعد ${resendIn} ثانية` : 'إعادة إرسال الرمز'}
        </button>
        <Link className="textLink" href="/login">تغيير رقم الهاتف</Link>
      </form>
    </AppScreen>
  );
}
