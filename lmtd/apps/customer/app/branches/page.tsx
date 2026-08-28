import Link from 'next/link';

const branches = [
  {
    id: 'dubai-1',
    city: 'Dubai',
    name: 'LMTD Coffee — Dubai',
    meta: 'مفتوح الآن',
    distance: '2.4 كم',
    prep: '10–15 دقيقة',
    image: 'https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/latte.png'
  },
  {
    id: 'abu-dhabi-1',
    city: 'Abu Dhabi',
    name: 'LMTD Coffee — Abu Dhabi',
    meta: 'مفتوح الآن',
    distance: '5.8 كم',
    prep: '12–18 دقيقة',
    image: 'https://raw.githubusercontent.com/westRegion-gif/saleh-order-ahead/main/static/products/flat-white.png'
  }
];

export default function BranchesPage() {
  return (
    <main className="shell">
      <section className="screen screen-light approved-branch-screen" dir="rtl">
        <header className="topbar approved-topbar">
          <Link href="/" className="iconBtn" aria-label="رجوع">←</Link>
          <span className="brand">LMTD COFFEE</span>
          <span className="topbarSpacer" />
        </header>

        <div className="screenBody approved-branch-body">
          <div className="branchHeading">
            <div className="countrySelector">
              <span>الإمارات</span>
              <b>Dubai</b>
              <span className="chevron">⌄</span>
            </div>
            <h1>اختر الفرع</h1>
            <p className="muted">اختر الفرع الأقرب لك، أو ابحث عن الفرع الذي تفضله.</p>
          </div>

          <div className="branchTools">
            <div className="branchSearchWrap">
              <span className="searchIcon">⌕</span>
              <input className="branchSearch" aria-label="البحث عن فرع" placeholder="ابحث عن فرع" />
            </div>
            <button className="locationButton" type="button">استخدم موقعي الحالي</button>
          </div>

          <div className="approvedBranchList">
            {branches.map((branch) => (
              <article className="approvedBranchCard" key={branch.id}>
                <div className="branchImageWrap">
                  <img src={branch.image} alt={branch.name} />
                  <span className="openBadge">{branch.meta}</span>
                </div>
                <div className="branchCardBody">
                  <div>
                    <span className="branchCity">{branch.city}</span>
                    <h2>{branch.name}</h2>
                  </div>
                  <div className="branchMetaRow">
                    <span>المسافة {branch.distance}</span>
                    <span>التجهيز {branch.prep}</span>
                  </div>
                  <Link className="branchContinue" href={`/home?branch=${branch.id}`}>اختيار هذا الفرع</Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
