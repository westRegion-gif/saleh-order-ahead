'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { requestOtp, verifyOtp } from '../_api';
import { saveCustomerSession } from '../_auth';
import { useLanguage } from '../_language';

export default function Verify() {
  const router = useRouter();
  const { language, dir, setLanguage } = useLanguage();
  const ar = language === 'ar';
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
      setError(ar ? 'أدخل رمز التحقق المكون من 6 أرقام' : 'Enter the 6-digit verification code');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await verifyOtp(phone, code);
      saveCustomerSession(result.accessToken, result.customer);
      setLanguage(language);
      sessionStorage.removeItem('lmtd_login_phone');
      const destination = sessionStorage.getItem('lmtd_login_return') || '/home';
      sessionStorage.removeItem('lmtd_login_return');
      router.replace(destination.startsWith('/') ? destination : '/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر التحقق من الرمز' : 'Could not verify code'));
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
      setMessage(ar ? 'تم إرسال رمز تحقق جديد.' : 'A new verification code was sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : (ar ? 'تعذر إعادة إرسال رمز التحقق' : 'Could not resend verification code'));
    } finally {
      setResending(false);
    }
  }

  return (
    <AppScreen>
      <Header title="التحقق" titleEn="Verification" back="/login" />
      <form className="content authPage" dir={dir} onSubmit={submit}>
        <p className="kicker">OTP VERIFICATION</p>
        <h1>{ar ? 'رمز التحقق' : 'Verification code'}</h1>
        <p className="muted">{ar ? `أدخل الرمز المرسل إلى ${phone || 'رقم هاتفك'}.` : `Enter the code sent to ${phone || 'your phone number'}.`}</p>
        <input className="noteBox" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />
        {error && <p className="muted">{error}</p>}
        {message && <p className="muted">{message}</p>}
        <button className="blackCta" type="submit" disabled={busy || !phone}>{busy ? (ar ? 'جاري التحقق...' : 'Verifying...') : (ar ? 'تأكيد الرمز' : 'Verify code')} <span>←</span></button>
        <button className="outlineCta" type="button" disabled={!phone || resendIn > 0 || resending} onClick={resend}>
          {resending ? (ar ? 'جاري الإرسال...' : 'Sending...') : resendIn > 0 ? (ar ? `إعادة الإرسال بعد ${resendIn} ثانية` : `Resend in ${resendIn}s`) : (ar ? 'إعادة إرسال الرمز' : 'Resend code')}
        </button>
        <Link className="textLink" href="/login">{ar ? 'تغيير رقم الهاتف' : 'Change phone number'}</Link>
      </form>
    </AppScreen>
  );
}
