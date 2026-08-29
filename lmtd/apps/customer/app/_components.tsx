import Link from 'next/link';

export function Header({ title, back = '/home', cart = false }: { title: string; back?: string; cart?: boolean }) {
  return (
    <header className="appHeader">
      <Link href={back} className="iconLink" aria-label="رجوع">←</Link>
      <b>{title}</b>
      {cart ? <Link href="/cart" className="iconLink" aria-label="السلة">▢</Link> : <span className="iconSpace" />}
    </header>
  );
}

export function BottomNav({ active }: { active: 'home' | 'menu' | 'orders' | 'profile' }) {
  return (
    <nav className="bottomNav">
      <Link className={active === 'home' ? 'active' : ''} href="/home">الرئيسية</Link>
      <Link className={active === 'menu' ? 'active' : ''} href="/menu">المنيو</Link>
      <Link className={active === 'orders' ? 'active' : ''} href="/orders">طلباتي</Link>
      <Link className={active === 'profile' ? 'active' : ''} href="/profile">حسابي</Link>
    </nav>
  );
}

export function AppScreen({ children }: { children: React.ReactNode }) {
  return <main className="shell"><section className="appScreen">{children}</section></main>;
}
