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
