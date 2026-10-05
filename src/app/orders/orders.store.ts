/**
 * Persists the Ordini Ufficiali draft in the browser (localStorage) and gates the page behind
 * a shared passphrase — see {@link ORDERS_PASSPHRASE_HASH} for why that's a deterrent, not real
 * access control. Everything here is browser-specific (storage, the unlock flag); the actual
 * rendering is `core/orders.ts`, which this just calls.
 */
import { Injectable, computed, signal } from '@angular/core';
import { STORAGE_PREFIX } from '../../core/config';
import { checkOrdersPassphrase } from '../../core/orders-access';
import { createOrderItem, OrderItem, OrdersDraft, parseIsoDay, renderOrdersMarkdown, resolveOrdersDay } from '../../core/orders';

const ITEMS_KEY = `${STORAGE_PREFIX}orders-items:v1`;
const META_KEY = `${STORAGE_PREFIX}orders-meta:v1`;
const UNLOCKED_KEY = `${STORAGE_PREFIX}orders-unlocked:v1`;
const DAY_KEY = `${STORAGE_PREFIX}orders-day:v1`;

interface OrdersMeta {
  mention: string;
  footerNote: string;
  signature: string;
}

const DEFAULT_META: OrdersMeta = {
  mention: '@Membro Flotta',
  footerNote: 'Qualunque contributo è ben accetto e mai obbligatorio.',
  signature: ':acfs:',
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (e.g. private browsing) — the draft just won't survive a reload.
  }
}

@Injectable({ providedIn: 'root' })
export class OrdersStore {
  private readonly itemsSignal = signal<OrderItem[]>(readJson(ITEMS_KEY, []));
  private readonly metaSignal = signal<OrdersMeta>(readJson(META_KEY, DEFAULT_META));
  private readonly unlockedSignal = signal<boolean>(readJson(UNLOCKED_KEY, false));
  /** `YYYY-MM-DD`: the day the orders are for — tomorrow unless the user picked another (see {@link resolveOrdersDay}). */
  private readonly daySignal = signal<string>(resolveOrdersDay(readJson<string | null>(DAY_KEY, null), new Date()));

  readonly items = this.itemsSignal.asReadonly();
  readonly meta = this.metaSignal.asReadonly();
  readonly unlocked = this.unlockedSignal.asReadonly();
  readonly day = this.daySignal.asReadonly();

  /** The full report, ready to copy — see `core/orders.ts`. */
  readonly markdown = computed(() => {
    const date = parseIsoDay(this.daySignal()) ?? new Date();
    const draft: OrdersDraft = { date, items: this.itemsSignal(), ...this.metaSignal() };
    return renderOrdersMarkdown(draft);
  });

  async unlock(passphrase: string): Promise<boolean> {
    const ok = await checkOrdersPassphrase(passphrase);
    if (ok) {
      this.unlockedSignal.set(true);
      writeJson(UNLOCKED_KEY, true);
    }
    return ok;
  }

  lock(): void {
    this.unlockedSignal.set(false);
    writeJson(UNLOCKED_KEY, false);
  }

  addItem(section: OrderItem['section'], typeKey: string): OrderItem {
    const item = createOrderItem(section, typeKey);
    this.pushItem(item);
    return item;
  }

  /** Adds an already-built item — the "Aggiungi agli ordini" table action uses this. */
  addDraftItem(draft: OrderItem): void {
    this.pushItem(draft);
  }

  addDraftItems(drafts: readonly OrderItem[]): void {
    this.setItems([...this.itemsSignal(), ...drafts]);
  }

  updateItem(id: string, patch: Partial<OrderItem>): void {
    this.setItems(this.itemsSignal().map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  /** Swaps in a whole new version of an item (same id) — for changes computed in `core/orders.ts`. */
  replaceItem(next: OrderItem): void {
    this.setItems(this.itemsSignal().map(item => (item.id === next.id ? next : item)));
  }

  removeItem(id: string): void {
    this.setItems(this.itemsSignal().filter(item => item.id !== id));
  }

  clearAll(): void {
    this.setItems([]);
  }

  /** Sets the day the orders are for; an empty or invalid value goes back to the default (tomorrow). */
  setDay(value: string): void {
    const day = parseIsoDay(value) ? value : resolveOrdersDay(null, new Date());
    this.daySignal.set(day);
    writeJson(DAY_KEY, day);
  }

  updateMeta(patch: Partial<OrdersMeta>): void {
    const next = { ...this.metaSignal(), ...patch };
    this.metaSignal.set(next);
    writeJson(META_KEY, next);
  }

  private pushItem(item: OrderItem): void {
    this.setItems([...this.itemsSignal(), item]);
  }

  private setItems(items: OrderItem[]): void {
    this.itemsSignal.set(items);
    writeJson(ITEMS_KEY, items);
  }
}
