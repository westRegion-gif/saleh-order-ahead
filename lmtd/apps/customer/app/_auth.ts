const TOKEN_KEY = 'lmtd_customer_token';
const CUSTOMER_KEY = 'lmtd_customer_profile';

export type CustomerProfile = {
  id: string;
  phone?: string | null;
  email?: string | null;
  fullName?: string | null;
  preferredLanguage?: string;
};

export function readCustomerToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function saveCustomerSession(accessToken: string, customer: CustomerProfile) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
  window.dispatchEvent(new Event('lmtd-auth-change'));
}

export function readCustomerProfile(): CustomerProfile | null {
  if (typeof window === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(CUSTOMER_KEY) || 'null') as CustomerProfile | null; } catch { return null; }
}

export function clearCustomerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_KEY);
  localStorage.removeItem('lmtd_pending_order');
  localStorage.removeItem('lmtd_checkout_key');
  window.dispatchEvent(new Event('lmtd-auth-change'));
}
