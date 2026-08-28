'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Category = { id:string; nameAr:string; nameEn?:string|null; imageUrl?:string|null; isActive:boolean };
type BranchProduct = { branchId:string; productId:string; isAvailable:boolean; priceOverride?:string|null; soldOutReason?:string|null; branch:{id:string;nameAr:string;nameEn?:string|null} };
type Product = { id:string; sku:string; nameAr:string; nameEn?:string|null; descriptionAr?:string|null; imageUrl?:string|null; basePrice:string; isActive:boolean; category?:Category|null; categoryId?:string|null; branchProducts:BranchProduct[] };
type Branch = { id:string; nameAr:string; nameEn?:string|null; acceptsOrders:boolean; isActive:boolean };

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/v1';

export default function AdminHome(){
  const [products,setProducts]=useState<Product[]>([]);
  const [categories,setCategories]=useState<Category[]>([]);
  const [branches,setBranches]=useState<Branch[]>([]);
  const [selected,setSelected]=useState<Product|null>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [tab,setTab]=useState<'products'|'categories'|'branches'>('products');

  async function load(){
    setLoading(true);
    try{
      const [p,c,b]=await Promise.all([
        fetch(`${API}/admin/catalog/products`,{cache:'no-store'}),
        fetch(`${API}/admin/catalog/categories`,{cache:'no-store'}),
        fetch(`${API}/admin/catalog/branches`,{cache:'no-store'}),
      ]);
      if(!p.ok||!c.ok||!b.ok) throw new Error('API unavailable');
      setProducts(await p.json()); setCategories(await c.json()); setBranches(await b.json());
    }catch(e){setMessage('تعذر الاتصال بالـ API. تأكد من NEXT_PUBLIC_API_URL وتشغيل خدمة LMTD API.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);

  const activeCount=useMemo(()=>products.filter(p=>p.isActive).length,[products]);

  async function saveProduct(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); setSaving(true); setMessage('');
    const fd=new FormData(e.currentTarget);
    const body={
      sku:String(fd.get('sku')||''), nameAr:String(fd.get('nameAr')||''), nameEn:String(fd.get('nameEn')||''),
      descriptionAr:String(fd.get('descriptionAr')||''), imageUrl:String(fd.get('imageUrl')||''),
      basePrice:Number(fd.get('basePrice')||0), categoryId:String(fd.get('categoryId')||'')||undefined,
      isActive:fd.get('isActive')==='on'
    };
    const url=selected?`${API}/admin/catalog/products/${selected.id}`:`${API}/admin/catalog/products`;
    const res=await fetch(url,{method:selected?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    setSaving(false);
    if(!res.ok){setMessage('فشل حفظ المنتج. راجع البيانات أو اتصال الـ API.');return;}
    setSelected(null); setMessage('تم حفظ المنتج بنجاح.'); await load();
  }

  async function deactivate(id:string){
    if(!confirm('إخفاء هذا المنتج من المنيو؟')) return;
    const res=await fetch(`${API}/admin/catalog/products/${id}`,{method:'DELETE'});
    if(res.ok){setMessage('تم إخفاء المنتج.');await load();}
  }

  async function addCategory(e:FormEvent<HTMLFormElement>){
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const res=await fetch(`${API}/admin/catalog/categories`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nameAr:String(fd.get('nameAr')||''),nameEn:String(fd.get('nameEn')||''),isActive:true})});
    if(res.ok){e.currentTarget.reset();setMessage('تمت إضافة التصنيف.');await load();}
  }

  async function toggleAvailability(product:Product,bp:BranchProduct){
    const res=await fetch(`${API}/admin/catalog/branches/${bp.branchId}/products/${product.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({isAvailable:!bp.isAvailable})});
    if(res.ok) await load();
  }

  return <main className="adminShell">
    <aside className="sidebar">
      <div className="logo">LMTD<span>ADMIN</span></div>
      <nav>
        <button className={tab==='products'?'active':''} onClick={()=>setTab('products')}>المنتجات</button>
        <button className={tab==='categories'?'active':''} onClick={()=>setTab('categories')}>التصنيفات</button>
        <button className={tab==='branches'?'active':''} onClick={()=>setTab('branches')}>الفروع والتوفر</button>
      </nav>
      <div className="sideNote">Catalog Console<br/><small>UAE · AED</small></div>
    </aside>

    <section className="workspace">
      <header className="adminTop"><div><b>LMTD Coffee</b><span>Content & Catalog Management</span></div><button onClick={load}>تحديث البيانات</button></header>
      <div className="content">
        <div className="stats">
          <article><span>المنتجات</span><strong>{products.length}</strong></article>
          <article><span>المنتجات الفعالة</span><strong>{activeCount}</strong></article>
          <article><span>التصنيفات</span><strong>{categories.length}</strong></article>
          <article><span>الفروع</span><strong>{branches.length}</strong></article>
        </div>
        {message&&<div className="notice">{message}</div>}

        {tab==='products'&&<div className="split">
          <div className="panel">
            <div className="panelHead"><div><h1>المنتجات</h1><p>عدّل المنيو من هنا. التغييرات تحفظ في PostgreSQL.</p></div><button className="black" onClick={()=>setSelected({} as Product)}>+ منتج جديد</button></div>
            {loading?<p>جاري التحميل…</p>:<div className="productTable">
              {products.map(p=><article className="productCard" key={p.id}>
                <div className="thumb">{p.imageUrl?<img src={p.imageUrl} alt=""/>:<span>NO IMAGE</span>}</div>
                <div className="productInfo"><b>{p.nameEn||p.nameAr}</b><span>{p.category?.nameAr||'بدون تصنيف'} · AED {Number(p.basePrice).toFixed(2)}</span><small>{p.sku}</small></div>
                <span className={p.isActive?'status on':'status off'}>{p.isActive?'Active':'Hidden'}</span>
                <div className="actions"><button onClick={()=>setSelected(p)}>تعديل</button><button onClick={()=>deactivate(p.id)}>إخفاء</button></div>
              </article>)}
            </div>}
          </div>
          <div className="panel editor">
            <h2>{selected?.id?'تعديل المنتج':'إضافة منتج'}</h2>
            {!selected?<div className="emptyEditor">اختر منتج من القائمة أو اضغط «منتج جديد».</div>:<form className="adminForm" onSubmit={saveProduct}>
              <label>SKU<input name="sku" required defaultValue={selected.sku||''}/></label>
              <div className="two"><label>الاسم بالعربي<input name="nameAr" required defaultValue={selected.nameAr||''}/></label><label>English name<input name="nameEn" defaultValue={selected.nameEn||''}/></label></div>
              <label>الوصف<textarea name="descriptionAr" rows={3} defaultValue={selected.descriptionAr||''}/></label>
              <div className="two"><label>السعر AED<input name="basePrice" type="number" step="0.01" min="0" required defaultValue={selected.basePrice||''}/></label><label>التصنيف<select name="categoryId" defaultValue={selected.categoryId||selected.category?.id||''}><option value="">بدون تصنيف</option>{categories.map(c=><option value={c.id} key={c.id}>{c.nameAr}</option>)}</select></label></div>
              <label>صورة المنتج — URL<input name="imageUrl" placeholder="https://..." defaultValue={selected.imageUrl||''}/></label>
              {selected.imageUrl&&<img className="imagePreview" src={selected.imageUrl} alt="preview"/>}
              <label className="check"><input name="isActive" type="checkbox" defaultChecked={selected.id?selected.isActive:true}/> المنتج ظاهر في المنيو</label>
              <div className="formActions"><button type="button" onClick={()=>setSelected(null)}>إلغاء</button><button className="black" disabled={saving}>{saving?'جاري الحفظ…':'حفظ المنتج'}</button></div>
            </form>}
          </div>
        </div>}

        {tab==='categories'&&<div className="panel single"><div className="panelHead"><div><h1>التصنيفات</h1><p>قهوة، ماتشا، حلويات، أكل وغيرها.</p></div></div><form className="inlineForm" onSubmit={addCategory}><input name="nameAr" placeholder="الاسم بالعربي" required/><input name="nameEn" placeholder="English name"/><button className="black">إضافة</button></form><div className="categoryGrid">{categories.map(c=><article key={c.id}><b>{c.nameAr}</b><span>{c.nameEn}</span><small>{c.isActive?'Active':'Hidden'}</small></article>)}</div></div>}

        {tab==='branches'&&<div className="panel single"><div className="panelHead"><div><h1>توفر المنتجات حسب الفرع</h1><p>إيقاف منتج في فرع واحد بدون حذفه من باقي الفروع.</p></div></div>{branches.map(branch=><section className="branchSection" key={branch.id}><h2>{branch.nameEn||branch.nameAr}</h2><div className="availabilityGrid">{products.map(product=>{const bp=product.branchProducts?.find(x=>x.branchId===branch.id);return <button key={product.id} className={bp?.isAvailable!==false?'availability available':'availability unavailable'} onClick={()=>bp&&toggleAvailability(product,bp)}><span>{product.nameEn||product.nameAr}</span><b>{bp?.isAvailable!==false?'متوفر':'غير متوفر'}</b></button>})}</div></section>)}</div>}
      </div>
    </section>
  </main>;
}
