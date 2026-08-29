import Link from 'next/link';
import { AppScreen, Header } from '../_components';

export default function Verify() {
  return (
    <AppScreen>
      <Header title="التحقق" back="/login" />
      <div className="content authPage" dir="rtl">
        <p className="kicker">OTP VERIFICATION</p>
        <h1>رمز التحقق</h1>
        <div className="emptyState">
          <b>OTP غير مفعل بعد</b>
          <span>سيتم تفعيل إدخال الرمز والتحقق منه فقط بعد ربط خدمة الرسائل وجلسات العميل في الباك إند.</span>
        </div>
        <Link className="outlineCta" href="/branches">المتابعة كضيف</Link>
      </div>
    </AppScreen>
  );
}
