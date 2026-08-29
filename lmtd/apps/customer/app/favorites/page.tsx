import Link from 'next/link';
import { AppScreen, Header } from '../_components';

export default function Favorites() {
  return (
    <AppScreen>
      <Header title="المفضلة" back="/profile" />
      <div className="content" dir="rtl">
        <h1>طلباتك المفضلة</h1>
        <div className="emptyState">
          <b>المفضلة غير مفعلة بعد</b>
          <span>لن نعرض طلبات أو منتجات تجريبية. ستعمل هذه الصفحة بعد تفعيل حساب العميل وحفظ المفضلة في السيرفر.</span>
        </div>
        <Link className="outlineCta" href="/menu">استكشف المنيو</Link>
      </div>
    </AppScreen>
  );
}
