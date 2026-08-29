import Link from 'next/link';
import { AppScreen, Header } from '../_components';

export default function Login() {
  return (
    <AppScreen>
      <Header title="تسجيل الدخول" back="/" />
      <div className="content authPage" dir="rtl">
        <p className="kicker">LMTD COFFEE</p>
        <h1>تسجيل الدخول</h1>
        <p className="muted">تسجيل الدخول برقم الهاتف ورمز OTP غير مفعل في السيرفر حتى الآن.</p>
        <label className="phoneField" aria-disabled="true"><span>+971</span><input inputMode="tel" placeholder="50 000 0000" disabled /></label>
        <button className="blackCta" type="button" disabled>إرسال رمز التحقق غير متاح بعد <span>←</span></button>
        <Link className="outlineCta" href="/branches">المتابعة كضيف</Link>
        <p className="secureNote">لن نعرض نجاح تسجيل دخول وهمي قبل ربط OTP الحقيقي.</p>
      </div>
    </AppScreen>
  );
}
