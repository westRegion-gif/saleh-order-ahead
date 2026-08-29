import Link from 'next/link';
import { AppScreen, BottomNav, Header } from '../_components';

export default function Profile() {
  return (
    <AppScreen>
      <Header title="حسابي" back="/home" />
      <div className="content" dir="rtl">
        <div className="profileHero">
          <div className="avatar">L</div>
          <div><h1>حسابك</h1><span>تسجيل الدخول برقم الهاتف غير مفعل بعد</span></div>
        </div>
        <Link className="blackCta" href="/login">تسجيل الدخول <span>←</span></Link>
        <div className="accountList">
          <Link href="/orders"><span>طلباتي</span><b>←</b></Link>
          <Link href="/favorites"><span>المفضلة</span><b>←</b></Link>
          <Link href="/wallet"><span>المحفظة والمكافآت</span><b>←</b></Link>
          <Link href="/more"><span>الإعدادات والمزيد</span><b>←</b></Link>
        </div>
      </div>
      <BottomNav active="profile" />
    </AppScreen>
  );
}
