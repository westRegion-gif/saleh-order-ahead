'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppScreen, Header } from '../../_components';
import { getMenu, MenuProduct } from '../../_api';
import { addCartItem, makeCartItem, CartSelection } from '../../_cart';
import { useLanguage } from '../../_language';

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [product, setProduct] = useState<MenuProduct | null>(null);
  const [branchId, setBranchId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const branch = search.get('branch') || localStorage.getItem('lmtd_branch_id') || '';
    if (!branch) {
      router.replace('/branches');
      return;
    }

    setBranchId(branch);
    getMenu(branch)
      .then((data) => {
        const found = data.products.find((p) => p.id === params.slug || p.sku === params.slug);
        if (!found) throw new Error('missing');
        setProduct(found);

        const defaults: Record<string, string[]> = {};
        found.modifierGroups.forEach((group) => {
          const available = group.options.filter((option) => option.isAvailable);
          const minimum = Math.max(group.minSelect, group.isRequired ? 1 : 0);
          const limit = group.maxSelect == null ? minimum : Math.min(minimum, group.maxSelect);
          defaults[group.id] = limit > 0 ? available.slice(0, limit).map((option) => option.id) : [];
        });
        setSelected(defaults);
      })
      .catch(() => setError(ar ? 'تعذر تحميل تفاصيل المنتج.' : 'Could not load product details.'));
  }, [params.slug, router, ar]);

  const selections = useMemo<CartSelection[]>(() => {
    if (!product) return [];
    return product.modifierGroups.flatMap((group) =>
      (selected[group.id] || []).flatMap((optionId) => {
        const option = group.options.find((item) => item.id === optionId && item.isAvailable);
        if (!option) return [];
        return [{
          groupId: group.id,
          groupName: group.nameAr || group.nameEn || '',
          groupNameAr: group.nameAr || group.nameEn || '',
          groupNameEn: group.nameEn || group.nameAr || '',
          optionId,
          optionName: option.nameAr || option.nameEn || '',
          optionNameAr: option.nameAr || option.nameEn || '',
          optionNameEn: option.nameEn || option.nameAr || '',
          priceDelta: option.priceDelta,
        }];
      }),
    );
  }, [product, selected]);

  const unitTotal = (product?.price || 0) + selections.reduce((sum, item) => sum + item.priceDelta, 0);
  const valid = !!product && product.isAvailable && product.modifierGroups.every((group) => {
    const count = selected[group.id]?.length || 0;
    const minimum = Math.max(group.minSelect, group.isRequired ? 1 : 0);
    if (count < minimum) return false;
    if (group.maxSelect != null && count > group.maxSelect) return false;
    if ((group.selectionType === 'SINGLE' || group.maxSelect === 1) && count > 1) return false;
    return true;
  });

  function toggle(groupId: string, optionId: string, single: boolean, max?: number | null) {
    setSelected((current) => {
      const old = current[groupId] || [];
      if (single) return { ...current, [groupId]: [optionId] };
      const next = old.includes(optionId) ? old.filter((id) => id !== optionId) : [...old, optionId];
      return { ...current, [groupId]: max ? next.slice(-max) : next };
    });
  }

  function add() {
    if (!product || !valid) return;
    addCartItem(makeCartItem(product, branchId, quantity, selections, note));
    router.push('/cart');
  }

  if (error) return <AppScreen><Header title="التفاصيل" titleEn="Details" back="/menu" cart /><div className="content" dir={dir}><p>{error}</p></div></AppScreen>;
  if (!product) return <AppScreen><Header title="التفاصيل" titleEn="Details" back="/menu" cart /><div className="content" dir={dir}><p>{ar ? 'جاري تحميل المنتج...' : 'Loading product...'}</p></div></AppScreen>;

  const productName = ar ? (product.nameAr || product.nameEn) : (product.nameEn || product.nameAr);
  const description = ar ? (product.descriptionAr || product.descriptionEn) : (product.descriptionEn || product.descriptionAr);

  return (
    <AppScreen>
      <Header title="التفاصيل" titleEn="Details" back={`/menu?branch=${branchId}`} cart />
      <div className="content productPage" dir={dir}>
        {product.imageUrl ? <img className="productImage" src={product.imageUrl} alt={productName || 'Product'} /> : <div className="productImage productImagePlaceholder" />}
        <div className="productHeading">
          <div>
            <p className="kicker">LMTD COFFEE</p>
            <h1>{productName}</h1>
            {description && <p>{description}</p>}
          </div>
          <b>AED {product.price.toFixed(2)}</b>
        </div>

        {!product.isAvailable && <div className="optionCard"><b>{ar ? 'هذا المنتج غير متوفر حالياً في هذا الفرع.' : 'This product is currently unavailable at this branch.'}</b></div>}

        <div className="qtyRow">
          <b>{ar ? 'الكمية' : 'Quantity'}</b>
          <div>
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((value) => value + 1)}>+</button>
          </div>
        </div>

        {product.modifierGroups.map((group) => {
          const single = group.selectionType === 'SINGLE' || group.maxSelect === 1;
          const minimum = Math.max(group.minSelect, group.isRequired ? 1 : 0);
          const groupName = ar ? (group.nameAr || group.nameEn) : (group.nameEn || group.nameAr);
          return (
            <div className="optionCard" key={group.id}>
              <div className="optionTitle">
                <b>{groupName}</b>
                <small>{minimum > 0 ? (ar ? `مطلوب${minimum > 1 ? ` · اختر ${minimum}` : ''}` : `Required${minimum > 1 ? ` · choose ${minimum}` : ''}`) : (ar ? 'اختياري' : 'Optional')}</small>
              </div>
              {group.options.filter((option) => option.isAvailable).map((option) => {
                const optionName = ar ? (option.nameAr || option.nameEn) : (option.nameEn || option.nameAr);
                return (
                  <label key={option.id}>
                    <span>{optionName} {option.priceDelta > 0 && <small>+ AED {option.priceDelta.toFixed(2)}</small>}</span>
                    <input
                      type={single ? 'radio' : 'checkbox'}
                      name={group.id}
                      checked={(selected[group.id] || []).includes(option.id)}
                      onChange={() => toggle(group.id, option.id, single, group.maxSelect)}
                    />
                  </label>
                );
              })}
            </div>
          );
        })}

        <textarea className="noteBox" value={note} onChange={(event) => setNote(event.target.value)} placeholder={ar ? 'ملاحظات للطلب' : 'Order notes'} />
        <button type="button" className="blackCta" disabled={!valid} onClick={add}>{ar ? 'أضف إلى السلة' : 'Add to cart'} <span>AED {(unitTotal * quantity).toFixed(2)}</span></button>
      </div>
    </AppScreen>
  );
}
