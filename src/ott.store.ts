import { randomUUID } from 'crypto';

type Entry = {
  value: any;
  expiresAt: number; // epoch ms
};

const store = new Map<string, Entry>();

const DEFAULT_TTL_MS = 2 * 60 * 1000; // 120 שניות

export function createOTT(value: any, ttlMs: number = DEFAULT_TTL_MS) {
  const token = randomUUID().replace(/-/g, '');
  store.set(token, { value, expiresAt: Date.now() + ttlMs });
  return { token, expiresInSec: Math.floor(ttlMs / 1000) };
}

export function consumeOTT(token: string) {
  const e = store.get(token);
  if (!e) return null;
  store.delete(token);
  if (Date.now() > e.expiresAt) return null;
  return e.value;
}

// ניקוי תקופתי (פשוט)
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
}, 30_000);
