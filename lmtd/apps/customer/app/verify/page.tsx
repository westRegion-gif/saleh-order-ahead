'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppScreen, Header } from '../_components';
import { verifyOtp } from '../_api';
import { getPendingPhone, setCustomerSession } from '../_auth';

export default function Verify() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storedPhone = getPendingPhone();
    if (!storedPhone) {
      router.replace('/login');
      return;
    }
    setPhone(storedPhone);
    setDevCode(localStorage.getItem('lmtd_dev_otp') || '');
  }, [router]);

  async function submit() {
    if (code.length !== 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      const result = await verifyOtp(phone, code);
      setCustomerSession(result.token);
      localStorage.removeItem('lmtd_dev_otp');
      router.replace('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppScreen>
      <Header title="التحقق" back="/login" />
      <div className="content authPage" dir="rtl">
        <p className="kicker">OTP VERIFICATION</p>
        <h1>رمز التحقق</h1>
        <p className="muted">أدخل الرمز المرسل إلى {phone || 'رقمك'}.</p>
        <input className="noteBox" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" />
        {devCode && <p className="secureNote">وضع الاختبار: الرمز {devCode}</p>}
        {error && <p className="muted">{error}</p>}
        <button className="blackCta" type="button" onClick={submit} disabled={loading || code.length !== 6}>{loading ? 'جاري التحقق...' : 'تأكيد الرمز'} <span>←</span></button>
        <Link className="textLink" href="/login">تغيير رقم الهاتف</Link>
      </div>
    </AppScreen>
  );
}
