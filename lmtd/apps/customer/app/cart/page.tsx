'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AppScreen, Header } from '../_components';
import { CartItem, cartItemTotal, readCart, writeCart } from '../_cart';

export default function Cart() {
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
      <Header title="السلة" back={branchId ? `/menu?branch=${branchId}` : '/menu'} />
      <div className="content" dir="rtl">
        <h1>طلبك</h1>
        {items.length === 0 ? (
          <div className="optionCard"><b>السلة فارغة</b><p>اختر منتجاتك من المنيو.</p></div>
        ) : items.map((item) => (
          <div key={item.key}>
            <div className="cartProduct">
              {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <div className="productImagePlaceholder" />}
              <div>
                <b>{item.name}</b>
                <small>{item.selections.map((selection) => selection.optionName).join(' · ') || 'بدون إضافات'}</small>
                {item.note && <small>{item.note}</small>}
              </div>
              <b>AED {cartItemTotal(item).toFixed(2)}</b>
            </div>
            <div className="cartActions">
              <button type="button" onClick={() => updateQuantity(item.key, -1)}>−</button>
              <span>{item.quantity}</span>
              <button type="button" onClick={() => updateQuantity(item.key, 1)}>+</button>
              <button type="button" className="remove" onClick={() => remove(item.key)}>حذف</button>
            </div>
          </div>
        ))}

        <Link href={branchId ? `/menu?branch=${branchId}` : '/branches'} className="outlineCta">+ إضافة منتجات</Link>
        {items.length > 0 && (
          <>
            <div className="bill">
              <div><span>المجموع المبدئي</span><b>AED {total.toFixed(2)}</b></div>
              <div><span>السعر النهائي</span><b>AED {total.toFixed(2)}</b></div>
            </div>
            <Link className="blackCta" href="/pickup">متابعة لاختيار الاستلام <span>AED {total.toFixed(2)}</span></Link>
          </>
        )}
      </div>
    </AppScreen>
  );
}
