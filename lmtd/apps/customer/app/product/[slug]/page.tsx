'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppScreen, Header } from '../../_components';
import { getMenu, MenuProduct } from '../../_api';
import { addCartItem, makeCartItem, CartSelection } from '../../_cart';

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [branchId, setBranchId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const branch = search.get('branch') || localStorage.getItem('lmtd_branch_id') || '';
    if (!branch) { router.replace('/branches'); return; }
    setBranchId(branch);
    getMenu(branch).then((data) => {
      const found = data.products.find((p) => p.id === params.slug || p.sku === params.slug);
      if (!found) throw new Error('missing');
      setProduct(found);
      const defaults: Record<string, string[]> = {};
      found.modifierGroups.forEach((group) => {
        const available = group.options.filter((o) => o.isAvailable);
        if (group.isRequired && available.length) defaults[group.id] = [available[0].id];
        else defaults[group.id] = [];
      });
      setSelected(defaults);
    }).catch(() => setError('تعذر تحميل تفاصيل المنتج.'));
  }, [params.slug, router, search]);

  const selections = useMemo<CartSelection[]>(() => {
    if (!product) return [];
    return product.modifierGroups.flatMap((group) => (selected[group.id] || []).map((optionId) => {
      const option = group.options.find((x) => x.id === optionId)!;
      return { groupId: group.id, groupName: group.nameAr || group.nameEn || '', optionId, optionName: option.nameAr || option.nameEn || '', priceDelta: option.priceDelta };
    }));
  }, [product, selected]);

  const unitTotal = (product?.price || 0) + selections.reduce((sum, x) => sum + x.priceDelta, 0);
  const valid = !!product && product.isAvailable && product.modifierGroups.every((g) => !g.isRequired || (selected[g.id]?.length || 0) >= g.minSelect);

  function toggle(groupId: string, optionId: string, single: boolean, max?: number | null) {
    setSelected((current) => {
      const old = current[groupId] || [];
      if (single) return { ...current, [groupId]: [optionId] };
      const next = old.includes(optionId) ? old.filter((x) => x !== optionId) : [...old, optionId];
      return { ...current, [groupId]: max ? next.slice(-max) : next };
    });
  }

  function add() {
    if (!product || !valid) return;
    addCartItem(makeCartItem(product, branchId, quantity, selections, note));
    router.push('/cart');
  }

  if (error) return <AppScreen><Header title="التفاصيل" back="/menu" cart/><div className="content"><p>{error}</p></div></AppScreen>;
  if (!product) return <AppScreen><Header title="التفاصيل" back="/menu" cart/><div className="content"><p>جاري تحميل المنتج...</p></div></AppScreen>;

  return <AppScreen><Header title="التفاصيل" back={`/menu?branch=${branchId}`} cart/><div className="content productPage" dir="rtl">
    {product.imageUrl ? <img className="productImage" src={product.imageUrl} alt={product.nameAr || product.nameEn || 'منتج'}/> : <div className="productImage productImagePlaceholder"/>}
    <div className="productHeading"><div><p className="kicker">LMTD COFFEE</p><h1>{product.nameAr || product.nameEn}</h1>{product.descriptionAr && <p>{product.descriptionAr}</p>}</div><b>AED {product.price.toFixed(2)}</b></div>
    {!product.isAvailable && <div className="optionCard"><b>هذا المنتج غير متوفر حالياً في هذا الفرع.</b></div>}
    <div className="qtyRow"><b>الكمية</b><div><button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button><span>{quantity}</span><button type="button" onClick={() => setQuantity((q) => q + 1)}>+</button></div></div>
    {product.modifierGroups.map((group) => {
      const single = group.selectionType === 'SINGLE' || group.maxSelect === 1;
      return <div className="optionCard" key={group.id}><div className="optionTitle"><b>{group.nameAr || group.nameEn}</b><small>{group.isRequired ? 'مطلوب' : 'اختياري'}</small></div>
        {group.options.filter((o) => o.isAvailable).map((option) => <label key={option.id}><span>{option.nameAr || option.nameEn} {option.priceDelta > 0 && <small>+ AED {option.priceDelta.toFixed(2)}</small>}</span><input type={single ? 'radio' : 'checkbox'} name={group.id} checked={(selected[group.id] || []).includes(option.id)} onChange={() => toggle(group.id, option.id, single, group.maxSelect)}/></label>)}
      </div>;
    })}
    <textarea className="noteBox" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات للطلب"/>
    <button type="button" className="blackCta" disabled={!valid} onClick={add}>أضف إلى السلة <span>AED {(unitTotal * quantity).toFixed(2)}</span></button>
  </div></AppScreen>;
}
