import Link from 'next/link';

export default function HomePage(){
 return <main className="shell"><section className="launch"><img className="launchCoffee" src="https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/spanish-latte-cold.png" alt="LMTD iced coffee"/><div className="launchShade"/><div className="launchContent"><p className="eyebrow">LMTD COFFEE</p><h1>قهوتك، جاهزة قبل وصولك.</h1><p>اطلب مسبقاً، اختر فرعك، واستلم طلبك بالطريقة التي تناسبك.</p><Link className="primary" href="/branches">ابدأ الطلب</Link><Link className="secondary" href="/login">تسجيل الدخول</Link></div></section></main>
}
