const TOKEN_KEY = 'lmtd_customer_token';
const PHONE_KEY = 'lmtd_login_phone';

export function getCustomerToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setCustomerSession(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  window.dispatchEvent(new Event('lmtd-auth-change'));
}

export function clearCustomerSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PHONE_KEY);
  window.dispatchEvent(new Event('lmtd-auth-change'));
}

export function setPendingPhone(phone: string) {
  localStorage.setItem(PHONE_KEY, phone);
}

export function getPendingPhone() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PHONE_KEY) || '';
}
