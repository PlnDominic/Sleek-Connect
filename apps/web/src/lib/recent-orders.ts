/** Orders opened on this device, newest first, so /track can list them without typing anything. Browser only. */
const KEY = 'sleek-connect:recent-orders:v1';
const MAX = 8;

export interface RecentOrder {
  token: string;
  orderNumber: string;
}

export function readRecentOrders(): RecentOrder[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter((v): v is RecentOrder => typeof v?.token === 'string' && typeof v?.orderNumber === 'string').slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberOrder(order: RecentOrder) {
  try {
    const next = [order, ...readRecentOrders().filter((o) => o.token !== order.token)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the list just isn't kept.
  }
}

export function forgetRecentOrders() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
