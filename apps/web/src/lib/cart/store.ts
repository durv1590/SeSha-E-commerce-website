'use client';

import type { CartDto, CartSummaryDto } from '@seshakart/types';
import { useSyncExternalStore } from 'react';
import { api, hasSession } from '../api/browser';

/**
 * Client-side mirror of the shopper's cart count and wishlist, for header badges
 * and heart icons. The server stays the source of truth: every change goes through
 * the API, and the store only records what the API returned.
 *
 * Other tabs are kept in step with a BroadcastChannel; other devices on the next
 * page load or when this tab regains focus.
 */
interface State {
  /** Units in the cart; null until first loaded. */
  cartCount: number | null;
  /** Wishlisted product ids; null for guests or until loaded. */
  wishlist: ReadonlySet<string> | null;
}

type Message = { type: 'cart'; count: number } | { type: 'wishlist'; ids: string[] };

let state: State = { cartCount: null, wishlist: null };
const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;
let started = false;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function broadcast(msg: Message) {
  try {
    channel?.postMessage(msg);
  } catch {
    // channel closed: other tabs catch up on focus
  }
}

async function loadCount() {
  try {
    set({ cartCount: (await api.get<CartSummaryDto>('/cart/summary')).count });
  } catch {
    // the badge is a convenience; the cart page shows real errors
  }
}

async function loadWishlist() {
  if (!hasSession()) return set({ wishlist: null });
  try {
    set({ wishlist: new Set(await api.get<string[]>('/wishlist/ids')) });
  } catch {
    set({ wishlist: null });
  }
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('sk-cart');
    channel.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.type === 'cart') set({ cartCount: e.data.count });
      else set({ wishlist: new Set(e.data.ids) });
    };
  }
  window.addEventListener('focus', () => {
    void loadCount();
    void loadWishlist();
  });
  void loadCount();
  void loadWishlist();
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const serverState: State = { cartCount: null, wishlist: null };

export function useCartState(): State {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => serverState,
  );
}

/** Record a cart the API just returned (count excludes saved-for-later lines). */
export function cartChanged(cart: CartDto) {
  const count = cart.items.reduce((s, i) => s + i.quantity, 0);
  set({ cartCount: count });
  broadcast({ type: 'cart', count });
}

export async function addToCart(variantId: string, quantity = 1): Promise<CartDto> {
  const cart = await api.post<CartDto>('/cart/items', { variantId, quantity });
  cartChanged(cart);
  return cart;
}

function wishlistChanged(ids: string[]) {
  set({ wishlist: new Set(ids) });
  broadcast({ type: 'wishlist', ids });
}

export async function toggleWishlist(productId: string, on: boolean): Promise<void> {
  const ids = on
    ? await api.post<string[]>('/wishlist', { productId })
    : await api.delete<string[]>(`/wishlist/${productId}`);
  wishlistChanged(ids);
}

/** After the wishlist page removes or moves items. */
export function setWishlist(ids: string[]) {
  wishlistChanged(ids);
}

/** Re-read both from the server (e.g. after signing in or out). */
export function refreshCartState() {
  void loadCount();
  void loadWishlist();
}
