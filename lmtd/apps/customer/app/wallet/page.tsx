import Link from 'next/link';
import { AppScreen, Header } from '../_components';

export default function Wallet() {
  return (
    <AppScreen>
      <Header title="المحفظة" back="/profile" />
      <div className="content" dir="rtl">
        <h1>المحفظة والمكافآت</h1>
        <div className="emptyState">
          <b>المحفظة غير مفعلة بعد</b>
          <span>لن نعرض رصيداً أو نقاطاً تجريبية. سيتم ربط الرصيد والمكافآت بسجل حقيقي في السيرفر عند تفعيل هذه الميزة.</span>
        </div>
        <Link className="outlineCta" href="/menu">ابدأ طلباً جديداً</Link>
      </div>
    </AppScreen>
  );
}
