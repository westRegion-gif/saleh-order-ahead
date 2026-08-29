import Link from 'next/link';
export const IMG='https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/';
export function Header({title,back='/home',cart=false}:{title:string;back?:string;cart?:boolean}){return <header className="appHeader"><Link href={back} className="iconLink" aria-label="رجوع">←</Link><b>{title}</b>{cart?<Link href="/cart" className="iconLink" aria-label="السلة">▢</Link>:<span className="iconSpace"/>}</header>}
export function BottomNav({active}:{active:'home'|'menu'|'orders'|'profile'}){return <nav className="bottomNav"><Link className={active==='home'?'active':''} href="/home">الرئيسية</Link><Link className={active==='menu'?'active':''} href="/menu">المنيو</Link><Link className={active==='orders'?'active':''} href="/orders">طلباتي</Link><Link className={active==='profile'?'active':''} href="/profile">حسابي</Link></nav>}
export function AppScreen({children}:{children:React.ReactNode}){return <main className="shell"><section className="appScreen">{children}</section></main>}
export const products=[
['spanish-latte-cold','Spanish Latte Cold','30','spanish-latte-cold.png','قهوة ساخنة وباردة'],
['spanish-latte-hot','Spanish Latte Hot','28','spanish-latte-hot.png','قهوة ساخنة وباردة'],
['cortado','Cortado','24','cortado.png','قهوة ساخنة وباردة'],
['espresso','Espresso','20','espresso.png','قهوة ساخنة وباردة'],
['flat-white','Flat White','24','flat-white.png','قهوة ساخنة وباردة'],
['latte','Latte','25','latte.png','قهوة ساخنة وباردة'],
['long-black','Long Black','22','long-black.png','قهوة ساخنة وباردة'],
['macchiato','Macchiato','23','macchiato.png','قهوة ساخنة وباردة'],
['piccolo','Piccolo','23','piccolo.png','قهوة ساخنة وباردة'],
['v60','V60','30','v60.png','قهوة ساخنة وباردة'],
['cloudy-matcha','Cloudy Matcha','36','cloudy-matcha.png','سموذي وماتشا'],
['acai-smoothie','Acai Smoothie','42','acai-smoothie.png','سموذي وماتشا'],
['matcha','Matcha','32','matcha.png','سموذي وماتشا'],
['labneh-zaatar-toast','Labneh & Zaatar Toast','28','labneh-zaatar-toast.png','ساوردو'],
['jam-peanut-butter-nuts','Jam with Peanut Butter & Nuts','34','jam-peanut-butter-nuts.png','ساوردو'],
['avocado-egg-sourdough','Avocado with Egg Sourdough','36','avocado-egg-sourdough.png','ساوردو'],
['acai-bowl','Acai Bowl','42','acai-bowl.png','أطباق صحية'],
['coconut-pudding','Coconut Pudding','32','coconut-pudding.png','حلويات'],
['latte-pudding','Latte Pudding','32','latte-pudding.png','حلويات'],
['banana-pudding','Banana Pudding','34','banana-pudding.png','حلويات'],
['tiramisu','Tiramisu','26','tiramisu.png','حلويات'],
['fresh-orange-juice','Fresh Orange Juice','20','fresh-orange-juice.png','عصائر طازجة']
] as const;
