import { createOrder, CreateOrderInput, CreatedOrder } from './_api';
import { readCart } from './_cart';

function keyForCheckout() {
  const existing = localStorage.getItem('lmtd_checkout_key');
  if (existing) return existing;
  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `lmtd-${Date.now()}-${Math.random()}`;
  localStorage.setItem('lmtd_checkout_key', key);
  return key;
}

export async function submitCheckout(extra: Omit<CreateOrderInput, 'branchId' | 'idempotencyKey' | 'items'>): Promise<CreatedOrder> {
  const cart = readCart();
  if (!cart.length) throw new Error('السلة فارغة');
  const branchId = cart[0].branchId;
  if (cart.some((item) => item.branchId !== branchId)) throw new Error('لا يمكن الطلب من أكثر من فرع في نفس السلة');

  const order = await createOrder({
    branchId,
    idempotencyKey: keyForCheckout(),
    items: cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifiers: item.selections.map((selection) => ({ modifierId: selection.optionId })),
      note: item.note,
    })),
    ...extra,
  });

  localStorage.setItem('lmtd_pending_order', JSON.stringify(order));
  return order;
}
