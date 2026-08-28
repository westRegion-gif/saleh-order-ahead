export default function LoginPage() {
  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">LMTD COFFEE</p>
        <h1>تسجيل الدخول</h1>
        <p>نسخة تجريبية لواجهة تسجيل الدخول. ربط OTP الفعلي يأتي في المرحلة التالية.</p>
        <form style={{display:'grid', gap:12, marginTop:24}}>
          <input
            aria-label="Phone number"
            placeholder="05X XXX XXXX"
            inputMode="tel"
            style={{padding:16, borderRadius:16, border:'1px solid #444', background:'#111', color:'#fff'}}
          />
          <button type="button" className="primary">إرسال رمز التحقق</button>
        </form>
        <a className="secondary" href="/" style={{marginTop:12}}>رجوع</a>
      </section>
    </main>
  );
}
