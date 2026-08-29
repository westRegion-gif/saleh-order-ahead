import type { MenuProduct } from './_api';

export type CartSelection = { groupId: string; groupName: string; optionId: string; optionName: string; priceDelta: number };
export type CartItem = {
  key: string;
  branchId: string;
  productId: string;
  name: string;
  imageUrl?: string | null;
  unitPrice: number;
  quantity: number;
  selections: CartSelection[];
  note?: string;
};

const CART_KEY = 'lmtd_cart_v1';

export function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]') as CartItem[]; } catch { return []; }
}

export function writeCart(items: CartItem[]) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  localStorage.removeItem('lmtd_checkout_key');
  localStorage.removeItem('lmtd_pending_order');
  window.dispatchEvent(new Event('lmtd-cart-change'));
}

export function addCartItem(item: CartItem) {
  const current = readCart();
  const sameBranch = current.filter((x) => x.branchId === item.branchId);
  const existing = sameBranch.find((x) => x.key === item.key);
  if (existing) existing.quantity += item.quantity;
  else sameBranch.push(item);
  writeCart(sameBranch);
}

export function cartItemTotal(item: CartItem) {
  const extras = item.selections.reduce((sum, x) => sum + x.priceDelta, 0);
  return (item.unitPrice + extras) * item.quantity;
}

export function makeCartItem(product: MenuProduct, branchId: string, quantity: number, selections: CartSelection[], note: string): CartItem {
  const selectionKey = selections.map((x) => x.optionId).sort().join('-');
  return {
    key: `${product.id}:${selectionKey}:${note.trim()}`,
    branchId,
    productId: product.id,
    name: product.nameAr || product.nameEn || 'LMTD Coffee',
    imageUrl: product.imageUrl,
    unitPrice: product.price,
    quantity,
    selections,
    note: note.trim() || undefined,
  };
}
