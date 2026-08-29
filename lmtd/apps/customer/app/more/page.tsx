import Link from 'next/link';
import { AppScreen, Header } from '../_components';

const rowStyle = { minHeight: 58, padding: '0 17px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee7df' } as const;

export default function More() {
  return (
    <AppScreen>
      <Header title="المزيد" back="/home" />
      <div className="content" dir="rtl">
        <h1>المزيد</h1>
        <div className="accountList">
          <Link href="/branches"><span>تغيير الفرع</span><b>←</b></Link>
          <Link href="/profile"><span>الملف الشخصي</span><b>←</b></Link>
          <Link href="/favorites"><span>المفضلة</span><b>←</b></Link>
          <Link href="/wallet"><span>المحفظة والمكافآت</span><b>←</b></Link>
          <span style={rowStyle}><span>اللغة</span><b>العربية</b></span>
          <span style={{ ...rowStyle, borderBottom: 0 }}><span>الإشعارات</span><b>تُفعل بعد تسجيل الدخول</b></span>
        </div>
        <p className="version">LMTD COFFEE · UAE</p>
      </div>
    </AppScreen>
  );
}
