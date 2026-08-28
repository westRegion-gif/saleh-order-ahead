export default function BranchesPage() {
  const branches = [
    { id: 'dubai-1', name: 'LMTD Coffee — Dubai', meta: 'Open • 10–15 min' },
    { id: 'abu-dhabi-1', name: 'LMTD Coffee — Abu Dhabi', meta: 'Open • 12–18 min' }
  ];

  return (
    <main className="shell">
      <section className="hero" style={{background:'#f7f1e7', color:'#111'}}>
        <p className="eyebrow" style={{color:'#111'}}>LMTD COFFEE</p>
        <h1>اختر الفرع</h1>
        <p>اختر الفرع الأقرب لك للبدء بالطلب.</p>
        <div style={{display:'grid', gap:12, marginTop:24}}>
          {branches.map((branch) => (
            <a
              key={branch.id}
              href={`/?branch=${branch.id}`}
              style={{display:'block', padding:18, border:'1px solid #ddd', borderRadius:18, textDecoration:'none', color:'#111', background:'#fff'}}
            >
              <strong>{branch.name}</strong>
              <div style={{marginTop:6, opacity:.65}}>{branch.meta}</div>
            </a>
          ))}
        </div>
        <a className="secondary" href="/" style={{marginTop:24}}>رجوع</a>
      </section>
    </main>
  );
}
