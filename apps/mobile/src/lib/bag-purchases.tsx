import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { purchaseUnits, useBag, type BagItem } from '@sleek/shared/bag';
import { getOrderStatus } from './orders';
import { deviceStorage } from './storage';

interface Purchase {
  token: string;
  units: string[];
  created: number;
  paid?: boolean;
}

const key = 'sleek-connect:bag-purchases:v1';
let fallback = '[]';
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => {
  try { return deviceStorage.getItem(key) ?? fallback; }
  catch { return fallback; }
};

function read() {
  try {
    const value: unknown = JSON.parse(snapshot());
    return Array.isArray(value) ? (value as Purchase[]).filter((p) =>
      typeof p?.token === 'string' && Array.isArray(p.units) && p.created > Date.now() - 30 * 86_400_000) : [];
  } catch {
    return [];
  }
}

function save(purchases: Purchase[]) {
  fallback = JSON.stringify(purchases);
  try { deviceStorage.setItem(key, fallback); }
  catch { /* Reconcile in memory if the device cannot persist the bag. */ }
  listeners.forEach((listener) => listener());
}

export function rememberPurchase(token: string, lines: BagItem[]) {
  save([{ token, units: lines.flatMap(purchaseUnits), created: Date.now() }, ...read().filter((order) => order.token !== token)].slice(0, 25));
}

export function markPurchasePaid(token: string) {
  const purchases = read();
  if (purchases.some((purchase) => purchase.token === token && !purchase.paid)) {
    save(purchases.map((purchase) => purchase.token === token ? { ...purchase, paid: true } : purchase));
  }
}

/** Reconciles the device bag even after the checkout screen has closed. Stable unit IDs make it safe to replay. */
export function BagPurchaseSync() {
  const { ready, removePurchased } = useBag();
  const version = useSyncExternalStore(subscribe, snapshot, () => '[]');
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let checking = false;
    async function sync() {
      if (checking || stopped) return;
      checking = true;
      try {
        for (const purchase of read()) {
          if (stopped) break;
          if (!purchase.paid && purchase.created < Date.now() - 3 * 86_400_000) continue;
          const status = purchase.paid ? null : await getOrderStatus(purchase.token).catch(() => null);
          const paid = purchase.paid || (status && status.status !== 'pending_payment' && status.status !== 'cancelled');
          if (paid && !stopped) {
            removePurchased(purchase.units);
            markPurchasePaid(purchase.token);
          }
        }
      } finally {
        checking = false;
      }
    }
    void sync();
    if (!read().some((purchase) => !purchase.paid && purchase.created >= Date.now() - 3 * 86_400_000)) return;
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 60_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void sync(); });
    return () => {
      stopped = true;
      clearInterval(timer);
      listener.remove();
    };
  }, [ready, removePurchased, version]);
  return null;
}
