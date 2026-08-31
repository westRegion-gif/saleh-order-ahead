import { createOrder, CreateOrderInput, CreatedOrder } from './_api';
import { readCart } from './_cart';

const CHECKOUT_KEY = 'lmtd_checkout_key';

function checkoutFingerprint(input: Omit<CreateOrderInput, 'idempotencyKey'>) {
  return JSON.stringify({
    branchId: input.branchId,
    pickupMethod: input.pickupMethod,
    items: input.items,
    note: input.note || '',
    vehiclePlate: input.vehiclePlate || '',
    vehicleEmirate: input.vehicleEmirate || '',
    vehicleMakeModel: input.vehicleMakeModel || '',
    vehicleColor: input.vehicleColor || '',
  });
}

function keyForCheckout(fingerprint: string) {
  try {
    const existing = JSON.parse(localStorage.getItem(CHECKOUT_KEY) || 'null') as { fingerprint?: string; key?: string } | null;
    if (existing?.fingerprint === fingerprint && existing.key) return existing.key;
  } catch {
    localStorage.removeItem(CHECKOUT_KEY);
  }

  const key = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `lmtd-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(CHECKOUT_KEY, JSON.stringify({ fingerprint, key }));
  return key;
}

export async function submitCheckout(extra: Omit<CreateOrderInput, 'branchId' | 'idempotencyKey' | 'items'>): Promise<CreatedOrder> {
  const cart = readCart();
  if (!cart.length) throw new Error('السلة فارغة');

  const branchId = cart[0].branchId;
  if (cart.some((item) => item.branchId !== branchId)) throw new Error('لا يمكن الطلب من أكثر من فرع في نفس السلة');

  const baseInput: Omit<CreateOrderInput, 'idempotencyKey'> = {
    branchId,
    items: cart.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      modifiers: item.selections.map((selection) => ({ modifierId: selection.optionId })),
      note: item.note,
    })),
    ...extra,
  };

  const order = await createOrder({
    ...baseInput,
    idempotencyKey: keyForCheckout(checkoutFingerprint(baseInput)),
  });

  localStorage.setItem('lmtd_pending_order', JSON.stringify({ id: order.id }));
  return order;
}
