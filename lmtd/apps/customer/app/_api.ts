import { getCustomerToken } from './_auth';

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

export type OrderItemSnapshot = {
  id: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: string | number;
  lineTotal: string | number;
  modifiersJson?: unknown;
  note?: string | null;
};

export type OrderStatusSnapshot = {
  id: string;
  status: string;
  note?: string | null;
  createdAt: string;
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
  note?: string | null;
  vehiclePlate?: string | null;
  vehicleEmirate?: string | null;
  vehicleMakeModel?: string | null;
  vehicleColor?: string | null;
  createdAt?: string;
  branch: Branch;
  items?: OrderItemSnapshot[];
  statusHistory?: OrderStatusSnapshot[];
};

export type CustomerProfile = {
  id: string;
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  preferredLanguage: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

async function parseError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message.join('، ') : body?.message;
  return message || fallback;
}

function authHeaders(): Record<string, string> {
  const token = getCustomerToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

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
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res, 'تعذر إنشاء الطلب'));
  return res.json();
}

export async function getOrder(orderId: string): Promise<CreatedOrder> {
  const res = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store' });
  if (!res.ok) {
    if (res.status === 404) throw new Error('الطلب غير موجود');
    throw new Error('تعذر تحميل الطلب');
  }
  return res.json();
}

export async function requestOtp(phone: string): Promise<{ ok: boolean; phone: string; expiresInSeconds: number; devCode?: string }> {
  const res = await fetch(`${API_URL}/customer/auth/request-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'تعذر إرسال رمز التحقق'));
  return res.json();
}

export async function verifyOtp(phone: string, code: string): Promise<{ token: string; customer: CustomerProfile }> {
  const res = await fetch(`${API_URL}/customer/auth/verify-otp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) throw new Error(await parseError(res, 'رمز التحقق غير صحيح'));
  return res.json();
}

export async function getMe(): Promise<CustomerProfile> {
  const res = await fetch(`${API_URL}/customer/me`, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(await parseError(res, 'يرجى تسجيل الدخول'));
  return res.json();
}

export async function updateMe(input: { fullName?: string; preferredLanguage?: string }): Promise<CustomerProfile> {
  const res = await fetch(`${API_URL}/customer/me`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res, 'تعذر تحديث الحساب'));
  return res.json();
}

export async function getMyOrders(): Promise<CreatedOrder[]> {
  const res = await fetch(`${API_URL}/customer/orders`, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(await parseError(res, 'يرجى تسجيل الدخول لعرض الطلبات'));
  return res.json();
}

export async function createPaymentSession(orderId: string): Promise<{ provider: string; checkoutUrl: string }> {
  const res = await fetch(`${API_URL}/payments/orders/${encodeURIComponent(orderId)}/session`, { method: 'POST' });
  if (!res.ok) throw new Error(await parseError(res, 'تعذر بدء عملية الدفع'));
  return res.json();
}
