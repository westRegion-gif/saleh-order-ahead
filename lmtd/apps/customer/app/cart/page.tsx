'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, Header } from '../_components';
import { CartItem, cartItemTotal, readCart, writeCart } from '../_cart';
import { useLanguage } from '../_language';

export default function Cart() {
  const { language, dir } = useLanguage();
  const ar = language === 'ar';
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => setItems(readCart()), []);

  const total = useMemo(() => items.reduce((sum, item) => sum + cartItemTotal(item), 0), [items]);
  const branchId = items[0]?.branchId || '';

  function updateQuantity(key: string, delta: number) {
    const next = items.map((item) => item.key === key ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item);
    setItems(next);
    writeCart(next);
  }

  function remove(key: string) {
    const next = items.filter((item) => item.key !== key);
    setItems(next);
    writeCart(next);
  }

  return (
    <AppScreen>
      <Header title="السلة" titleEn="Cart" back={branchId ? `/menu?branch=${branchId}` : '/menu'} />
      <div className="content" dir={dir}>
        <h1>{ar ? 'طلبك' : 'Your order'}</h1>
        {items.length === 0 ? (
          <div className="optionCard"><b>{ar ? 'السلة فارغة' : 'Your cart is empty'}</b><p>{ar ? 'اختر منتجاتك من المنيو.' : 'Choose items from the menu.'}</p></div>
        ) : items.map((item) => {
          const name = ar ? (item.nameAr || item.name) : (item.nameEn || item.name);
          const selections = item.selections.map((selection) => ar ? (selection.optionNameAr || selection.optionName) : (selection.optionNameEn || selection.optionName)).join(' · ');
          return (
            <div key={item.key}>
              <div className="cartProduct">
                {item.imageUrl ? <img src={item.imageUrl} alt={name} /> : <div className="productImagePlaceholder" />}
                <div>
                  <b>{name}</b>
                  <small>{selections || (ar ? 'بدون إضافات' : 'No extras')}</small>
                  {item.note && <small>{item.note}</small>}
                </div>
                <b>AED {cartItemTotal(item).toFixed(2)}</b>
              </div>
              <div className="cartActions">
                <button type="button" onClick={() => updateQuantity(item.key, -1)}>−</button>
                <span>{item.quantity}</span>
                <button type="button" onClick={() => updateQuantity(item.key, 1)}>+</button>
                <button type="button" className="remove" onClick={() => remove(item.key)}>{ar ? 'حذف' : 'Remove'}</button>
              </div>
            </div>
          );
        })}

        <Link href={branchId ? `/menu?branch=${branchId}` : '/branches'} className="outlineCta">{ar ? '+ إضافة منتجات' : '+ Add items'}</Link>
        {items.length > 0 && (
          <>
            <div className="bill">
              <div><span>{ar ? 'الإجمالي' : 'Total'}</span><b>AED {total.toFixed(2)}</b></div>
            </div>
            <Link className="blackCta" href="/pickup">{ar ? 'متابعة لاختيار الاستلام' : 'Continue to pickup'} <span>AED {total.toFixed(2)}</span></Link>
          </>
        )}
      </div>
    </AppScreen>
  );
}
