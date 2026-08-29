export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://grand-wisdom-production-5f91.up.railway.app/v1').replace(/\/$/, '');

export type Branch = {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  addressAr?: string | null;
  addressEn?: string | null;
  imageUrl?: string | null;
  prepTimeMin: number;
  prepTimeMax: number;
  acceptsOrders: boolean;
  isOpenOverride?: boolean | null;
};

export type MenuProduct = {
  id: string;
  sku: string;
  nameAr: string;
  nameEn?: string | null;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  price: number;
  isAvailable: boolean;
  soldOutReason?: string | null;
  category?: { id: string; nameAr: string; nameEn?: string | null } | null;
  modifierGroups: Array<{
    id: string;
    nameAr: string;
    nameEn?: string | null;
    selectionType: string;
    minSelect: number;
    maxSelect?: number | null;
    isRequired: boolean;
    options: Array<{ id: string; nameAr: string; nameEn?: string | null; priceDelta: number; isAvailable: boolean }>;
  }>;
};

export type CreateOrderInput = {
  branchId: string;
  pickupMethod: 'WALK_IN' | 'VEHICLE';
  idempotencyKey: string;
  items: Array<{ productId: string; quantity: number; modifiers: Array<{ modifierId: string }>; note?: string }>;
  note?: string;
  vehiclePlate?: string;
  vehicleEmirate?: string;
  vehicleMakeModel?: string;
  vehicleColor?: string;
};

export type CreatedOrder = {
  id: string;
  orderNumber: string;
  status: string;
  pickupMethod: string;
  currency: string;
  subtotal: string | number;
  discountTotal: string | number;
  taxTotal: string | number;
  total: string | number;
  branch: Branch;
};

export async function getBranches(): Promise<Branch[]> {
  const res = await fetch(`${API_URL}/branches`, { cache: 'no-store' });
  if (!res.ok) throw new Error('تعذر تحميل الفروع');
  return res.json();
}

export async function getMenu(branchId: string): Promise<{ branch: { id: string; code: string; nameAr: string; nameEn?: string | null }; products: MenuProduct[] }> {
  const res = await fetch(`${API_URL}/branches/${encodeURIComponent(branchId)}/menu`, { cache: 'no-store' });
  if (!res.ok) throw new Error('تعذر تحميل المنيو');
  return res.json();
}

export async function createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
  const res = await fetch(`${API_URL}/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join('، ') : body?.message;
    throw new Error(message || 'تعذر إنشاء الطلب');
  }
  return res.json();
}
