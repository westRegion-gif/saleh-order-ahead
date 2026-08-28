import Link from 'next/link';

export default function LaunchPage() {
  return (
    <main className="shell">
      <section className="launch approved-launch" dir="rtl">
        <div className="launchBrand">LMTD COFFEE</div>
        <div className="launchVisualWrap">
          <div className="launchGlow" />
          <img
            className="launchCup"
            src="https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/spanish-latte-cold.png"
            alt="LMTD iced Spanish latte"
          />
        </div>
        <div className="launchContent approved-launch-content">
          <div>
            <h1>قهوتك، جاهزة قبل وصولك.</h1>
            <p className="launchCopy">اختر الفرع، اطلب مسبقاً، واستلم طلبك بدون انتظار.</p>
          </div>
          <div className="launchActions">
            <Link className="primary launchPrimary" href="/branches">ابدأ الطلب</Link>
            <Link className="secondary launchSecondary" href="/login">تسجيل الدخول / إنشاء حساب</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
